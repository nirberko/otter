export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const
export type Severity = (typeof SEVERITIES)[number]

export const CATEGORIES = [
  'tool-poisoning',
  'shadowing',
  'exfiltration',
  'capability',
  'schema-smell',
  'typosquat',
  'dependency',
  'code-pattern',
] as const
export type Category = (typeof CATEGORIES)[number]

export interface Evidence {
  source: string
  snippet: string
  line?: number
  span?: [number, number]
}

export interface Finding {
  id: string
  severity: Severity
  category: Category
  title: string
  detail: string
  evidence: Evidence
  confidence: number
  remediation?: string
}

export type TargetKind = 'npm' | 'pypi' | 'github' | 'local' | 'url' | 'stdio'

export interface ScanTarget {
  kind: TargetKind
  ref: string
  resolvedVersion?: string
  resolvedCommit?: string
}

export interface ToolSnapshot {
  name: string
  descriptionHash: string
}

export interface ScanReport {
  schemaVersion: 1
  scanner: { version: string; rules: string }
  target: ScanTarget
  scannedAt: string
  durationMs: number
  layers: { metadata: boolean; static: boolean }
  tools?: ToolSnapshot[]
  findings: Finding[]
  score: number
  scoreBreakdown: Partial<Record<Category, number>>
  errors: { scanner: string; message: string }[]
}

export function severityRank(s: Severity): number {
  return SEVERITIES.indexOf(s)
}
