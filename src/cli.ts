#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { scan, type ScanOptions } from './scan.js'
import { renderTerminal } from './report/terminal.js'
import { renderJson } from './report/json.js'
import { SEVERITIES, type Severity, severityRank } from './model.js'
import { SCANNER_VERSION, CHECKS_VERSION } from './version.js'

const USAGE = `mcpscan <target> [options]

targets:
  npm:<pkg>[@version]   pypi:<pkg>   gh:<owner>/<repo>[@ref]
  ./path                url:https://host/mcp   stdio:"cmd --args"

options:
  --json               machine-readable report to stdout
  --out <file>         write JSON report to file
  --exec               launch code targets for a live metadata scan (host)
  --no-exec            never launch server code (static only)
  --fail-on <sev>      exit 2 if any finding >= severity (info|low|medium|high|critical)
  --timeout <ms>       per-scanner timeout (default 30000)
  -v, --version        print scanner version + checks fingerprint
  -h, --help`

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      out: { type: 'string' },
      exec: { type: 'boolean', default: false },
      'no-exec': { type: 'boolean', default: false },
      'fail-on': { type: 'string' },
      timeout: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  })

  if (values.version) {
    process.stdout.write(`mcpscan v${SCANNER_VERSION} (checks ${CHECKS_VERSION})\n`)
    return 0
  }

  if (values.help || positionals.length === 0) {
    process.stdout.write(`${USAGE}\n`)
    return values.help ? 0 : 1
  }

  const failOn = values['fail-on'] as Severity | undefined
  if (failOn && !SEVERITIES.includes(failOn)) {
    process.stderr.write(`invalid --fail-on "${failOn}"; use one of ${SEVERITIES.join(', ')}\n`)
    return 1
  }

  const opts: ScanOptions = {
    exec: values['no-exec'] ? 'off' : values.exec ? 'trusted' : undefined,
    timeoutMs: values.timeout ? Number(values.timeout) : undefined,
  }

  const report = await scan(positionals[0], opts)

  if (values.out) await writeFile(values.out, renderJson(report))
  process.stdout.write(values.json ? `${renderJson(report)}\n` : `${renderTerminal(report)}\n`)

  if (failOn) {
    const threshold = severityRank(failOn)
    if (report.findings.some((f) => severityRank(f.severity) >= threshold)) return 2
  }
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(`mcpscan: ${(e as Error).message}\n`)
    process.exit(1)
  })
