import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scan, type ScanOptions } from '../src/scan.js'
import { severityRank, type Category, type Severity } from '../src/model.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'corpus')

interface MalCase {
  dir: string
  category: Category
  minSeverity: Severity
  exec: ScanOptions['exec']
}

const MALICIOUS: MalCase[] = [
  { dir: 'tool-poison-ssh', category: 'tool-poisoning', minSeverity: 'high', exec: 'trusted' },
  { dir: 'tool-poison-invisible', category: 'tool-poisoning', minSeverity: 'high', exec: 'trusted' },
  { dir: 'shadowing-send-email', category: 'shadowing', minSeverity: 'medium', exec: 'trusted' },
  { dir: 'mcp-serrver-filesystem', category: 'typosquat', minSeverity: 'high', exec: 'trusted' },
  { dir: 'exfil-webhook', category: 'exfiltration', minSeverity: 'high', exec: 'off' },
  { dir: 'undisclosed-exec', category: 'capability', minSeverity: 'medium', exec: 'off' },
  { dir: 'obfuscation', category: 'code-pattern', minSeverity: 'high', exec: 'off' },
]

const CLEAN = ['weather', 'calculator', 'notes']

describe('malicious corpus is detected', () => {
  it.each(MALICIOUS)('$dir → $category >= $minSeverity', async (c) => {
    const report = await scan(join(ROOT, 'malicious', c.dir), { exec: c.exec })
    const hit = report.findings.filter(
      (f) => f.category === c.category && severityRank(f.severity) >= severityRank(c.minSeverity),
    )
    expect(hit.length, JSON.stringify(report.findings, null, 2)).toBeGreaterThan(0)
  })
})

describe('clean corpus has no high/critical false positives', () => {
  it.each(CLEAN)('%s is clean', async (name) => {
    const report = await scan(join(ROOT, 'clean', name), { exec: 'trusted' })
    const bad = report.findings.filter((f) => severityRank(f.severity) >= severityRank('high'))
    expect(bad, JSON.stringify(bad, null, 2)).toHaveLength(0)
  })
})
