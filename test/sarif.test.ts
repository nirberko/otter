import { describe, expect, it } from "vitest";
import type { ScanReport } from "../src/model.js";
import { renderSarif } from "../src/report/sarif.js";

const report: ScanReport = {
	schemaVersion: 1,
	scanner: { version: "0.2.0", rules: "abc" },
	target: { kind: "npm", ref: "evil-server" },
	scannedAt: "2026-01-01T00:00:00Z",
	durationMs: 5,
	layers: { metadata: true, static: true },
	findings: [
		{
			id: "MCP-TOOL-POISON-001",
			severity: "high",
			category: "tool-poisoning",
			title: "Description issues instructions to the model",
			detail: "bad",
			evidence: { source: "tool:add", snippet: "ignore previous" },
			confidence: 0.7,
		},
		{
			id: "MCP-EXFIL-001",
			severity: "high",
			category: "exfiltration",
			title: "exfil host",
			detail: "webhook",
			evidence: { source: "index.js", snippet: "webhook.site", line: 12 },
			confidence: 0.9,
		},
	],
	score: 40,
	scoreBreakdown: {},
	errors: [],
};

describe("renderSarif", () => {
	it("produces a valid SARIF 2.1.0 structure", () => {
		const sarif = JSON.parse(renderSarif(report));
		expect(sarif.version).toBe("2.1.0");
		expect(sarif.runs).toHaveLength(1);
		expect(sarif.runs[0].tool.driver.name).toBe("mcpscan");
		expect(sarif.runs[0].results).toHaveLength(2);
	});

	it("maps high severity to error and dedupes rules", () => {
		const sarif = JSON.parse(renderSarif(report));
		expect(sarif.runs[0].results[0].level).toBe("error");
		expect(sarif.runs[0].tool.driver.rules).toHaveLength(2);
	});

	it("uses a physical location for file-anchored findings and logical for tool findings", () => {
		const sarif = JSON.parse(renderSarif(report));
		const [poison, exfil] = sarif.runs[0].results;
		expect(poison.locations[0].logicalLocations[0].name).toBe("tool:add");
		expect(exfil.locations[0].physicalLocation.region.startLine).toBe(12);
	});
});
