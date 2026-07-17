import { describe, expect, it } from "vitest";
import {
	type VerdictMap,
	classifyByRule,
	classifyOfficiality,
} from "../src/officiality.js";

describe("classifyOfficiality", () => {
	it("marks a verified custom domain namespace official", () => {
		expect(classifyOfficiality("com.microsoft/mcp")).toBe("official");
		expect(classifyOfficiality("com.stripe/mcp")).toBe("official");
	});

	it("marks io.github servers from a known vendor org official", () => {
		expect(classifyOfficiality("io.github.awslabs/aws-mcp")).toBe("official");
		expect(classifyOfficiality("io.github.modelcontextprotocol/server")).toBe(
			"official",
		);
	});

	it("marks io.github servers from other orgs unofficial", () => {
		expect(classifyOfficiality("io.github.jsmith/aws-tool")).toBe("unofficial");
	});

	it("marks aggregator namespaces unofficial even as a domain", () => {
		expect(classifyOfficiality("ai.smithery/some-server")).toBe("unofficial");
	});

	it("returns unknown when there is no namespace", () => {
		expect(classifyOfficiality("no-namespace-id")).toBe("unknown");
		expect(classifyOfficiality("/leading-slash")).toBe("unknown");
		expect(classifyOfficiality("")).toBe("unknown");
	});

	it("is case-insensitive on the namespace", () => {
		expect(classifyOfficiality("IO.GitHub.AWSLabs/x")).toBe("official");
	});
});

describe("classifyByRule", () => {
	it("returns undecided for io.github orgs outside the vendor table", () => {
		expect(classifyByRule("io.github.jsmith/aws-tool")).toBe("undecided");
	});

	it("still decides domains, vendor orgs, and aggregators", () => {
		expect(classifyByRule("com.microsoft/mcp")).toBe("official");
		expect(classifyByRule("io.github.awslabs/aws-mcp")).toBe("official");
		expect(classifyByRule("ai.smithery/x")).toBe("unofficial");
		expect(classifyByRule("no-namespace-id")).toBe("unknown");
	});
});

describe("classifyOfficiality with stored verdicts", () => {
	const verdict = (v: "official" | "unofficial"): VerdictMap[string] => ({
		verdict: v,
		method: "llm",
		model: "test",
		decidedAt: "2026-07-17T00:00:00Z",
	});

	it("uses the stored verdict when the rule is undecided", () => {
		const verdicts: VerdictMap = {
			"io.github.snowflakedb/mcp": verdict("official"),
		};
		expect(classifyOfficiality("io.github.snowflakedb/mcp", verdicts)).toBe(
			"official",
		);
	});

	it("lets rules shadow a stale stored verdict", () => {
		const verdicts: VerdictMap = {
			"io.github.awslabs/aws-mcp": verdict("unofficial"),
			"com.microsoft/mcp": verdict("unofficial"),
		};
		expect(classifyOfficiality("io.github.awslabs/aws-mcp", verdicts)).toBe(
			"official",
		);
		expect(classifyOfficiality("com.microsoft/mcp", verdicts)).toBe("official");
	});

	it("falls back to unofficial for undecided ids without a verdict", () => {
		expect(classifyOfficiality("io.github.jsmith/aws-tool", {})).toBe(
			"unofficial",
		);
	});
});
