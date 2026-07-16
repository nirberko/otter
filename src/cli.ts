#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
	SEVERITIES,
	type ScanReport,
	type Severity,
	severityRank,
} from "./model.js";
import { renderJson } from "./report/json.js";
import { renderSarif } from "./report/sarif.js";
import { renderTerminal } from "./report/terminal.js";
import { applyBaseline } from "./rules/rugpull.js";
import { type ScanOptions, scan } from "./scan.js";
import { CHECKS_VERSION, SCANNER_VERSION } from "./version.js";

const USAGE = `mcpscan <target> [options]

targets:
  npm:<pkg>[@version]   pypi:<pkg>   gh:<owner>/<repo>[@ref]
  ./path                url:https://host/mcp   stdio:"cmd --args"

options:
  --format <fmt>       output format: terminal (default) | json | sarif
  --json               alias for --format json
  --out <file>         write the report (in --format) to file
  --exec               launch code targets for a live metadata scan (host)
  --no-exec            never launch server code (static only)
  --llm                second-opinion LLM review (needs OPENROUTER_API_KEY)
  --baseline <file>    compare tools against a previous JSON report (rug-pull check)
  --fail-on <sev>      exit 2 if any finding >= severity (info|low|medium|high|critical)
  --timeout <ms>       per-scanner timeout (default 30000)
  -v, --version        print scanner version + checks fingerprint
  -h, --help`;

function render(report: ScanReport, format: string): string {
	if (format === "sarif") return renderSarif(report);
	if (format === "json") return renderJson(report);
	return renderTerminal(report);
}

async function main(): Promise<number> {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			format: { type: "string" },
			json: { type: "boolean", default: false },
			out: { type: "string" },
			exec: { type: "boolean", default: false },
			"no-exec": { type: "boolean", default: false },
			llm: { type: "boolean", default: false },
			baseline: { type: "string" },
			"fail-on": { type: "string" },
			timeout: { type: "string" },
			help: { type: "boolean", short: "h", default: false },
			version: { type: "boolean", short: "v", default: false },
		},
	});

	if (values.version) {
		process.stdout.write(
			`mcpscan v${SCANNER_VERSION} (checks ${CHECKS_VERSION})\n`,
		);
		return 0;
	}

	if (values.help || positionals.length === 0) {
		process.stdout.write(`${USAGE}\n`);
		return values.help ? 0 : 1;
	}

	const format = values.json ? "json" : (values.format ?? "terminal");
	if (!["terminal", "json", "sarif"].includes(format)) {
		process.stderr.write(
			`invalid --format "${format}"; use terminal, json, or sarif\n`,
		);
		return 1;
	}

	const failOn = values["fail-on"] as Severity | undefined;
	if (failOn && !SEVERITIES.includes(failOn)) {
		process.stderr.write(
			`invalid --fail-on "${failOn}"; use one of ${SEVERITIES.join(", ")}\n`,
		);
		return 1;
	}

	const opts: ScanOptions = {
		exec: values["no-exec"] ? "off" : values.exec ? "trusted" : undefined,
		timeoutMs: values.timeout ? Number(values.timeout) : undefined,
		llm: values.llm,
	};

	let report = await scan(positionals[0], opts);

	if (values.baseline) {
		let baseline: ScanReport;
		try {
			baseline = JSON.parse(
				await readFile(values.baseline, "utf8"),
			) as ScanReport;
		} catch (e) {
			process.stderr.write(
				`could not read --baseline "${values.baseline}": ${(e as Error).message}\n`,
			);
			return 1;
		}
		report = applyBaseline(report, baseline);
	}

	const out = render(report, format);
	if (values.out) await writeFile(values.out, out);
	process.stdout.write(`${out}\n`);

	if (failOn) {
		const threshold = severityRank(failOn);
		if (report.findings.some((f) => severityRank(f.severity) >= threshold))
			return 2;
	}
	return 0;
}

main()
	.then((code) => process.exit(code))
	.catch((e) => {
		process.stderr.write(`mcpscan: ${(e as Error).message}\n`);
		process.exit(1);
	});
