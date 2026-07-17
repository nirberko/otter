import type { Finding, ScanReport, Severity } from "../model.js";

// SARIF 2.1.0 output so findings can be uploaded to GitHub code scanning
// (github/codeql-action/upload-sarif) or any SARIF viewer.

const SARIF_LEVEL: Record<Severity, "error" | "warning" | "note"> = {
	critical: "error",
	high: "error",
	medium: "warning",
	low: "note",
	info: "note",
};

function location(f: Finding, targetRef: string) {
	// Static findings point at a file:line; metadata findings point at a logical
	// location (e.g. "tool:add") since there's no file to anchor to.
	if (f.evidence.line !== undefined && !f.evidence.source.includes(":")) {
		return {
			physicalLocation: {
				artifactLocation: { uri: f.evidence.source },
				region: { startLine: f.evidence.line },
			},
		};
	}
	if (/^(tool|server|package|prompt):/.test(f.evidence.source)) {
		return {
			logicalLocations: [
				{
					name: f.evidence.source,
					fullyQualifiedName: `${targetRef}/${f.evidence.source}`,
				},
			],
		};
	}
	return {
		physicalLocation: {
			artifactLocation: { uri: f.evidence.source },
			...(f.evidence.line !== undefined
				? { region: { startLine: f.evidence.line } }
				: {}),
		},
	};
}

export function renderSarif(report: ScanReport): string {
	const ruleIds = [...new Set(report.findings.map((f) => f.id))];
	const rules = ruleIds.map((id) => {
		const f = report.findings.find((x) => x.id === id) as Finding;
		return {
			id,
			name: id,
			shortDescription: { text: f.title },
			defaultConfiguration: { level: SARIF_LEVEL[f.severity] },
		};
	});

	const targetRef = `${report.target.kind}:${report.target.ref}`;
	const results = report.findings.map((f) => ({
		ruleId: f.id,
		level: SARIF_LEVEL[f.severity],
		message: { text: `${f.detail} [${f.evidence.snippet}]` },
		locations: [location(f, targetRef)],
		properties: {
			category: f.category,
			confidence: f.confidence,
			security_severity: f.severity,
		},
	}));

	const sarif = {
		$schema: "https://json.schemastore.org/sarif-2.1.0.json",
		version: "2.1.0",
		runs: [
			{
				tool: {
					driver: {
						name: "otter",
						version: report.scanner.version,
						informationUri: "https://github.com/nirberko/otter",
						rules,
					},
				},
				results,
				properties: { score: report.score, target: targetRef },
			},
		],
	};
	return JSON.stringify(sarif, null, 2);
}
