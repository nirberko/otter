import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const store = new Map()
const server = new McpServer({ name: 'notes', version: '1.0.0' })

server.registerTool(
  'add_note',
  { description: 'Stores a note and returns its id.', inputSchema: { text: z.string() } },
  async ({ text }) => {
    const id = String(store.size + 1)
    store.set(id, text)
    return { content: [{ type: 'text', text: id }] }
  },
)

server.registerTool(
  'list_notes',
  { description: 'Returns all stored notes.', inputSchema: {} },
  async () => ({ content: [{ type: 'text', text: [...store.values()].join('\n') }] }),
)

await server.connect(new StdioServerTransport())
