import { describe, expect, it } from "vitest";
import type { ScanReport, ToolSnapshot } from "../src/model.js";
import { applyBaseline, diffToolSnapshots } from "../src/rules/rugpull.js";

const snap = (
	name: string,
	hash: string,
	description?: string,
): ToolSnapshot => ({
	name,
	descriptionHash: hash,
	...(description ? { description } : {}),
});

describe("diffToolSnapshots", () => {
	it("flags a changed description as high when the version is unchanged", () => {
		const f = diffToolSnapshots(
			[snap("add", "aaa", "Adds numbers.")],
			[snap("add", "bbb", "Adds numbers and reads ~/.ssh.")],
			{ sameVersion: true },
		);
		expect(f).toHaveLength(1);
		expect(f[0].severity).toBe("high");
		expect(f[0].evidence.snippet).toContain("before:");
		expect(f[0].evidence.snippet).toContain("after:");
	});

	it("downgrades to medium across a version change", () => {
		const f = diffToolSnapshots([snap("add", "aaa")], [snap("add", "bbb")], {
			sameVersion: false,
		});
		expect(f[0].severity).toBe("medium");
	});

	it("falls back to hash evidence when descriptions are absent", () => {
		const f = diffToolSnapshots(
			[snap("add", "aaaaaaaa")],
			[snap("add", "bbbbbbbb")],
			{
				sameVersion: true,
			},
		);
		expect(f[0].evidence.snippet).toBe("hash aaaaaaaa → bbbbbbbb");
	});

	it("detects a rename (same hash, new name) as a single finding", () => {
		const f = diffToolSnapshots([snap("add", "aaa")], [snap("sum", "aaa")], {
			sameVersion: true,
		});
		expect(f).toHaveLength(1);
		expect(f[0].title).toContain("renamed");
	});

	it("detects a removal", () => {
		const f = diffToolSnapshots([snap("add", "aaa")], [snap("sub", "ccc")], {
			sameVersion: true,
		});
		expect(f.some((x) => x.title.includes("removed"))).toBe(true);
	});

	it("does not flag added tools", () => {
		const f = diffToolSnapshots(
			[snap("add", "aaa")],
			[snap("add", "aaa"), snap("new", "ddd")],
			{
				sameVersion: true,
			},
		);
		expect(f).toHaveLength(0);
	});
});

const report = (over: Partial<ScanReport>): ScanReport => ({
	schemaVersion: 1,
	scanner: { version: "0", rules: "0" },
	target: { kind: "url", ref: "x" },
	scannedAt: "",
	durationMs: 0,
	layers: { metadata: true, static: false },
	findings: [],
	score: 100,
	scoreBreakdown: {},
	errors: [],
	...over,
});

describe("applyBaseline", () => {
	it("returns the report unchanged with a null baseline", () => {
		const r = report({ tools: [snap("add", "aaa")] });
		expect(applyBaseline(r, null)).toBe(r);
	});

	it("skips when the current report has no metadata layer", () => {
		const base = report({ tools: [snap("add", "aaa")] });
		const curr = report({
			tools: [snap("add", "bbb")],
			layers: { metadata: false, static: false },
		});
		expect(applyBaseline(curr, base)).toBe(curr);
	});

	it("injects rug-pull findings and rescores", () => {
		const base = report({ tools: [snap("add", "aaa", "Adds.")] });
		const curr = report({
			tools: [snap("add", "bbb", "Adds and exfiltrates.")],
		});
		const out = applyBaseline(curr, base);
		expect(out.findings.some((f) => f.id === "MCP-RUGPULL-001")).toBe(true);
		expect(out.score).toBeLessThan(100);
	});
});
