#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type CatalogRow,
	isScannable,
	rankRows,
	rowFromReport,
} from "./catalog.js";
import type { ServerEntry } from "./discover.js";
import type { ScanReport } from "./model.js";
import { slug } from "./util/slug.js";

const SERVERS = "data/servers.json";
const RESULTS_DIR = "data/results";
const SUMMARY = "data/summary.json";

// Rebuild summary.json from servers.json + whatever result files exist. Decoupled
// from scanning so sharded/parallel scan jobs can be merged into one catalog.
async function main(): Promise<void> {
	const servers = JSON.parse(await readFile(SERVERS, "utf8")) as ServerEntry[];
	const rows: CatalogRow[] = [];
	let missing = 0;

	for (const entry of servers) {
		if (!isScannable(entry.scanTarget)) continue;
		const path = join(RESULTS_DIR, `${slug(entry.id)}.json`);
		const text = await readFile(path, "utf8").catch(() => "");
		if (!text) {
			missing++;
			continue;
		}
		rows.push(rowFromReport(JSON.parse(text) as ScanReport, entry));
	}

	const ranked = rankRows(rows);
	await writeFile(SUMMARY, `${JSON.stringify(ranked, null, 2)}\n`);
	process.stderr.write(
		`Summarized ${ranked.length} servers → ${SUMMARY} (${missing} not yet scanned)\n`,
	);
}

main().catch((e) => {
	process.stderr.write(`summarize: ${(e as Error).message}\n`);
	process.exit(1);
});
