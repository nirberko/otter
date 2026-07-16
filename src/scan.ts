import { readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import type { Finding, ScanReport } from './model.js'
import { scoreFindings } from './scoring.js'
import { sha256 } from './util/hash.js'
import { resolve, type Resolved } from './resolve/index.js'
import { scanStatic } from './scanners/static.js'
import { analyzeInventory, type Inventory } from './scanners/metadata.js'
import { connectStdio, connectUrl } from './scanners/connect.js'
import { SCANNER_VERSION, CHECKS_VERSION } from './version.js'

export interface ScanOptions {
  // 'off' never launches server code; 'trusted' launches on the host (corpus/dev);
  // 'sandbox' launches inside a container (added in a later milestone).
  exec?: 'off' | 'trusted' | 'sandbox'
  timeoutMs?: number
}

// A launchable entry for a resolved source dir (package.json bin/main).
async function launchFromDir(dir: string): Promise<{ command: string; args: string[] } | null> {
  const pkgPath = join(dir, 'package.json')
  const pkg = await readFile(pkgPath, 'utf8')
    .then((t) => JSON.parse(t) as { bin?: string | Record<string, string>; main?: string })
    .catch(() => null)
  if (!pkg) return null
  let entry: string | undefined
  if (typeof pkg.bin === 'string') entry = pkg.bin
  else if (pkg.bin && typeof pkg.bin === 'object') entry = Object.values(pkg.bin)[0]
  entry = entry ?? pkg.main
  if (!entry) return null
  return { command: process.execPath, args: [join(dir, entry)] }
}

async function getInventory(res: Resolved, opts: ScanOptions): Promise<Inventory> {
  const serverName = res.target.resolvedVersion
    ? res.target.ref.split('@')[0]
    : basename(res.target.ref)

  if (res.url) {
    return connectUrl({ url: res.url, serverName, timeoutMs: opts.timeoutMs })
  }
  if (res.launch) {
    return connectStdio({ ...res.launch, serverName, timeoutMs: opts.timeoutMs })
  }
  if (res.dir && opts.exec && opts.exec !== 'off') {
    const launch = await launchFromDir(res.dir)
    if (launch) {
      return connectStdio({
        command: launch.command,
        args: launch.args,
        cwd: res.dir,
        serverName,
        timeoutMs: opts.timeoutMs,
      })
    }
  }
  throw new Error('no metadata source (need url, stdio, or --exec on a launchable dir)')
}

export async function scan(raw: string, opts: ScanOptions = {}): Promise<ScanReport> {
  const started = Date.now()
  const res = await resolve(raw)
  const findings: Finding[] = []
  const errors: { scanner: string; message: string }[] = []
  const layers = { metadata: false, static: false }
  let tools: ScanReport['tools']

  const wantsMetadata =
    res.url || res.launch || (res.dir && opts.exec && opts.exec !== 'off')
  if (wantsMetadata) {
    try {
      const inv = await getInventory(res, opts)
      findings.push(...analyzeInventory(inv))
      tools = inv.tools.map((t) => ({
        name: t.name,
        descriptionHash: sha256(t.description ?? ''),
      }))
      layers.metadata = true
    } catch (e) {
      errors.push({ scanner: 'metadata', message: (e as Error).message })
    }
  }

  if (res.dir) {
    try {
      const r = await scanStatic(res.dir)
      findings.push(...r.findings)
      layers.static = true
    } catch (e) {
      errors.push({ scanner: 'static', message: (e as Error).message })
    }
  }

  const { score, breakdown } = scoreFindings(findings)

  return {
    schemaVersion: 1,
    scanner: { version: SCANNER_VERSION, rules: String(CHECKS_VERSION) },
    target: res.target,
    scannedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    layers,
    tools,
    findings,
    score,
    scoreBreakdown: breakdown,
    errors,
  }
}
