# Contributing to mcpscan

Thanks for helping make MCP servers safer to install.

## Development setup

```bash
npm install
npm run build
npm test        # corpus regression: every known attack flagged, clean baseline quiet
npm run lint    # biome
npm run dev -- ./corpus/malicious/tool-poison-ssh --exec
```

Node >= 20 is required. The scanner is ESM TypeScript, formatted and linted with
[Biome](https://biomejs.dev/) (`npm run format`).

## Commit messages — this matters

Releases are fully automated by [semantic-release](https://semantic-release.gitbook.io/),
driven by [Conventional Commits](https://www.conventionalcommits.org/). Your
commit subjects decide the next version and CHANGELOG entry:

- `fix: …` → patch release
- `feat: …` → minor release
- `feat!: …` or a `BREAKING CHANGE:` footer → major release
- `chore: … / docs: … / test: …` → no release

PRs are squash-merged, so the **PR title** must be a valid Conventional Commit.

## Adding a detection

Detection rules live in `src/rules/`. When you add or change one:

1. Add a positive sample under `corpus/malicious/` (the attack must be flagged).
2. Add a negative sample under `corpus/clean/` if the pattern risks false
   positives (it must stay quiet).
3. `test/corpus.test.ts` asserts both directions automatically — run `npm test`.

This corpus is our accuracy contract. A rule without a corpus sample won't be
merged.

## Reporting a false positive

Found a legitimate server flagged incorrectly? Open a **False positive** issue
(template provided). Good FP reports become clean-corpus samples and directly
improve precision.

## Pull requests

- Keep PRs focused; one logical change each.
- `npm run build && npm test && npm run lint` must pass (CI enforces this).
- Update `README.md` / `ROADMAP.md` when you change user-facing behavior.

## Security issues

Do **not** file security vulnerabilities as public issues — see
[`SECURITY.md`](SECURITY.md).

By contributing you agree your contributions are licensed under Apache-2.0.
