import { describe, expect, it } from "vitest";
import { classifyOfficiality } from "../src/officiality.js";

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
