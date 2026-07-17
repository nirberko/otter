# Roadmap

mcpscan's edge is the **continuously-scanned catalog of the entire MCP
registry** — nobody else has continuous scans of every published server. The
roadmap turns that dataset into things developers and companies depend on.

Done and shipping (see `CHANGELOG.md`): the scanner, SARIF/JSON output, the
`--fail-on` CI gate, the officiality classifier, and the public catalog + badges
+ JSON API.

## Next

### GitHub Action
A Marketplace-listed composite action wrapping the CLI: scan a repo, upload
SARIF to GitHub code scanning, gate on `--fail-on`, and diff against a cached
previous scan for automatic **rug-pull detection in CI**. Turns the CLI from
"something you remember to run" into a checkbox in every MCP server repo.

### `mcpscan audit` — scan your own MCP client config
A subcommand that discovers Claude Desktop / Claude Code / Cursor / Windsurf /
VS Code MCP configs, resolves each configured server, and reports: instant
verdict from the catalog if known, live scan otherwise, plus a rug-pull diff
against the catalog's last-known tool descriptions. Answers the question every
MCP user actually has — *"am I running anything dangerous right now?"*

### Weekly MCP Registry Security Report
`data/changed.json` already tracks daily tool-description diffs across the whole
registry. Surface it: per-server change feeds (RSS) and an auto-generated weekly
report — new malicious findings, silently-changed tools, score movements —
published to the site and GitHub Discussions.

### False-positive story
Inline suppressions (`.mcpscanignore` with required justifications), confidence
levels on findings, and a published precision/recall page measured against the
`corpus/` malicious + clean sets in CI. Scanners get uninstalled over false
positives, not missing features.

## Later

### Container sandbox for `--exec`
Run `stdio:`/code targets inside a network-isolated, read-only container so
untrusted server code never touches the host. Removes the biggest caveat in any
security review of mcpscan itself. (`src/sandbox/` is the seam.)

### Registry partnership
Offer scan results and a malicious-listing disclosure channel to the
registry.modelcontextprotocol.io maintainers — move from third-party observer to
ecosystem infrastructure.

### Research publication
A data-driven report from the catalog: prevalence of toxic-flow trifectas,
poisoning attempts, unicode smuggling, official-vs-community risk split, and
rug-pulls observed over time — with responsible disclosure of live malicious
servers found.

### Governance & bus-factor
Move to a GitHub org, recruit co-maintainers (best sourced from corpus/FP
contributors), OpenSSF Best Practices badge, and split the catalog data out of
the tool repo so it stays clonable.
