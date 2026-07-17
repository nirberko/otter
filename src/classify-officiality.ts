#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import type { ServerEntry } from "./discover.js";
import {
	OFFICIALITY_FILE,
	type StoredVerdict,
	type VerdictMap,
	classifyByRule,
	loadVerdicts,
} from "./officiality.js";
import { MODEL, chatCompletion } from "./scanners/openrouter.js";

const SERVERS = "data/servers.json";

const SYSTEM_PROMPT = `You judge whether MCP (Model Context Protocol) registry servers are published by the vendor of the service they integrate with. Each id has the form io.github.<github-org-or-user>/<name>. A server is "official" ONLY when that GitHub org/user is the company that owns the product or API the server exposes (e.g. io.github.snowflakedb publishing a Snowflake server). Personal accounts, community integrations, and third parties wrapping someone else's API are "unofficial". When unsure, answer "unofficial". Respond with ONLY a JSON array, no prose, no code fences: [{"id": "...", "verdict": "official"|"unofficial", "reason": "one short sentence"}].`;

interface LlmVerdict {
	id: string;
	verdict: "official" | "unofficial";
	reason?: string;
}

// Tolerant parse: models wrap JSON in fences or prose; invalid entries are
// dropped (they stay candidates and get retried next run).
export function parseOfficialityVerdicts(content: string): LlmVerdict[] {
	const stripped = content.replace(/```(?:json)?/gi, "").trim();
	const start = stripped.indexOf("[");
	const end = stripped.lastIndexOf("]");
	if (start === -1 || end === -1 || end < start) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(stripped.slice(start, end + 1));
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	return parsed.filter(
		(v): v is LlmVerdict =>
			typeof v?.id === "string" &&
			(v.verdict === "official" || v.verdict === "unofficial"),
	);
}

// Undecided by rule and not yet judged. Sorted so batches are deterministic
// across resumed runs.
export function selectCandidates(
	servers: ServerEntry[],
	verdicts: VerdictMap,
): ServerEntry[] {
	return servers
		.filter((e) => classifyByRule(e.id) === "undecided" && !verdicts[e.id])
		.sort((a, b) => a.id.localeCompare(b.id));
}

async function flush(verdicts: VerdictMap): Promise<void> {
	const sorted: VerdictMap = {};
	for (const id of Object.keys(verdicts).sort()) sorted[id] = verdicts[id];
	await writeFile(
		OFFICIALITY_FILE,
		`${JSON.stringify({ schemaVersion: 1, verdicts: sorted }, null, 2)}\n`,
	);
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			max: { type: "string" },
			batch: { type: "string" },
		},
	});
	const batchSize = Number(values.batch ?? 20);

	const servers = JSON.parse(await readFile(SERVERS, "utf8")) as ServerEntry[];
	const verdicts = await loadVerdicts();
	let candidates = selectCandidates(servers, verdicts);
	if (values.max) candidates = candidates.slice(0, Number(values.max));

	if (candidates.length === 0) {
		process.stderr.write("Nothing to classify.\n");
		return;
	}
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		process.stderr.write(
			`classify: ${candidates.length} candidates but OPENROUTER_API_KEY is not set\n`,
		);
		process.exit(1);
	}

	let decided = 0;
	let failed = 0;
	for (let i = 0; i < candidates.length; i += batchSize) {
		const batch = candidates.slice(i, i + batchSize);
		const ids = new Set(batch.map((e) => e.id));
		const res = await chatCompletion({
			apiKey,
			system: SYSTEM_PROMPT,
			user: JSON.stringify(
				batch.map((e) => ({
					id: e.id,
					title: e.title ?? "",
					description: e.description ?? "",
				})),
			),
			// 20 servers per request; the free reasoning model regularly needs >30s.
			timeoutMs: 90000,
		});
		if (res.status === 429) {
			// Free-tier daily cap. Progress is flushed; the next run resumes.
			process.stderr.write("classify: rate limited (429), stopping\n");
			break;
		}
		if (res.error) {
			failed++;
			process.stderr.write(`  batch failed: ${res.error}\n`);
			continue;
		}
		const now = new Date().toISOString();
		for (const v of parseOfficialityVerdicts(res.content ?? "")) {
			if (!ids.has(v.id)) continue; // hallucinated id
			verdicts[v.id] = {
				verdict: v.verdict,
				method: "llm",
				model: MODEL,
				decidedAt: now,
				reason: v.reason?.slice(0, 200),
			} satisfies StoredVerdict;
			decided++;
		}
		// Flush per batch so a killed run (or daily quota) loses nothing.
		await flush(verdicts);
		process.stderr.write(
			`  ${Math.min(i + batchSize, candidates.length)}/${candidates.length} sent, ${decided} decided\n`,
		);
	}

	const remaining = selectCandidates(servers, verdicts).length;
	process.stderr.write(
		`Classified ${decided} servers → ${OFFICIALITY_FILE} (${failed} failed batches, ${remaining} remaining)\n`,
	);
}

// Guard so tests can import the exported helpers without running the CLI.
const invokedDirectly = /classify-officiality\.[jt]s$/.test(
	process.argv[1] ?? "",
);
if (invokedDirectly)
	main().catch((e) => {
		process.stderr.write(`classify: ${(e as Error).message}\n`);
		process.exit(1);
	});
