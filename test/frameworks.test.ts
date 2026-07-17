import { describe, expect, it } from "vitest";
import {
	FRAMEWORKS,
	controlsForFinding,
	evaluateFrameworks,
	frameworkCounts,
} from "../src/frameworks.js";
import type { Finding, Severity } from "../src/model.js";

const finding = (
	category: Finding["category"],
	severity: Severity,
	id = "MCP-TEST-001",
): Finding => ({
	id,
	severity,
	category,
	title: "test finding",
	detail: "detail",
	evidence: { source: "tool:x", snippet: "…" },
	confidence: 0.8,
});

const mcp = (findings: Finding[]) =>
	evaluateFrameworks(findings).find(
		(r) => r.framework.id === "owasp-mcp-top10-2025",
	);
const control = (findings: Finding[], code: string) =>
	mcp(findings)?.controls.find((c) => c.code === code);

describe("evaluateFrameworks", () => {
	it("fails MCP03 on a medium+ tool-poisoning finding", () => {
		const c = control([finding("tool-poisoning", "high")], "MCP03:2025");
		expect(c?.status).toBe("fail");
		expect(c?.failing).toHaveLength(1);
	});

	it("passes MCP03 when only low/info findings match, kept as notes", () => {
		const c = control([finding("tool-poisoning", "low")], "MCP03:2025");
		expect(c?.status).toBe("pass");
		expect(c?.notes).toHaveLength(1);
	});

	it("marks uncovered controls not-assessed, never pass", () => {
		const c = control([], "MCP07:2025");
		expect(c?.status).toBe("not-assessed");
	});

	it("passes covered controls with no findings", () => {
		expect(control([], "MCP03:2025")?.status).toBe("pass");
	});

	it("maps one finding into multiple frameworks", () => {
		const refs = controlsForFinding(finding("tool-poisoning", "high"));
		expect(refs).toContainEqual({
			frameworkId: "owasp-mcp-top10-2025",
			code: "MCP03:2025",
		});
		expect(refs).toContainEqual({
			frameworkId: "owasp-llm-top10-2025",
			code: "LLM01:2025",
		});
	});

	it("counts add up to the control total per framework", () => {
		const counts = frameworkCounts([finding("capability", "medium")]);
		for (const fw of FRAMEWORKS) {
			const c = counts[fw.id];
			expect(c.passed + c.failed + c.notAssessed).toBe(fw.controls.length);
		}
		expect(counts["owasp-mcp-top10-2025"].failed).toBe(1); // MCP05
		expect(counts["owasp-llm-top10-2025"].failed).toBe(1); // LLM06
	});
});
