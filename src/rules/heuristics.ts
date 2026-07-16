import type { Finding } from '../model.js'
import { scanHidden } from '../util/unicode.js'
import { SENSITIVE_TOKENS } from './sensitive.js'

// Instructions aimed at the *model* rather than descriptions of the tool.
const META_INSTRUCTION_RE =
  /\b(ignore (all |the )?(previous|prior|above)|disregard (the |all )?(previous|prior|above)|do not (tell|mention|inform|reveal|show)|don'?t (tell|mention|reveal)|before (using|calling|responding|answering)|first,?\s+(read|fetch|send|open|load)|you must (always|first|not)|as an ai|system\s*:|<system>|<important>|\[inst\]|new instructions|actual instructions)\b/i

// Language telling the model to conceal behavior from the user.
const CONCEAL_RE =
  /\b(do not (reveal|show|log|display|tell)|without (telling|informing|notifying)|keep (this|it) (secret|hidden)|don'?t let the user|silently)\b/i

// Structural tags that impersonate system/tool framing inside a description.
const FAKE_TAG_RE = /<\/?(system|important|instructions?|secret|admin)>|\[\/?inst\]/i

interface DescInput {
  toolName: string
  description: string
}

function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

// Analyze one tool/prompt description for poisoning signals. `medianLen` lets us
// flag anomalously long descriptions relative to the server's other tools.
export function analyzeDescription(input: DescInput, medianLen: number): Finding[] {
  const { toolName, description } = input
  const findings: Finding[] = []
  if (!description) return findings

  const hidden = scanHidden(description)
  if (hidden.hasHidden) {
    findings.push({
      id: 'MCP-TOOL-POISON-004',
      severity: 'high',
      category: 'tool-poisoning',
      title: 'Hidden characters in tool description',
      detail: `Description of "${toolName}" contains ${hidden.count} invisible/zero-width or bidi character(s). Legitimate descriptions have no reason to hide text the model still reads.`,
      evidence: { source: `tool:${toolName}`, snippet: excerpt(hidden.annotated) },
      confidence: 0.95,
      remediation: 'Reject or manually review this server before installing.',
    })
  }

  if (META_INSTRUCTION_RE.test(description)) {
    findings.push({
      id: 'MCP-TOOL-POISON-001',
      severity: 'high',
      category: 'tool-poisoning',
      title: 'Description issues instructions to the model',
      detail: `Description of "${toolName}" contains imperative instructions directed at the AI assistant rather than describing the tool. This is the core tool-poisoning technique.`,
      evidence: { source: `tool:${toolName}`, snippet: excerpt(description) },
      confidence: 0.7,
      remediation: 'Treat the server as untrusted; the model may obey embedded instructions.',
    })
  }

  if (CONCEAL_RE.test(description)) {
    findings.push({
      id: 'MCP-TOOL-POISON-002',
      severity: 'high',
      category: 'tool-poisoning',
      title: 'Description tells the model to hide behavior',
      detail: `Description of "${toolName}" instructs the model to conceal actions from the user.`,
      evidence: { source: `tool:${toolName}`, snippet: excerpt(description) },
      confidence: 0.75,
    })
  }

  if (FAKE_TAG_RE.test(description)) {
    findings.push({
      id: 'MCP-TOOL-POISON-005',
      severity: 'medium',
      category: 'tool-poisoning',
      title: 'Description contains system/instruction tags',
      detail: `Description of "${toolName}" embeds tags that impersonate system or instruction framing.`,
      evidence: { source: `tool:${toolName}`, snippet: excerpt(description) },
      confidence: 0.6,
    })
  }

  const lower = description.toLowerCase()
  const referenced = SENSITIVE_TOKENS.filter((t) => lower.includes(t))
  if (referenced.length > 0) {
    findings.push({
      id: 'MCP-TOOL-POISON-003',
      severity: 'high',
      category: 'tool-poisoning',
      title: 'Description references secrets/credentials',
      detail: `Description of "${toolName}" references sensitive artifacts (${referenced.slice(0, 4).join(', ')}). A tool description has no reason to mention credentials.`,
      evidence: { source: `tool:${toolName}`, snippet: excerpt(description) },
      confidence: 0.65,
    })
  }

  if (medianLen > 0 && description.length > Math.max(600, medianLen * 5)) {
    findings.push({
      id: 'MCP-TOOL-POISON-006',
      severity: 'low',
      category: 'tool-poisoning',
      title: 'Anomalously long tool description',
      detail: `Description of "${toolName}" is ${description.length} chars, far longer than this server's median (${medianLen}). Overlong descriptions are a common place to bury instructions.`,
      evidence: { source: `tool:${toolName}`, snippet: excerpt(description) },
      confidence: 0.4,
    })
  }

  return findings
}

// Whether a description passed heuristics but is still worth an LLM second look.
export function warrantsLlmReview(description: string, medianLen: number): boolean {
  if (!description) return false
  return description.length > Math.max(300, medianLen * 3)
}
