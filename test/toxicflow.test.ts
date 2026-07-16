import { describe, expect, it } from "vitest";
import { classifyTool, toxicFlowFindings } from "../src/rules/toxicflow.js";
import type { ToolInfo } from "../src/scanners/metadata.js";

describe("classifyTool", () => {
	it("labels an untrusted-content reader", () => {
		expect(
			classifyTool("get_comments", "Read the comments on an issue."),
		).toContain("untrusted-content");
	});

	it("does not label a destructive comment op as untrusted-content", () => {
		const labels = classifyTool("delete_comment", "Delete a comment.");
		expect(labels).not.toContain("untrusted-content");
		expect(labels).toContain("destructive");
	});

	it("labels private data and public sinks", () => {
		expect(
			classifyTool("get_api_key", "Retrieve the API credentials."),
		).toContain("private-data");
		expect(
			classifyTool("send_email", "Send an email to any address."),
		).toContain("public-sink");
	});
});

const tools = (specs: [string, string][]): ToolInfo[] =>
	specs.map(([name, description]) => ({ name, description }));

describe("toxicFlowFindings", () => {
	it("flags the lethal trifecta as high and names tools per leg", () => {
		const f = toxicFlowFindings(
			tools([
				["get_comments", "Read issue comments."],
				["get_api_key", "Retrieve API credentials."],
				["send_email", "Send an email."],
			]),
			"demo",
		);
		expect(f).toHaveLength(1);
		expect(f[0].severity).toBe("high");
		expect(f[0].detail).toContain("get_comments");
		expect(f[0].detail).toContain("get_api_key");
		expect(f[0].detail).toContain("send_email");
	});

	it("flags untrusted+sink without private data as medium", () => {
		const f = toxicFlowFindings(
			tools([
				["get_comments", "Read issue comments."],
				["send_email", "Send an email."],
			]),
			"demo",
		);
		expect(f).toHaveLength(1);
		expect(f[0].severity).toBe("medium");
	});

	it("does not flag a single-purpose server", () => {
		expect(
			toxicFlowFindings(tools([["get_weather", "Get the weather."]]), "w"),
		).toHaveLength(0);
	});
});
