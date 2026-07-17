#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { slug } from "./util/slug.js";

const REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers";
const OUT = "data/servers.json";
const STATE = "data/state.json";
const CHANGED = "data/changed.json";

export interface ServerEntry {
	id: string;
	title?: string;
	description?: string;
	version?: string;
	// Best target string for `otter`, chosen by preference: npm > pypi > remote.
	scanTarget?: string;
	sources: { npm?: string; pypi?: string; oci?: string; remote?: string };
	registryStatus?: string;
	addedAt: string;
	updatedAt?: string;
}

interface State {
	lastDiscoveredAt?: string;
	lastFullAt?: string;
}

interface RegistryServer {
	server: {
		name: string;
		title?: string;
		description?: string;
		version?: string;
		packages?: {
			registryType?: string;
			identifier: string;
			version?: string;
		}[];
		remotes?: { type?: string; url: string }[];
	};
	_meta?: {
		"io.modelcontextprotocol.registry/official"?: {
			status?: string;
			updatedAt?: string;
			isLatest?: boolean;
		};
	};
}

function toEntry(raw: RegistryServer, now: string): ServerEntry {
	const s = raw.server;
	const sources: ServerEntry["sources"] = {};
	for (const p of s.packages ?? []) {
		if (p.registryType === "npm" && !sources.npm) sources.npm = p.identifier;
		else if (p.registryType === "pypi" && !sources.pypi)
			sources.pypi = p.identifier;
		else if (p.registryType === "oci" && !sources.oci)
			sources.oci = p.identifier;
	}
	if (s.remotes?.length) sources.remote = s.remotes[0].url;

	let scanTarget: string | undefined;
	if (sources.npm) scanTarget = `npm:${sources.npm}`;
	else if (sources.pypi) scanTarget = `pypi:${sources.pypi}`;
	else if (sources.remote) scanTarget = `url:${sources.remote}`;

	const meta = raw._meta?.["io.modelcontextprotocol.registry/official"];
	return {
		id: s.name,
		title: s.title,
		description: s.description,
		version: s.version,
		scanTarget,
		sources,
		registryStatus: meta?.status,
		addedAt: now,
		updatedAt: meta?.updatedAt,
	};
}

// Sequential cursor crawl. `since` (ISO) narrows to changed servers; `version=latest`
// collapses per-version duplicate rows server-side.
async function fetchServers(
	max: number,
	since?: string,
): Promise<RegistryServer[]> {
	const out: RegistryServer[] = [];
	let cursor: string | undefined;
	do {
		const url = new URL(REGISTRY);
		url.searchParams.set("limit", "100");
		url.searchParams.set("version", "latest");
		if (since) url.searchParams.set("updated_since", since);
		if (cursor) url.searchParams.set("cursor", cursor);
		const res = await fetch(url, { headers: { Accept: "application/json" } });
		if (!res.ok) throw new Error(`registry ${res.status} ${res.statusText}`);
		const page = (await res.json()) as {
			servers: RegistryServer[];
			metadata?: { nextCursor?: string };
		};
		out.push(...page.servers);
		cursor = page.metadata?.nextCursor;
		process.stderr.write(`  fetched ${out.length}\r`);
	} while (cursor && out.length < max);
	process.stderr.write("\n");
	return out.slice(0, max);
}

async function loadJson<T>(path: string, fallback: T): Promise<T> {
	const text = await readFile(path, "utf8").catch(() => "");
	return text ? (JSON.parse(text) as T) : fallback;
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			max: { type: "string" },
			out: { type: "string" },
			since: { type: "string" },
			full: { type: "boolean", default: false },
		},
	});
	const outPath = values.out ?? OUT;
	const now = new Date().toISOString();

	const state = await loadJson<State>(STATE, {});
	const existingArr = await loadJson<ServerEntry[]>(outPath, []);
	const merged = new Map(existingArr.map((e) => [e.id, e]));

	// Incremental needs a timestamp; without one (or with --full) do a full walk.
	const since = values.since ?? state.lastDiscoveredAt;
	const full = values.full || !since;
	const max = values.max ? Number(values.max) : full ? 100000 : 5000;

	process.stderr.write(
		`Discovering (${full ? "FULL" : `incremental since ${since ?? "beginning"}`}, max ${max})...\n`,
	);
	const raw = await fetchServers(max, full ? undefined : since);

	// Latest wins per id (belt-and-suspenders; version=latest already dedupes).
	const latest = new Map<string, RegistryServer>();
	for (const r of raw) {
		const isLatest =
			r._meta?.["io.modelcontextprotocol.registry/official"]?.isLatest;
		if (!latest.has(r.server.name) || isLatest) latest.set(r.server.name, r);
	}

	let added = 0;
	let changed = 0;
	const changedIds: string[] = [];
	for (const rawServer of latest.values()) {
		const entry = toEntry(rawServer, now);
		const prev = merged.get(entry.id);
		if (!prev) {
			added++;
			changedIds.push(entry.id);
		} else {
			entry.addedAt = prev.addedAt;
			if (prev.version !== entry.version) {
				changed++;
				changedIds.push(entry.id);
			}
		}
		merged.set(entry.id, entry);
	}

	// Collapse ids that slug() to the same filename (e.g. case-only variants of the
	// same GitHub repo). Two entries sharing a slug would land in different shards and
	// race on the same data/results/*.json during artifact merge — keep one, newest wins.
	const bySlug = new Map<string, ServerEntry>();
	for (const e of merged.values()) {
		const key = slug(e.id);
		const kept = bySlug.get(key);
		if (!kept || (e.updatedAt ?? "") > (kept.updatedAt ?? ""))
			bySlug.set(key, e);
	}

	const entries = [...bySlug.values()].sort((a, b) => a.id.localeCompare(b.id));
	await mkdir(dirname(outPath), { recursive: true });
	await writeFile(outPath, `${JSON.stringify(entries, null, 2)}\n`);
	await writeFile(CHANGED, `${JSON.stringify(changedIds.sort(), null, 2)}\n`);

	await writeFile(
		STATE,
		`${JSON.stringify({ lastDiscoveredAt: now, lastFullAt: full ? now : state.lastFullAt }, null, 2)}\n`,
	);

	const scannable = entries.filter((e) => e.scanTarget).length;
	process.stderr.write(
		`\ntotal ${entries.length} servers → ${outPath}\n` +
			`  fetched this run: ${latest.size}  new: ${added}  version-changed: ${changed}  scannable: ${scannable}\n`,
	);
}

main().catch((e) => {
	process.stderr.write(`discover: ${(e as Error).message}\n`);
	process.exit(1);
});
