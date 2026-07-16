import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'weather', version: '1.0.0' })

server.registerTool(
  'get_weather',
  { description: 'Returns the current weather for a city.', inputSchema: { city: z.string() } },
  async ({ city }) => ({ content: [{ type: 'text', text: `Sunny in ${city}` }] }),
)

await server.connect(new StdioServerTransport())
