import type { ServerEntry } from "./discover.js";
import { type FrameworkCounts, frameworkCounts } from "./frameworks.js";
import type { ScanReport, Severity } from "./model.js";
import { classifyOfficiality, type Officiality } from "./officiality.js";
import { scoreBand } from "./scoring.js";
import { slug } from "./util/slug.js";

export interface CatalogRow {
	id: string;
	slug: string;
	title?: string;
	description?: string;
	version?: string;
	scanTarget?: string;
	sources: ServerEntry["sources"];
	score: number | null;
	band: string;
	// Whether the vendor of the service published it. Derived from `id`'s verified
	// namespace at summarize time, so curation changes need no re-scan.
	officiality: Officiality;
	counts: Partial<Record<Severity, number>>;
	// Per-framework compliance, keyed by framework id. Derived from findings at
	// summarize time, so framework/mapping changes need no re-scan.
	frameworks: Record<string, FrameworkCounts>;
	layers: ScanReport["layers"];
	scannedAt: string;
	scannerVersion: string;
	checksVersion: string;
	errors: number;
}

export function rowFromReport(
	report: ScanReport,
	entry: ServerEntry,
): CatalogRow {
	const counts: Partial<Record<Severity, number>> = {};
	for (const f of report.findings)
		counts[f.severity] = (counts[f.severity] ?? 0) + 1;
	const scanned = report.layers.metadata || report.layers.static;
	return {
		id: entry.id,
		slug: slug(entry.id),
		title: entry.title,
		description: entry.description,
		version: entry.version,
		scanTarget: entry.scanTarget,
		sources: entry.sources,
		score: scanned ? report.score : null,
		band: scanned ? scoreBand(report.score) : "unknown",
		officiality: classifyOfficiality(entry.id),
		counts,
		frameworks: scanned ? frameworkCounts(report.findings) : {},
		layers: report.layers,
		scannedAt: report.scannedAt,
		scannerVersion: report.scanner.version,
		checksVersion: report.scanner.rules,
		errors: report.errors.length,
	};
}

// A scored result is outdated when its checks version differs from the current
// one — its score predates checks we have since added, so it needs a re-scan.
export function isOutdated(row: CatalogRow, currentChecks: string): boolean {
	return row.score !== null && row.checksVersion !== currentChecks;
}

// Worst (lowest) scores first; unscanned/unknown entries sink to the bottom.
export function rankRows(rows: CatalogRow[]): CatalogRow[] {
	const rank = (s: number | null) => (s === null ? 101 : s);
	return [...rows].sort(
		(a, b) => rank(a.score) - rank(b.score) || a.id.localeCompare(b.id),
	);
}

// Only npm/pypi (source-readable) and url (client-connect) are scannable without
// a sandbox. Kept here so scan-batch and summarize agree on the target set.
export function isScannable(target?: string): boolean {
	return !!target && /^(npm|url):/.test(target);
}
