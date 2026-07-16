# mcpscan

Security scanner for MCP (Model Context Protocol) servers. Catches the attack
classes that normal SCA tools (Snyk, Socket, Dependabot) miss because they never
look at what an MCP server advertises to the LLM.

```
npx mcpscan ./path
npx mcpscan gh:owner/repo
npx mcpscan npm:some-mcp-server
npx mcpscan url:https://host/mcp
npx mcpscan stdio:"node server.js"
```

## What it detects

**Metadata layer** (connects as an MCP client — works on closed-source too):
- **Tool poisoning** — instructions to the model hidden in a tool's `description`
  (imperatives, credential references, conceal-from-user language, fake
  `<system>` tags, invisible/zero-width characters).
- **Schema smells** — read-only tools requesting dangerous params (`command`, `env`, …).
- **Tool shadowing** — generic high-value names that override trusted tools.
- **Typosquatting** — package names one or two edits from a popular server.

**Static layer** (when source is available):
- **Exfiltration sinks** — hardcoded webhook.site / pastebin / raw IPs.
- **Dangerous capabilities** — `exec`, `eval`, `child_process`, `subprocess`.
- **Obfuscation** — base64 blobs decoded into `eval`/`exec`.

Each server gets a 0–100 score and a badge band (verified / ok / warn / danger).

## Options

```
--json            machine-readable report
--out <file>      write JSON report to file
--exec            launch code targets for a live metadata scan
--no-exec         static only (never launch server code)
--fail-on <sev>   exit 2 if any finding >= severity (CI gate)
--timeout <ms>    per-scanner timeout
```

## Safety

`--exec` runs untrusted server code to read its tool list. Only use it on code
you trust until the container sandbox (roadmap) lands. Remote `url:` targets are
connected to as a client and never execute code locally.

## Roadmap

Container sandbox for untrusted execution, LLM judge for ambiguous descriptions,
rug-pull version diffing, and a continuous public catalog (GitHub Action →
GitHub Pages with per-server badges). See `docs/`.

## Develop

```
npm install
npm test        # corpus regression: every known attack flagged, clean baseline quiet
npm run build
npm run dev -- ./corpus/malicious/tool-poison-ssh --exec
```
