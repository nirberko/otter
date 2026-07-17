# Security Policy

mcpscan is a security tool. We hold the project itself to the standard it
checks others against.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Report privately through GitHub's [private vulnerability
reporting](https://github.com/nirberko/otter/security/advisories/new), or email
**nir.berko@clutch.security**.

Please include:

- what the issue is and where (file / component / CLI flag),
- steps to reproduce or a proof of concept,
- the impact you foresee.

We aim to acknowledge reports within **3 business days** and to ship a fix or a
mitigation plan within **30 days** for confirmed issues. We will credit
reporters in the release notes unless you ask us not to.

## Scope

In scope:

- the `mcpscan` CLI and its scanners (`src/`),
- the catalog pipeline and the published site/API,
- our GitHub Actions workflows and release process.

Out of scope: findings that mcpscan reports about *third-party MCP servers* —
those are the tool working as intended. To dispute a scan result (e.g. a false
positive), use the false-positive issue template instead.

## A note on `--exec`

`mcpscan --exec` launches target server code to read its live tool list. Until
the container sandbox lands (see `ROADMAP.md`), only run `--exec` on code you
trust. This is a known limitation, not a vulnerability report.

## Supported versions

Only the latest released version on npm receives security fixes.
