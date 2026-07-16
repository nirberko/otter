export const SEVERITIES = [
	"info",
	"low",
	"medium",
	"high",
	"critical",
] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CATEGORIES = [
	"tool-poisoning",
	"shadowing",
	"exfiltration",
	"capability",
	"schema-smell",
	"typosquat",
	"dependency",
	"code-pattern",
	"toxic-flow",
] as const;
export type Category = (typeof CATEGORIES)[number];

// A tool's capability class, used for lethal-trifecta / toxic-flow reasoning.
export const FLOW_LABELS = [
	"untrusted-content",
	"private-data",
	"public-sink",
	"destructive",
] as const;
export type FlowLabel = (typeof FLOW_LABELS)[number];

export interface Evidence {
	source: string;
	snippet: string;
	line?: number;
	span?: [number, number];
}

export interface Finding {
	id: string;
	severity: Severity;
	category: Category;
	title: string;
	detail: string;
	evidence: Evidence;
	confidence: number;
	remediation?: string;
}

export type TargetKind = "npm" | "pypi" | "github" | "local" | "url" | "stdio";

export interface ScanTarget {
	kind: TargetKind;
	ref: string;
	resolvedVersion?: string;
	resolvedCommit?: string;
}

export interface ToolSnapshot {
	name: string;
	descriptionHash: string;
	// Truncated description excerpt, so a later rescan can show before/after text
	// for rug-pull diffs. Omitted when the description is empty.
	description?: string;
	// Toxic-flow capability labels; omitted when the tool has none.
	labels?: FlowLabel[];
}

export interface ScanReport {
	schemaVersion: 1;
	scanner: { version: string; rules: string };
	target: ScanTarget;
	scannedAt: string;
	durationMs: number;
	layers: { metadata: boolean; static: boolean };
	tools?: ToolSnapshot[];
	findings: Finding[];
	score: number;
	scoreBreakdown: Partial<Record<Category, number>>;
	errors: { scanner: string; message: string }[];
}

export function severityRank(s: Severity): number {
	return SEVERITIES.indexOf(s);
}
