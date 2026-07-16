import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import type { Finding } from '../model.js'
import { EXFIL_HOSTS, IPV4_RE, URL_RE, isPrivateIp } from '../rules/sinks.js'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.venv', '__pycache__'])
const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.json'])
const MAX_FILE_BYTES = 2_000_000

interface CapRule {
  id: string
  re: RegExp
  title: string
  severity: Finding['severity']
}

// Capability patterns. Presence alone isn't proof of malice — a shell server
// legitimately execs — so these are medium unless combined with other signals.
const CAP_RULES: CapRule[] = [
  { id: 'MCP-CAP-001', re: /child_process|require\(['"]child_process['"]\)/, title: 'Spawns child processes', severity: 'medium' },
  { id: 'MCP-CAP-002', re: /\bexec(?:Sync)?\s*\(|\bspawn(?:Sync)?\s*\(/, title: 'Executes shell commands', severity: 'medium' },
  { id: 'MCP-CAP-003', re: /\beval\s*\(|new\s+Function\s*\(/, title: 'Dynamic code evaluation (eval/Function)', severity: 'high' },
  { id: 'MCP-CAP-004', re: /\bvm\.runIn|require\(['"]vm['"]\)/, title: 'Uses vm module', severity: 'medium' },
  { id: 'MCP-CAP-005', re: /\b(subprocess|os\.system|os\.popen|Popen)\b/, title: 'Executes shell commands (python)', severity: 'medium' },
]

async function walk(dir: string, root: string, out: string[]): Promise<void> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(full, root, out)
    } else if (entry.isFile() && CODE_EXT.has(extname(entry.name))) {
      out.push(full)
    }
  }
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

export interface StaticResult {
  findings: Finding[]
  filesScanned: number
}

export async function scanStatic(root: string): Promise<StaticResult> {
  const files: string[] = []
  await walk(root, root, files)
  const findings: Finding[] = []

  for (const file of files) {
    const info = await stat(file).catch(() => null)
    if (!info || info.size > MAX_FILE_BYTES) continue
    const rel = relative(root, file)
    const text = await readFile(file, 'utf8').catch(() => '')
    if (!text) continue

    findings.push(...scanExfil(text, rel))
    findings.push(...scanCapabilities(text, rel))
    findings.push(...scanObfuscation(text, rel))
  }

  return { findings, filesScanned: files.length }
}

function scanExfil(text: string, file: string): Finding[] {
  const findings: Finding[] = []

  for (const m of text.matchAll(URL_RE)) {
    const url = m[0]
    const host = EXFIL_HOSTS.find((h) => url.toLowerCase().includes(h))
    if (host) {
      findings.push({
        id: 'MCP-EXFIL-001',
        severity: 'high',
        category: 'exfiltration',
        title: 'Hardcoded known exfiltration endpoint',
        detail: `Source references "${host}", a host commonly used to receive exfiltrated data.`,
        evidence: { source: file, snippet: url.slice(0, 120), line: lineOf(text, m.index ?? 0) },
        confidence: 0.85,
      })
    }
  }

  for (const m of text.matchAll(IPV4_RE)) {
    const ip = m[0]
    if (!isPrivateIp(ip) && !/^\d+\.\d+$/.test(ip)) {
      findings.push({
        id: 'MCP-EXFIL-002',
        severity: 'low',
        category: 'exfiltration',
        title: 'Hardcoded public IP address',
        detail: `Source hardcodes public IP ${ip}. Verify it is not an exfiltration destination.`,
        evidence: { source: file, snippet: ip, line: lineOf(text, m.index ?? 0) },
        confidence: 0.3,
      })
    }
  }

  return findings
}

function scanCapabilities(text: string, file: string): Finding[] {
  const findings: Finding[] = []
  for (const rule of CAP_RULES) {
    const m = rule.re.exec(text)
    if (m) {
      findings.push({
        id: rule.id,
        severity: rule.severity,
        category: 'capability',
        title: rule.title,
        detail: `${rule.title} in ${file}. Confirm this is disclosed by the server's tool descriptions.`,
        evidence: { source: file, snippet: m[0], line: lineOf(text, m.index) },
        confidence: 0.5,
      })
    }
  }
  return findings
}

const BASE64_BLOB_RE = /['"`][A-Za-z0-9+/]{120,}={0,2}['"`]/
const B64_EXEC_RE = /(atob|Buffer\.from)\s*\([^)]*base64|base64\.b64decode/i

function scanObfuscation(text: string, file: string): Finding[] {
  const findings: Finding[] = []
  const blob = BASE64_BLOB_RE.exec(text)
  if (blob) {
    findings.push({
      id: 'MCP-OBFUSCATE-001',
      severity: 'medium',
      category: 'code-pattern',
      title: 'Large encoded blob in source',
      detail: `${file} contains a long base64-like literal, sometimes used to hide payloads.`,
      evidence: { source: file, snippet: `${blob[0].slice(0, 60)}…`, line: lineOf(text, blob.index) },
      confidence: 0.35,
    })
  }
  if (B64_EXEC_RE.test(text) && /eval|exec|Function/.test(text)) {
    findings.push({
      id: 'MCP-OBFUSCATE-002',
      severity: 'high',
      category: 'code-pattern',
      title: 'Decoded data flows into code execution',
      detail: `${file} decodes base64 and appears to execute it — a classic obfuscated-payload pattern.`,
      evidence: { source: file, snippet: 'base64 → eval/exec' },
      confidence: 0.6,
    })
  }
  return findings
}
