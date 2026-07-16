#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { scan } from './scan.js'
import { scoreBand } from './scoring.js'
import { slug } from './util/slug.js'
import type { ServerEntry } from './discover.js'
import type { ScanReport, Severity } from './model.js'

const SERVERS = 'data/servers.json'
const RESULTS_DIR = 'data/results'
const SUMMARY = 'data/summary.json'

export interface CatalogRow {
  id: string
  slug: string
  title?: string
  description?: string
  version?: string
  scanTarget?: string
  sources: ServerEntry['sources']
  score: number | null
  band: string
  counts: Partial<Record<Severity, number>>
  layers: ScanReport['layers']
  scannedAt: string
  errors: number
}

// Only these target kinds are safe/supported without a sandbox: npm/pypi read
// source; url connects as a client (no local code execution).
function isScannable(target?: string): boolean {
  return !!target && /^(npm|url):/.test(target)
}

async function pool<T>(items: T[], size: number, fn: (item: T, i: number) => Promise<void>) {
  let cursor = 0
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      await fn(items[i], i)
    }
  })
  await Promise.all(workers)
}

function summarize(report: ScanReport, entry: ServerEntry): CatalogRow {
  const counts: Partial<Record<Severity, number>> = {}
  for (const f of report.findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1
  const scanned = report.layers.metadata || report.layers.static
  return {
    id: entry.id,
    slug: slug(entry.id),
    title: entry.title,
    description: entry.description,
    version: entry.version,
    scanTarget: entry.scanTarget,
    sources: entry.sources,
    score: scanned ? report.score : null,
    band: scanned ? scoreBand(report.score) : 'unknown',
    counts,
    layers: report.layers,
    scannedAt: report.scannedAt,
    errors: report.errors.length,
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      max: { type: 'string' },
      concurrency: { type: 'string' },
      timeout: { type: 'string' },
    },
  })
  const max = values.max ? Number(values.max) : Number.POSITIVE_INFINITY
  const concurrency = values.concurrency ? Number(values.concurrency) : 6
  const timeoutMs = values.timeout ? Number(values.timeout) : 45000

  const servers = JSON.parse(await readFile(SERVERS, 'utf8')) as ServerEntry[]
  const targets = servers.filter((e) => isScannable(e.scanTarget)).slice(0, max)
  await mkdir(RESULTS_DIR, { recursive: true })

  process.stderr.write(`Scanning ${targets.length} servers (concurrency ${concurrency})...\n`)
  const rows: CatalogRow[] = []
  let done = 0

  await pool(targets, concurrency, async (entry) => {
    let report: ScanReport
    try {
      report = await scan(entry.scanTarget as string, { exec: 'off', timeoutMs })
    } catch (e) {
      report = errorReport(entry, (e as Error).message)
    }
    await writeFile(join(RESULTS_DIR, `${slug(entry.id)}.json`), JSON.stringify(report, null, 2))
    rows.push(summarize(report, entry))
    done++
    process.stderr.write(`  ${done}/${targets.length}\r`)
  })

  // Worst (lowest) scores first; unscanned entries sink to the bottom.
  const rank = (s: number | null) => (s === null ? 101 : s)
  rows.sort((a, b) => rank(a.score) - rank(b.score) || a.id.localeCompare(b.id))
  await writeFile(SUMMARY, `${JSON.stringify(rows, null, 2)}\n`)
  process.stderr.write(`\nWrote ${rows.length} results → ${RESULTS_DIR}/ and ${SUMMARY}\n`)
}

function errorReport(entry: ServerEntry, message: string): ScanReport {
  return {
    schemaVersion: 1,
    scanner: { version: '0.1.0', rules: 'builtin' },
    target: { kind: 'npm', ref: entry.scanTarget ?? entry.id },
    scannedAt: new Date().toISOString(),
    durationMs: 0,
    layers: { metadata: false, static: false },
    findings: [],
    score: 0,
    scoreBreakdown: {},
    errors: [{ scanner: 'scan', message }],
  }
}

main().catch((e) => {
  process.stderr.write(`scan-batch: ${(e as Error).message}\n`)
  process.exit(1)
})
