import type { Finding, ScanReport, ToolSnapshot } from "../model.js";
import { scoreFindings } from "../scoring.js";

// A "rug pull" is an MCP server that changes its advertised tool descriptions
// after you've reviewed and installed it. We detect it by diffing a fresh scan's
// tool snapshots against a stored baseline from an earlier scan.

function shortHash(h: string): string {
	return h.slice(0, 8);
}

function beforeAfter(prev: ToolSnapshot, curr: ToolSnapshot): string {
	// Prefer readable text; fall back to hashes when the baseline predates the
	// ToolSnapshot.description field.
	if (prev.description || curr.description) {
		const before =
			prev.description ?? `(hash ${shortHash(prev.descriptionHash)})`;
		const after =
			curr.description ?? `(hash ${shortHash(curr.descriptionHash)})`;
		return `before: "${before}" → after: "${after}"`;
	}
	return `hash ${shortHash(prev.descriptionHash)} → ${shortHash(curr.descriptionHash)}`;
}

export function diffToolSnapshots(
	prev: ToolSnapshot[],
	curr: ToolSnapshot[],
	ctx: { sameVersion: boolean },
): Finding[] {
	const findings: Finding[] = [];
	const prevByName = new Map(prev.map((t) => [t.name, t]));
	const currByName = new Map(curr.map((t) => [t.name, t]));
	const currHashes = new Map<string, string>();
	for (const t of curr) currHashes.set(t.descriptionHash, t.name);

	for (const p of prev) {
		const c = currByName.get(p.name);
		if (c) {
			if (c.descriptionHash !== p.descriptionHash) {
				// A description mutating without a version bump is the classic rug pull.
				findings.push({
					id: "MCP-RUGPULL-001",
					severity: ctx.sameVersion ? "high" : "medium",
					category: "tool-poisoning",
					title: "Tool description changed since last scan",
					detail: `Tool "${p.name}" changed its description${ctx.sameVersion ? " with no version change" : " across a version update"}. Silent description changes are how a trusted server turns malicious after review.`,
					evidence: { source: `tool:${p.name}`, snippet: beforeAfter(p, c) },
					confidence: 0.8,
					remediation: "Re-review the tool before continuing to trust it.",
				});
			}
			continue;
		}
		// Name gone. If an identical description resurfaced under a new name, it's a
		// rename; otherwise it's a removal (can precede a shadowing replacement).
		const renamedTo = currHashes.get(p.descriptionHash);
		if (renamedTo && !prevByName.has(renamedTo)) {
			findings.push({
				id: "MCP-RUGPULL-001",
				severity: "medium",
				category: "tool-poisoning",
				title: "Tool renamed since last scan",
				detail: `Tool "${p.name}" was renamed to "${renamedTo}" (identical description). A rename can slip a tool past name-based review.`,
				evidence: {
					source: `tool:${p.name}`,
					snippet: `${p.name} → ${renamedTo}`,
				},
				confidence: 0.6,
			});
		} else {
			findings.push({
				id: "MCP-RUGPULL-001",
				severity: "medium",
				category: "tool-poisoning",
				title: "Tool removed since last scan",
				detail: `Tool "${p.name}" is no longer advertised. Removal can precede a shadowing replacement from another server.`,
				evidence: { source: `tool:${p.name}`, snippet: `removed: ${p.name}` },
				confidence: 0.5,
			});
		}
	}

	return findings;
}

// Diff a fresh report against a stored baseline and fold any rug-pull findings
// into a rescored copy. Returns the report unchanged when a meaningful diff
// isn't possible (missing snapshots or a metadata scan that errored out — the
// latter must not read as "every tool was removed").
export function applyBaseline(
	report: ScanReport,
	baseline: ScanReport | null,
): ScanReport {
	if (!baseline?.tools?.length || !baseline.layers.metadata) return report;
	if (!report.tools || !report.layers.metadata) return report;

	const sameVersion =
		baseline.target.resolvedVersion === report.target.resolvedVersion;
	const rug = diffToolSnapshots(baseline.tools, report.tools, { sameVersion });
	if (rug.length === 0) return report;

	const findings = [...report.findings, ...rug];
	const { score, breakdown } = scoreFindings(findings);
	return { ...report, findings, score, scoreBreakdown: breakdown };
}
