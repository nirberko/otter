import { describe, expect, it } from "vitest";
import { diffToolLists } from "../src/scanners/connect.js";
import type { ToolInfo } from "../src/scanners/metadata.js";

const t = (name: string, description?: string): ToolInfo => ({
	name,
	description,
});

describe("diffToolLists", () => {
	it("returns empty diffs for identical lists", () => {
		const d = diffToolLists(
			[t("a", "x"), t("b", "y")],
			[t("a", "x"), t("b", "y")],
		);
		expect(d).toEqual({ added: [], removed: [], changed: [] });
	});

	it("detects added and removed tools", () => {
		const d = diffToolLists([t("a")], [t("b")]);
		expect(d.added).toEqual(["b"]);
		expect(d.removed).toEqual(["a"]);
	});

	it("detects a changed description", () => {
		const d = diffToolLists([t("a", "old")], [t("a", "new")]);
		expect(d.changed).toEqual(["a"]);
	});
});
