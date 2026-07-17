import pc from "picocolors";
import { evaluateFrameworks } from "../frameworks.js";
import type { Finding, ScanReport, Severity } from "../model.js";
import { scoreBand } from "../scoring.js";

const SEV_COLOR: Record<Severity, (s: string) => string> = {
	critical: (s) => pc.bgRed(pc.white(s)),
	high: pc.red,
	medium: pc.yellow,
	low: pc.cyan,
	info: pc.gray,
};

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

function scoreColor(score: number): (s: string) => string {
	const band = scoreBand(score);
	if (band === "verified" || band === "ok") return pc.green;
	if (band === "warn") return pc.yellow;
	return pc.red;
}

function renderFinding(f: Finding): string {
	const tag = SEV_COLOR[f.severity](` ${f.severity.toUpperCase()} `);
	const loc = f.evidence.line
		? `${f.evidence.source}:${f.evidence.line}`
		: f.evidence.source;
	const conf = pc.gray(`(confidence ${Math.round(f.confidence * 100)}%)`);
	return [
		`${tag} ${pc.bold(f.title)} ${pc.gray(`[${f.id}]`)}`,
		`   ${f.detail}`,
		`   ${pc.gray("↳")} ${pc.dim(loc)}  ${conf}`,
		`   ${pc.gray("│")} ${pc.dim(f.evidence.snippet)}`,
	].join("\n");
}

export function renderTerminal(report: ScanReport): string {
	const lines: string[] = [];
	const c = scoreColor(report.score);
	const layers = [
		report.layers.metadata ? "metadata" : null,
		report.layers.static ? "static" : null,
	]
		.filter(Boolean)
		.join(" + ");

	lines.push("");
	lines.push(pc.bold(`  mcpscan  ${report.target.kind}:${report.target.ref}`));
	const version = report.target.resolvedVersion
		? `@${report.target.resolvedVersion}`
		: "";
	lines.push(
		pc.gray(
			`  scanned ${layers || "nothing"} ${version} in ${report.durationMs}ms`,
		),
	);
	lines.push("");
	lines.push(
		`  Score  ${c(pc.bold(`${report.score}/100`))}  ${c(scoreBand(report.score))}`,
	);
	lines.push("");

	if (report.findings.length === 0) {
		lines.push(pc.green("  ✓ No findings."));
	} else {
		const sorted = [...report.findings].sort(
			(a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity),
		);
		const counts = SEV_ORDER.map((s) => {
			const n = report.findings.filter((f) => f.severity === s).length;
			return n ? SEV_COLOR[s](`${n} ${s}`) : null;
		}).filter(Boolean);
		lines.push(`  ${counts.join(pc.gray(" · "))}`);
		lines.push("");
		for (const f of sorted) {
			lines.push(renderFinding(f));
			lines.push("");
		}
	}

	for (const r of evaluateFrameworks(report.findings)) {
		const failed = r.controls.filter((c) => c.status === "fail");
		const summary = failed.length
			? pc.red(
					`${failed.length} failed: ${failed.map((c) => c.code).join(", ")}`,
				)
			: pc.green("all assessed controls pass");
		lines.push(
			`  ${pc.bold(`${r.framework.name} ${r.framework.version}`)}  ` +
				`${r.passed}/${r.passed + r.failed} pass ${pc.gray(`(${r.notAssessed} not assessed)`)} · ${summary}`,
		);
	}
	lines.push("");

	if (report.errors.length > 0) {
		lines.push(pc.gray(`  ${report.errors.length} scanner error(s):`));
		for (const e of report.errors)
			lines.push(pc.gray(`    - ${e.scanner}: ${e.message}`));
	}

	return lines.join("\n");
}
