import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scan } from '../src/scan.js'
import { SCANNER_VERSION, CHECKS_VERSION } from '../src/version.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'corpus')

describe('scanner version stamping', () => {
  it('stamps the current scanner + checks version into the report', async () => {
    const report = await scan(join(ROOT, 'malicious', 'exfil-webhook'), { exec: 'off' })
    expect(report.scanner.version).toBe(SCANNER_VERSION)
    expect(report.scanner.rules).toBe(String(CHECKS_VERSION))
  })
})
