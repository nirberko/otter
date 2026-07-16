#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { isScannable } from "./catalog.js";
import type { ServerEntry } from "./discover.js";
import type { ScanReport } from "./model.js";
import { applyBaseline } from "./rules/rugpull.js";
import { scan } from "./scan.js";
import { sha256 } from "./util/hash.js";
import { slug } from "./util/slug.js";
import { CHECKS_VERSION, SCANNER_VERSION } from "./version.js";

const SERVERS = "data/servers.json";
const CHANGED = "data/changed.json";
const RESULTS_DIR = "data/results";

async function pool<T>(
	items: T[],
	size: number,
	fn: (item: T) => Promise<void>,
) {
	let cursor = 0;
	const workers = Array.from(
		{ length: Math.min(size, items.length) },
		async () => {
			while (cursor < items.length) await fn(items[cursor++]);
		},
	);
	await Promise.all(workers);
}

async function loadJson<T>(path: string, fallback: T): Promise<T> {
	const text = await readFile(path, "utf8").catch(() => "");
	if (!text) return fallback;
	// A corrupt/torn baseline must never crash the batch — just lose the baseline.
	try {
		return JSON.parse(text) as T;
	} catch {
		return fallback;
	}
}

// Deterministic partition so N shard jobs cover the set disjointly.
function inShard(id: string, shard: number, total: number): boolean {
	return Number.parseInt(sha256(id).slice(0, 8), 16) % total === shard;
}

function parseShard(spec?: string): { i: number; n: number } | null {
	if (!spec) return null;
	const [i, n] = spec.split("/").map(Number);
	if (
		!Number.isInteger(i) ||
		!Number.isInteger(n) ||
		n < 1 ||
		i < 0 ||
		i >= n
	) {
		throw new Error(`invalid --shard "${spec}"; expected i/N with 0 <= i < N`);
	}
	return { i, n };
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			max: { type: "string" },
			concurrency: { type: "string" },
			timeout: { type: "string" },
			"changed-only": { type: "boolean", default: false },
			only: { type: "string" }, // 'npm' | 'url' | ...
			shard: { type: "string" }, // 'i/N'
			llm: { type: "boolean", default: false },
		},
	});
	const max = values.max ? Number(values.max) : Number.POSITIVE_INFINITY;
	const concurrency = values.concurrency ? Number(values.concurrency) : 6;
	const timeoutMs = values.timeout ? Number(values.timeout) : 45000;
	const shard = parseShard(values.shard);

	const servers = await loadJson<ServerEntry[]>(SERVERS, []);
	let targets = servers.filter((e) => isScannable(e.scanTarget));

	if (values["changed-only"]) {
		const changed = new Set(await loadJson<string[]>(CHANGED, []));
		// Changed servers plus every url server (live descriptions can drift with no version bump).
		targets = targets.filter(
			(e) => changed.has(e.id) || e.scanTarget?.startsWith("url:"),
		);
	}
	if (values.only)
		targets = targets.filter((e) =>
			e.scanTarget?.startsWith(`${values.only}:`),
		);
	if (shard) targets = targets.filter((e) => inShard(e.id, shard.i, shard.n));
	targets = targets.slice(0, max);

	await mkdir(RESULTS_DIR, { recursive: true });
	const label = [
		values["changed-only"] && "changed-only",
		values.only && `only=${values.only}`,
		shard && `shard=${shard.i}/${shard.n}`,
	]
		.filter(Boolean)
		.join(" ");
	process.stderr.write(
		`Scanning ${targets.length} servers ${label} (concurrency ${concurrency})...\n`,
	);

	let done = 0;
	await pool(targets, concurrency, async (entry) => {
		const outPath = join(RESULTS_DIR, `${slug(entry.id)}.json`);
		// Prior result is the rug-pull baseline; read it before we overwrite.
		const prev = await loadJson<ScanReport | null>(outPath, null);
		let report: ScanReport;
		try {
			report = await scan(entry.scanTarget as string, {
				exec: "off",
				timeoutMs,
				llm: values.llm,
			});
			report = applyBaseline(report, prev);
		} catch (e) {
			report = errorReport(entry, (e as Error).message);
		}
		await writeFile(outPath, JSON.stringify(report, null, 2));
		done++;
		process.stderr.write(`  ${done}/${targets.length}\r`);
	});

	process.stderr.write(`\nWrote ${targets.length} results → ${RESULTS_DIR}/\n`);
}

function errorReport(entry: ServerEntry, message: string): ScanReport {
	return {
		schemaVersion: 1,
		scanner: { version: SCANNER_VERSION, rules: String(CHECKS_VERSION) },
		target: { kind: "npm", ref: entry.scanTarget ?? entry.id },
		scannedAt: new Date().toISOString(),
		durationMs: 0,
		layers: { metadata: false, static: false },
		findings: [],
		score: 0,
		scoreBreakdown: {},
		errors: [{ scanner: "scan", message }],
	};
}

main().catch((e) => {
	process.stderr.write(`scan-batch: ${(e as Error).message}\n`);
	process.exit(1);
});
