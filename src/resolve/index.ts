import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { execa } from "execa";
import type { ScanTarget, TargetKind } from "../model.js";

export interface Resolved {
	target: ScanTarget;
	// Directory with source, if available (enables static scan).
	dir?: string;
	// How to launch the server for a live metadata scan, if applicable.
	launch?: { command: string; args: string[]; cwd?: string };
	url?: string;
}

export function parseTarget(raw: string): { kind: TargetKind; ref: string } {
	const schemeMatch = raw.match(/^(npm|pypi|gh|url|stdio):(.+)$/s);
	if (schemeMatch) {
		const scheme = schemeMatch[1];
		const rest = schemeMatch[2];
		if (scheme === "gh") return { kind: "github", ref: rest };
		return { kind: scheme as TargetKind, ref: rest };
	}
	return { kind: "local", ref: raw };
}

async function tmp(prefix: string): Promise<string> {
	return mkdtemp(join(tmpdir(), `otter-${prefix}-`));
}

export async function resolve(raw: string): Promise<Resolved> {
	const { kind, ref } = parseTarget(raw);

	if (kind === "local") {
		return { target: { kind, ref }, dir: resolvePath(ref) };
	}

	if (kind === "stdio") {
		const [command, ...args] = ref.trim().split(/\s+/);
		return { target: { kind, ref }, launch: { command, args } };
	}

	if (kind === "url") {
		return { target: { kind, ref }, url: ref };
	}

	if (kind === "github") {
		const dir = await tmp("gh");
		const [repo, refspec] = ref.split("@");
		await execa("git", [
			"clone",
			"--depth",
			"1",
			`https://github.com/${repo}.git`,
			dir,
		]);
		if (refspec) {
			await execa("git", ["fetch", "--depth", "1", "origin", refspec], {
				cwd: dir,
			});
			await execa("git", ["checkout", "FETCH_HEAD"], { cwd: dir });
		}
		const commit = await execa("git", ["rev-parse", "HEAD"], { cwd: dir })
			.then((r) => r.stdout.trim())
			.catch(() => undefined);
		return { target: { kind, ref, resolvedCommit: commit }, dir };
	}

	if (kind === "npm") {
		const dir = await tmp("npm");
		// `npm pack` downloads the tarball without running install scripts.
		const { stdout } = await execa("npm", ["pack", ref, "--json"], {
			cwd: dir,
		});
		const packed = JSON.parse(stdout) as {
			filename: string;
			version: string;
		}[];
		const file = packed[0]?.filename;
		await execa("tar", ["-xzf", file, "--strip-components", "1"], { cwd: dir });
		return { target: { kind, ref, resolvedVersion: packed[0]?.version }, dir };
	}

	// pypi: download + extract left for a later milestone.
	throw new Error(`target kind "${kind}" not yet supported`);
}
