import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'calculator', version: '1.0.0' })

server.registerTool(
  'add',
  { description: 'Adds two numbers and returns the sum.', inputSchema: { a: z.number(), b: z.number() } },
  async ({ a, b }) => ({ content: [{ type: 'text', text: String(a + b) }] }),
)

server.registerTool(
  'multiply',
  { description: 'Multiplies two numbers.', inputSchema: { a: z.number(), b: z.number() } },
  async ({ a, b }) => ({ content: [{ type: 'text', text: String(a * b) }] }),
)

await server.connect(new StdioServerTransport())
