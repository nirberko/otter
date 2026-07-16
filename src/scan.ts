import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Finding, ScanReport } from "./model.js";
import { type Resolved, resolve } from "./resolve/index.js";
import { classifyTool } from "./rules/toxicflow.js";
import { connectStdio, connectUrl } from "./scanners/connect.js";
import { judgeInventory } from "./scanners/llm-judge.js";
import { type Inventory, analyzeInventory } from "./scanners/metadata.js";
import { scanStatic } from "./scanners/static.js";
import { scoreFindings } from "./scoring.js";
import { sha256 } from "./util/hash.js";
import { CHECKS_VERSION, SCANNER_VERSION } from "./version.js";

export interface ScanOptions {
	// 'off' never launches server code; 'trusted' launches on the host (corpus/dev);
	// 'sandbox' launches inside a container (added in a later milestone).
	exec?: "off" | "trusted" | "sandbox";
	timeoutMs?: number;
	// When true and OPENROUTER_API_KEY is set, send flagged tool descriptions to
	// an LLM for a second opinion (see scanners/llm-judge.ts).
	llm?: boolean;
}

function medianDescLength(descriptions: string[]): number {
	const lengths = descriptions.map((d) => d.length).filter((n) => n > 0);
	if (lengths.length === 0) return 0;
	const sorted = [...lengths].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? sorted[mid]
		: Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// A launchable entry for a resolved source dir (package.json bin/main).
async function launchFromDir(
	dir: string,
): Promise<{ command: string; args: string[] } | null> {
	const pkgPath = join(dir, "package.json");
	const pkg = await readFile(pkgPath, "utf8")
		.then(
			(t) =>
				JSON.parse(t) as {
					bin?: string | Record<string, string>;
					main?: string;
				},
		)
		.catch(() => null);
	if (!pkg) return null;
	let entry: string | undefined;
	if (typeof pkg.bin === "string") entry = pkg.bin;
	else if (pkg.bin && typeof pkg.bin === "object")
		entry = Object.values(pkg.bin)[0];
	entry = entry ?? pkg.main;
	if (!entry) return null;
	return { command: process.execPath, args: [join(dir, entry)] };
}

async function getInventory(
	res: Resolved,
	opts: ScanOptions,
): Promise<Inventory> {
	const serverName = res.target.resolvedVersion
		? res.target.ref.split("@")[0]
		: basename(res.target.ref);

	if (res.url) {
		return connectUrl({ url: res.url, serverName, timeoutMs: opts.timeoutMs });
	}
	if (res.launch) {
		return connectStdio({
			...res.launch,
			serverName,
			timeoutMs: opts.timeoutMs,
		});
	}
	if (res.dir && opts.exec && opts.exec !== "off") {
		const launch = await launchFromDir(res.dir);
		if (launch) {
			return connectStdio({
				command: launch.command,
				args: launch.args,
				cwd: res.dir,
				serverName,
				timeoutMs: opts.timeoutMs,
			});
		}
	}
	throw new Error(
		"no metadata source (need url, stdio, or --exec on a launchable dir)",
	);
}

export async function scan(
	raw: string,
	opts: ScanOptions = {},
): Promise<ScanReport> {
	const started = Date.now();
	const res = await resolve(raw);
	const findings: Finding[] = [];
	const errors: { scanner: string; message: string }[] = [];
	const layers = { metadata: false, static: false };
	let tools: ScanReport["tools"];

	const wantsMetadata =
		res.url || res.launch || (res.dir && opts.exec && opts.exec !== "off");
	if (wantsMetadata) {
		try {
			const inv = await getInventory(res, opts);
			const metadataFindings = analyzeInventory(inv);
			findings.push(...metadataFindings);

			const apiKey = process.env.OPENROUTER_API_KEY;
			if (opts.llm && apiKey) {
				const median = medianDescLength(
					inv.tools.map((t) => t.description ?? ""),
				);
				const judged = await judgeInventory(inv, {
					apiKey,
					heuristicFindings: metadataFindings,
					medianLen: median,
					timeoutMs: opts.timeoutMs,
				});
				findings.push(...judged.findings);
				if (judged.error)
					errors.push({ scanner: "llm-judge", message: judged.error });
			}

			tools = inv.tools.map((t) => {
				const labels = classifyTool(t.name, t.description);
				const desc = (t.description ?? "").trim();
				return {
					name: t.name,
					descriptionHash: sha256(t.description ?? ""),
					...(desc ? { description: desc.slice(0, 300) } : {}),
					...(labels.length ? { labels } : {}),
				};
			});
			layers.metadata = true;
		} catch (e) {
			errors.push({ scanner: "metadata", message: (e as Error).message });
		}
	}

	if (res.dir) {
		try {
			const r = await scanStatic(res.dir);
			findings.push(...r.findings);
			layers.static = true;
		} catch (e) {
			errors.push({ scanner: "static", message: (e as Error).message });
		}
	}

	const { score, breakdown } = scoreFindings(findings);

	return {
		schemaVersion: 1,
		scanner: { version: SCANNER_VERSION, rules: String(CHECKS_VERSION) },
		target: res.target,
		scannedAt: new Date(started).toISOString(),
		durationMs: Date.now() - started,
		layers,
		tools,
		findings,
		score,
		scoreBreakdown: breakdown,
		errors,
	};
}
