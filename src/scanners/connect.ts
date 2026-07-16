import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Inventory, ToolInfo } from './metadata.js'

async function collect(client: Client, serverName: string): Promise<Inventory> {
  const tools: ToolInfo[] = []
  const prompts: { name: string; description?: string }[] = []

  const toolRes = await client.listTools().catch(() => ({ tools: [] }))
  for (const t of toolRes.tools ?? []) {
    tools.push({ name: t.name, description: t.description, inputSchema: t.inputSchema })
  }

  const promptRes = await client.listPrompts().catch(() => ({ prompts: [] }))
  for (const p of promptRes.prompts ?? []) {
    prompts.push({ name: p.name, description: p.description })
  }

  return { serverName, tools, prompts }
}

// Connect to a local stdio MCP server. `env` is passed through explicitly so the
// caller controls what the child process sees (empty for untrusted targets).
export async function connectStdio(opts: {
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  serverName: string
  timeoutMs?: number
}): Promise<Inventory> {
  const client = new Client({ name: 'mcpscan', version: '0.1.0' }, { capabilities: {} })
  const transport = new StdioClientTransport({
    command: opts.command,
    args: opts.args ?? [],
    cwd: opts.cwd,
    env: opts.env ?? {},
  })
  try {
    await withTimeout(client.connect(transport), opts.timeoutMs ?? 30000, 'connect')
    return await withTimeout(collect(client, opts.serverName), opts.timeoutMs ?? 30000, 'list')
  } finally {
    await client.close().catch(() => {})
  }
}

export async function connectUrl(opts: {
  url: string
  serverName: string
  timeoutMs?: number
}): Promise<Inventory> {
  const client = new Client({ name: 'mcpscan', version: '0.1.0' }, { capabilities: {} })
  const transport = new StreamableHTTPClientTransport(new URL(opts.url))
  try {
    await withTimeout(client.connect(transport), opts.timeoutMs ?? 30000, 'connect')
    return await withTimeout(collect(client, opts.serverName), opts.timeoutMs ?? 30000, 'list')
  } finally {
    await client.close().catch(() => {})
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout during ${label} after ${ms}ms`)), ms),
    ),
  ])
}
