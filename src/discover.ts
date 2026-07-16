#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'

const REGISTRY = 'https://registry.modelcontextprotocol.io/v0/servers'
const OUT = 'data/servers.json'

export interface ServerEntry {
  id: string
  title?: string
  description?: string
  version?: string
  // Best target string for `mcpscan`, chosen by preference: npm > pypi > remote.
  scanTarget?: string
  sources: { npm?: string; pypi?: string; oci?: string; remote?: string }
  registryStatus?: string
  addedAt: string
  updatedAt?: string
}

interface RegistryServer {
  server: {
    name: string
    title?: string
    description?: string
    version?: string
    packages?: { registryType?: string; identifier: string; version?: string }[]
    remotes?: { type?: string; url: string }[]
  }
  _meta?: {
    'io.modelcontextprotocol.registry/official'?: {
      status?: string
      updatedAt?: string
      isLatest?: boolean
    }
  }
}

function toEntry(raw: RegistryServer, now: string): ServerEntry {
  const s = raw.server
  const sources: ServerEntry['sources'] = {}
  for (const p of s.packages ?? []) {
    if (p.registryType === 'npm' && !sources.npm) sources.npm = p.identifier
    else if (p.registryType === 'pypi' && !sources.pypi) sources.pypi = p.identifier
    else if (p.registryType === 'oci' && !sources.oci) sources.oci = p.identifier
  }
  if (s.remotes?.length) sources.remote = s.remotes[0].url

  let scanTarget: string | undefined
  if (sources.npm) scanTarget = `npm:${sources.npm}`
  else if (sources.pypi) scanTarget = `pypi:${sources.pypi}`
  else if (sources.remote) scanTarget = `url:${sources.remote}`

  const meta = raw._meta?.['io.modelcontextprotocol.registry/official']
  return {
    id: s.name,
    title: s.title,
    description: s.description,
    version: s.version,
    scanTarget,
    sources,
    registryStatus: meta?.status,
    addedAt: now,
    updatedAt: meta?.updatedAt,
  }
}

async function fetchAll(max: number): Promise<RegistryServer[]> {
  const out: RegistryServer[] = []
  let cursor: string | undefined
  do {
    const url = new URL(REGISTRY)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('cursor', cursor)
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`registry ${res.status} ${res.statusText}`)
    const page = (await res.json()) as {
      servers: RegistryServer[]
      metadata?: { nextCursor?: string }
    }
    out.push(...page.servers)
    cursor = page.metadata?.nextCursor
    process.stderr.write(`  fetched ${out.length}\r`)
  } while (cursor && out.length < max)
  process.stderr.write('\n')
  return out.slice(0, max)
}

async function loadExisting(): Promise<Map<string, ServerEntry>> {
  const text = await readFile(OUT, 'utf8').catch(() => '')
  if (!text) return new Map()
  const arr = JSON.parse(text) as ServerEntry[]
  return new Map(arr.map((e) => [e.id, e]))
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { max: { type: 'string' }, out: { type: 'string' } },
  })
  const max = values.max ? Number(values.max) : 5000
  const outPath = values.out ?? OUT
  const now = new Date().toISOString()

  process.stderr.write(`Discovering MCP servers (max ${max})...\n`)
  const raw = await fetchAll(max)

  // Latest wins per id (registry returns multiple versions per server).
  const latest = new Map<string, RegistryServer>()
  for (const r of raw) {
    const isLatest = r._meta?.['io.modelcontextprotocol.registry/official']?.isLatest
    if (!latest.has(r.server.name) || isLatest) latest.set(r.server.name, r)
  }

  const existing = await loadExisting()
  const entries: ServerEntry[] = []
  let added = 0
  let changed = 0
  for (const rawServer of latest.values()) {
    const entry = toEntry(rawServer, now)
    const prev = existing.get(entry.id)
    if (!prev) added++
    else {
      entry.addedAt = prev.addedAt
      if (prev.version !== entry.version) changed++
    }
    entries.push(entry)
  }
  entries.sort((a, b) => a.id.localeCompare(b.id))

  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(entries, null, 2)}\n`)

  const scannable = entries.filter((e) => e.scanTarget).length
  process.stderr.write(
    `\n${entries.length} servers → ${outPath}\n` +
      `  new: ${added}  version-changed: ${changed}  scannable: ${scannable}\n`,
  )
}

main().catch((e) => {
  process.stderr.write(`discover: ${(e as Error).message}\n`)
  process.exit(1)
})
