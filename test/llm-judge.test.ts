import { afterEach, describe, expect, it, vi } from "vitest";
import type { Inventory } from "../src/scanners/metadata.js";

// Disable inter-call throttling before importing the module under test.
process.env.MCPSCAN_LLM_SPACING_MS = "0";
const { judgeInventory, selectCandidates } = await import(
	"../src/scanners/llm-judge.js"
);

const inv = (): Inventory => ({
	serverName: "s",
	tools: [{ name: "add", description: "x".repeat(400) }], // long → warrantsLlmReview
	prompts: [],
});

function mockFetchOnce(content: string, ok = true, status = 200) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({
			ok,
			status,
			text: async () => "err",
			json: async () => ({ choices: [{ message: { content } }] }),
		})),
	);
}

afterEach(() => vi.unstubAllGlobals());

describe("selectCandidates", () => {
	it("selects long descriptions", () => {
		expect(selectCandidates(inv(), [], 20)).toHaveLength(1);
	});
	it("selects tools with a medium+ heuristic finding", () => {
		const short: Inventory = {
			serverName: "s",
			tools: [{ name: "add", description: "hi" }],
			prompts: [],
		};
		const findings = [
			{
				id: "x",
				severity: "high" as const,
				category: "tool-poisoning" as const,
				title: "t",
				detail: "d",
				evidence: { source: "tool:add", snippet: "s" },
				confidence: 0.5,
			},
		];
		expect(selectCandidates(short, findings, 20)).toHaveLength(1);
	});
});

describe("judgeInventory", () => {
	it("parses a malicious verdict into a high finding", async () => {
		mockFetchOnce(
			'[{"name":"add","verdict":"malicious","reason":"hidden instructions"}]',
		);
		const r = await judgeInventory(inv(), {
			apiKey: "k",
			heuristicFindings: [],
			medianLen: 20,
		});
		expect(r.findings).toHaveLength(1);
		expect(r.findings[0].severity).toBe("high");
	});

	it("strips code fences before parsing", async () => {
		mockFetchOnce(
			'```json\n[{"name":"add","verdict":"suspicious","reason":"vague"}]\n```',
		);
		const r = await judgeInventory(inv(), {
			apiKey: "k",
			heuristicFindings: [],
			medianLen: 20,
		});
		expect(r.findings[0].severity).toBe("medium");
	});

	it("ignores benign verdicts", async () => {
		mockFetchOnce('[{"name":"add","verdict":"benign","reason":"fine"}]');
		const r = await judgeInventory(inv(), {
			apiKey: "k",
			heuristicFindings: [],
			medianLen: 20,
		});
		expect(r.findings).toHaveLength(0);
	});

	it("returns an error (not a throw) on a non-ok response", async () => {
		mockFetchOnce("", false, 429);
		const r = await judgeInventory(inv(), {
			apiKey: "k",
			heuristicFindings: [],
			medianLen: 20,
		});
		expect(r.findings).toHaveLength(0);
		expect(r.error).toContain("429");
	});

	it("makes no request when there are no candidates", async () => {
		const spy = vi.fn();
		vi.stubGlobal("fetch", spy);
		const short: Inventory = {
			serverName: "s",
			tools: [{ name: "a", description: "hi" }],
			prompts: [],
		};
		const r = await judgeInventory(short, {
			apiKey: "k",
			heuristicFindings: [],
			medianLen: 20,
		});
		expect(spy).not.toHaveBeenCalled();
		expect(r.findings).toHaveLength(0);
	});
});
