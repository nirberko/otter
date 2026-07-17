import { describe, expect, it } from "vitest";
import {
	parseOfficialityVerdicts,
	selectCandidates,
} from "../src/classify-officiality.js";
import type { ServerEntry } from "../src/discover.js";
import type { VerdictMap } from "../src/officiality.js";

const entry = (id: string): ServerEntry => ({
	id,
	sources: {},
	addedAt: "2026-07-17T00:00:00Z",
});

describe("parseOfficialityVerdicts", () => {
	it("parses a plain JSON array", () => {
		const out = parseOfficialityVerdicts(
			'[{"id": "io.github.a/x", "verdict": "official", "reason": "r"}]',
		);
		expect(out).toEqual([
			{ id: "io.github.a/x", verdict: "official", reason: "r" },
		]);
	});

	it("strips code fences and surrounding prose", () => {
		const out = parseOfficialityVerdicts(
			'Here you go:\n```json\n[{"id": "a/x", "verdict": "unofficial"}]\n```\nDone.',
		);
		expect(out).toHaveLength(1);
		expect(out[0].verdict).toBe("unofficial");
	});

	it("drops entries with invalid verdicts or missing ids", () => {
		const out = parseOfficialityVerdicts(
			'[{"id": "a/x", "verdict": "maybe"}, {"verdict": "official"}, {"id": "b/y", "verdict": "official"}]',
		);
		expect(out).toEqual([{ id: "b/y", verdict: "official" }]);
	});

	it("returns [] on garbage or non-array content", () => {
		expect(parseOfficialityVerdicts("no json here")).toEqual([]);
		expect(parseOfficialityVerdicts('{"id": "a"}')).toEqual([]);
		expect(parseOfficialityVerdicts("[not valid json]")).toEqual([]);
	});
});

describe("selectCandidates", () => {
	it("keeps only rule-undecided ids without a stored verdict, sorted", () => {
		const servers = [
			entry("io.github.zeta/x"), // undecided
			entry("com.microsoft/mcp"), // rule: official
			entry("io.github.alpha/x"), // undecided, has verdict
			entry("ai.smithery/x"), // rule: unofficial
			entry("io.github.beta/x"), // undecided
		];
		const verdicts: VerdictMap = {
			"io.github.alpha/x": {
				verdict: "unofficial",
				method: "llm",
				model: "test",
				decidedAt: "2026-07-17T00:00:00Z",
			},
		};
		expect(selectCandidates(servers, verdicts).map((e) => e.id)).toEqual([
			"io.github.beta/x",
			"io.github.zeta/x",
		]);
	});
});
