import { type Category, type Finding, severityRank } from "./model.js";

// A control from a named security framework (e.g. OWASP MCP Top 10's
// "MCP03:2025 — Tool Poisoning"). Findings map to a control when their
// category is listed OR their id starts with one of the prefixes.
export interface FrameworkControl {
	code: string;
	name: string;
	categories?: Category[];
	idPrefixes?: string[];
}

export interface Framework {
	id: string;
	name: string;
	version: string;
	url?: string;
	controls: FrameworkControl[];
}

// A control passes only when the scanner has coverage for it (it maps to at
// least one category/id) and no medium+ finding matched. Uncovered controls
// are "not-assessed" — never a silent pass.
export type ControlStatus = "pass" | "fail" | "not-assessed";

export interface ControlResult {
	code: string;
	name: string;
	status: ControlStatus;
	failing: Finding[];
	notes: Finding[];
}

export interface FrameworkResult {
	framework: Framework;
	controls: ControlResult[];
	passed: number;
	failed: number;
	notAssessed: number;
}

export interface FrameworkCounts {
	passed: number;
	failed: number;
	notAssessed: number;
}

export const FRAMEWORKS: Framework[] = [
	{
		id: "owasp-mcp-top10-2025",
		name: "OWASP MCP Top 10",
		version: "2025",
		url: "https://owasp.org/www-project-mcp-top-10/",
		controls: [
			{
				code: "MCP01:2025",
				name: "Token Mismanagement & Secret Exposure",
				categories: ["schema-smell"],
			},
			{ code: "MCP02:2025", name: "Overly Permissive Scope & Delegation" },
			{
				code: "MCP03:2025",
				name: "Tool Poisoning",
				categories: ["tool-poisoning", "shadowing"],
			},
			{
				code: "MCP04:2025",
				name: "Software Supply Chain Attacks & Dependency Tampering",
				categories: ["typosquat", "dependency"],
			},
			{
				code: "MCP05:2025",
				name: "Command Injection & Execution",
				categories: ["capability", "code-pattern"],
			},
			{
				code: "MCP06:2025",
				name: "Intent Flow Subversion",
				categories: ["toxic-flow"],
			},
			{
				code: "MCP07:2025",
				name: "Insufficient Authentication & Authorization",
			},
			{ code: "MCP08:2025", name: "Lack of Audit and Telemetry" },
			{ code: "MCP09:2025", name: "Shadow MCP Servers" },
			{
				code: "MCP10:2025",
				name: "Context Injection & Over-Sharing",
				categories: ["exfiltration"],
			},
		],
	},
	{
		id: "owasp-llm-top10-2025",
		name: "OWASP LLM Top 10",
		version: "2025",
		url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
		controls: [
			{
				code: "LLM01:2025",
				name: "Prompt Injection",
				categories: ["tool-poisoning", "shadowing"],
			},
			{
				code: "LLM02:2025",
				name: "Sensitive Information Disclosure",
				categories: ["exfiltration", "schema-smell"],
			},
			{
				code: "LLM03:2025",
				name: "Supply Chain",
				categories: ["typosquat", "dependency", "code-pattern"],
			},
			{ code: "LLM04:2025", name: "Data and Model Poisoning" },
			{ code: "LLM05:2025", name: "Improper Output Handling" },
			{
				code: "LLM06:2025",
				name: "Excessive Agency",
				categories: ["capability", "toxic-flow"],
			},
			{ code: "LLM07:2025", name: "System Prompt Leakage" },
			{ code: "LLM08:2025", name: "Vector and Embedding Weaknesses" },
			{ code: "LLM09:2025", name: "Misinformation" },
			{ code: "LLM10:2025", name: "Unbounded Consumption" },
		],
	},
];

const FAIL_RANK = severityRank("medium");

function matches(control: FrameworkControl, f: Finding): boolean {
	if (control.categories?.includes(f.category)) return true;
	return control.idPrefixes?.some((p) => f.id.startsWith(p)) ?? false;
}

function isAssessed(control: FrameworkControl): boolean {
	return !!(control.categories?.length || control.idPrefixes?.length);
}

export function evaluateFramework(
	framework: Framework,
	findings: Finding[],
): FrameworkResult {
	const controls = framework.controls.map((control): ControlResult => {
		if (!isAssessed(control))
			return {
				code: control.code,
				name: control.name,
				status: "not-assessed",
				failing: [],
				notes: [],
			};
		const matched = findings.filter((f) => matches(control, f));
		const failing = matched.filter(
			(f) => severityRank(f.severity) >= FAIL_RANK,
		);
		const notes = matched.filter((f) => severityRank(f.severity) < FAIL_RANK);
		return {
			code: control.code,
			name: control.name,
			status: failing.length ? "fail" : "pass",
			failing,
			notes,
		};
	});
	return {
		framework,
		controls,
		passed: controls.filter((c) => c.status === "pass").length,
		failed: controls.filter((c) => c.status === "fail").length,
		notAssessed: controls.filter((c) => c.status === "not-assessed").length,
	};
}

export function evaluateFrameworks(findings: Finding[]): FrameworkResult[] {
	return FRAMEWORKS.map((fw) => evaluateFramework(fw, findings));
}

export function frameworkCounts(
	findings: Finding[],
): Record<string, FrameworkCounts> {
	const out: Record<string, FrameworkCounts> = {};
	for (const r of evaluateFrameworks(findings))
		out[r.framework.id] = {
			passed: r.passed,
			failed: r.failed,
			notAssessed: r.notAssessed,
		};
	return out;
}

// Which framework controls a single finding violates — for per-finding chips.
export function controlsForFinding(
	f: Finding,
): { frameworkId: string; code: string }[] {
	const out: { frameworkId: string; code: string }[] = [];
	for (const fw of FRAMEWORKS)
		for (const c of fw.controls)
			if (isAssessed(c) && matches(c, f))
				out.push({ frameworkId: fw.id, code: c.code });
	return out;
}
