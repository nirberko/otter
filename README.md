<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="logo-dark.svg">
    <img alt="mcpscan" src="logo-light.svg" width="240">
  </picture>
</p>

# mcpscan

[![ci](https://github.com/nirberko/otter/actions/workflows/ci.yml/badge.svg)](https://github.com/nirberko/otter/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcpscan)](https://www.npmjs.com/package/mcpscan)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![catalog](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fnirberko.github.io%2Fotter%2Fregistry.json&query=%24.count&label=servers%20scanned)](https://nirberko.github.io/otter/)

Security scanner for MCP (Model Context Protocol) servers. Catches the attack
classes that normal SCA tools (Snyk, Socket, Dependabot) miss because they never
look at what an MCP server advertises to the LLM.

Every server in the [official MCP registry](https://registry.modelcontextprotocol.io)
is continuously scanned and published, with scores and per-server badges, in the
public **[MCP Security Catalog](https://nirberko.github.io/otter/)**.

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
  `<system>` tags, invisible/zero-width characters, pressure/override language).
- **Unicode-tag smuggling** — decodes payloads hidden in the Unicode Tags block
  (U+E0000+) and escalates to critical when the decoded text is an instruction.
- **Toxic flows** — flags the "lethal trifecta": a server whose tools together
  read untrusted content, touch private data, and reach an external sink (an
  injected comment/email can then steer the model into exfiltrating secrets).
- **Rug pulls** — with `--baseline`, diffs a tool's description against a prior
  scan and flags silent changes, renames, and removals with before/after text.
- **Nondeterministic tool sets** — re-polls `tools/list` and flags servers that
  serve a different set on the second call (review-then-swap).
- **Schema smells** — read-only tools requesting dangerous params (`command`, `env`, …).
- **Tool shadowing** — generic high-value names that override trusted tools.
- **Typosquatting** — package names one or two edits from a popular server.
- **LLM judge** (opt-in `--llm`) — a second opinion from a model on ambiguous
  descriptions, via OpenRouter (free NVIDIA Nemotron 3 Ultra).

**Static layer** (when source is available):
- **Exfiltration sinks** — hardcoded webhook.site / pastebin / raw IPs.
- **Dangerous capabilities** — `exec`, `eval`, `child_process`, `subprocess`.
- **Obfuscation** — base64 blobs decoded into `eval`/`exec`.

Each server gets a 0–100 score and a badge band (verified / ok / warn / danger).
Reports export as terminal, JSON, or **SARIF** (`--format sarif`) for GitHub code scanning.

## Options

```
--format <fmt>    output format: terminal (default) | json | sarif
--json            alias for --format json
--out <file>      write the report (in --format) to file
--exec            launch code targets for a live metadata scan
--no-exec         static only (never launch server code)
--llm             second-opinion LLM review (needs OPENROUTER_API_KEY)
--baseline <file> compare tools against a previous JSON report (rug-pull check)
--fail-on <sev>   exit 2 if any finding >= severity (CI gate)
--timeout <ms>    per-scanner timeout
```

## Safety

`--exec` runs untrusted server code to read its tool list. Only use it on code
you trust until the container sandbox (roadmap) lands. Remote `url:` targets are
connected to as a client and never execute code locally.

## Catalog & public API

The [catalog](https://nirberko.github.io/otter/) exposes free, static, CDN-served
JSON — no key, no rate limit:

```
GET /registry.json               full catalog, one stable record per server
GET /api/server/<slug>.json      a single server's scan record
GET /api/badge/<slug>.json       shields.io endpoint for the score badge
```

**Server authors:** embed your badge (copy-paste Markdown is on each server's
catalog page):

```markdown
[![mcpscan](https://nirberko.github.io/otter/badge/<slug>.svg)](https://nirberko.github.io/otter/server/<slug>.html)
```

## Roadmap

See [`ROADMAP.md`](ROADMAP.md) — GitHub Action, `mcpscan audit` for your own
MCP client config, weekly rug-pull reports, and a container sandbox for
untrusted execution.

## Develop

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

```
npm install
npm test        # corpus regression: every known attack flagged, clean baseline quiet
npm run build
npm run dev -- ./corpus/malicious/tool-poison-ssh --exec
```
