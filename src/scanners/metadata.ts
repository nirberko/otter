import type { Finding } from '../model.js'
import { analyzeDescription } from '../rules/heuristics.js'
import { levenshtein } from '../util/levenshtein.js'
import { DANGEROUS_PARAM_NAMES } from '../rules/sensitive.js'
import { POPULAR_SERVERS, SHADOWABLE_TOOL_NAMES } from '../rules/popular.js'

export interface ToolInfo {
  name: string
  description?: string
  inputSchema?: unknown
}

export interface Inventory {
  serverName: string
  tools: ToolInfo[]
  prompts: { name: string; description?: string }[]
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function schemaParamNames(schema: unknown): string[] {
  if (!schema || typeof schema !== 'object') return []
  const props = (schema as { properties?: Record<string, unknown> }).properties
  return props ? Object.keys(props) : []
}

function looksReadOnly(name: string, description = ''): boolean {
  return /\b(get|list|read|search|fetch|show|weather|info|status|lookup)\b/i.test(
    `${name} ${description}`,
  )
}

// Pure analysis of a tool/prompt inventory. Works whether the inventory came
// from a live MCP connection or was parsed from source — no I/O here.
export function analyzeInventory(inv: Inventory): Finding[] {
  const findings: Finding[] = []

  const lengths = inv.tools.map((t) => (t.description ?? '').length).filter((n) => n > 0)
  const medianLen = median(lengths)

  for (const tool of inv.tools) {
    findings.push(
      ...analyzeDescription({ toolName: tool.name, description: tool.description ?? '' }, medianLen),
    )

    const params = schemaParamNames(tool.inputSchema)
    const dangerous = params.filter((p) => DANGEROUS_PARAM_NAMES.includes(p.toLowerCase()))
    if (dangerous.length > 0 && looksReadOnly(tool.name, tool.description)) {
      findings.push({
        id: 'MCP-SCHEMA-SMELL-001',
        severity: 'medium',
        category: 'schema-smell',
        title: 'Read-only tool requests dangerous parameters',
        detail: `Tool "${tool.name}" appears informational but accepts parameters (${dangerous.join(', ')}) that enable code/file/secret access.`,
        evidence: { source: `tool:${tool.name}`, snippet: params.join(', ') },
        confidence: 0.55,
      })
    }

    if (SHADOWABLE_TOOL_NAMES.has(tool.name.toLowerCase())) {
      findings.push({
        id: 'MCP-SHADOW-001',
        severity: 'medium',
        category: 'shadowing',
        title: 'Generic tool name can shadow trusted tools',
        detail: `Tool "${tool.name}" uses a generic high-value name. When multiple servers load together, this can intercept calls meant for a trusted server.`,
        evidence: { source: `tool:${tool.name}`, snippet: tool.name },
        confidence: 0.4,
      })
    }
  }

  for (const prompt of inv.prompts) {
    findings.push(
      ...analyzeDescription(
        { toolName: `prompt:${prompt.name}`, description: prompt.description ?? '' },
        medianLen,
      ),
    )
  }

  findings.push(...typosquatFindings(inv.serverName))
  return findings
}

function normalizeName(name: string): string {
  return name.replace(/^@[^/]+\//, '').replace(/^mcp-/, '')
}

export function typosquatFindings(serverName: string): Finding[] {
  const name = normalizeName(serverName)
  for (const popular of POPULAR_SERVERS) {
    const target = normalizeName(popular)
    if (name === target) return []
    const dist = levenshtein(name, target)
    if (dist >= 1 && dist <= 2) {
      return [
        {
          id: 'MCP-TYPOSQUAT-001',
          severity: 'high',
          category: 'typosquat',
          title: 'Package name resembles a popular server',
          detail: `"${serverName}" is edit-distance ${dist} from the popular server "${popular}". Likely typosquat.`,
          evidence: { source: `package:${serverName}`, snippet: `${serverName} ≈ ${popular}` },
          confidence: 0.7,
        },
      ]
    }
  }
  return []
}
