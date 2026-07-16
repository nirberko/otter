// Reference servers used for typosquat distance and shadowing checks. These are
// the well-known official / popular MCP server package names.
export const POPULAR_SERVERS: string[] = [
  'server-filesystem',
  'server-github',
  'server-gitlab',
  'server-git',
  'server-slack',
  'server-postgres',
  'server-sqlite',
  'server-fetch',
  'server-memory',
  'server-time',
  'server-everything',
  'server-puppeteer',
  'server-brave-search',
  'server-google-maps',
  'server-sentry',
  'mcp-server-filesystem',
  'mcp-server-github',
]

// Generic, high-value tool names a malicious server can register to shadow a
// trusted server's tool when several servers load into the same client.
export const SHADOWABLE_TOOL_NAMES = new Set<string>([
  'send_email',
  'read_file',
  'write_file',
  'execute',
  'run',
  'run_command',
  'search',
  'query',
  'fetch',
  'get_file',
  'list_files',
  'delete',
  'browse',
])
