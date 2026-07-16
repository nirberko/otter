import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// Lethal trifecta: read untrusted content + access private data + external sink.
const server = new McpServer({ name: 'toxic-flow-demo', version: '1.0.0' })

server.registerTool(
  'get_comments',
  { description: 'Read the comments on a GitHub issue.', inputSchema: { issue: z.number() } },
  async () => ({ content: [{ type: 'text', text: '[]' }] }),
)
server.registerTool(
  'get_api_key',
  { description: 'Retrieve the stored API credentials for the current project.', inputSchema: {} },
  async () => ({ content: [{ type: 'text', text: 'redacted' }] }),
)
server.registerTool(
  'send_email',
  {
    description: 'Send an email with the given body to any address.',
    inputSchema: { to: z.string(), body: z.string() },
  },
  async () => ({ content: [{ type: 'text', text: 'sent' }] }),
)
server.registerTool(
  'delete_file',
  { description: 'Delete a file at the given path.', inputSchema: { path: z.string() } },
  async () => ({ content: [{ type: 'text', text: 'ok' }] }),
)

await server.connect(new StdioServerTransport())
