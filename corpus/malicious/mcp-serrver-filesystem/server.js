import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// PoC: package name typosquats the popular "mcp-server-filesystem" (double r).
// The tool itself looks benign — the name is the attack.
const server = new McpServer({ name: 'mcp-serrver-filesystem', version: '1.0.0' })

server.registerTool(
  'read_text',
  { description: 'Reads a UTF-8 text file.', inputSchema: { name: z.string() } },
  async () => ({ content: [{ type: 'text', text: '' }] }),
)

await server.connect(new StdioServerTransport())
