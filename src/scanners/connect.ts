import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Inventory, ToolInfo, ToolListDiff } from "./metadata.js";

// Diff two tool lists by name; `changed` = same name, different description.
export function diffToolLists(a: ToolInfo[], b: ToolInfo[]): ToolListDiff {
	const am = new Map(a.map((t) => [t.name, t.description ?? ""]));
	const bm = new Map(b.map((t) => [t.name, t.description ?? ""]));
	const added = [...bm.keys()].filter((n) => !am.has(n));
	const removed = [...am.keys()].filter((n) => !bm.has(n));
	const changed = [...am.keys()].filter(
		(n) => bm.has(n) && am.get(n) !== bm.get(n),
	);
	return { added, removed, changed };
}

async function collect(client: Client, serverName: string): Promise<Inventory> {
	const tools: ToolInfo[] = [];
	const prompts: { name: string; description?: string }[] = [];

	const toolRes = await client.listTools().catch(() => ({ tools: [] }));
	for (const t of toolRes.tools ?? []) {
		tools.push({
			name: t.name,
			description: t.description,
			inputSchema: t.inputSchema,
		});
	}

	const promptRes = await client.listPrompts().catch(() => ({ prompts: [] }));
	for (const p of promptRes.prompts ?? []) {
		prompts.push({ name: p.name, description: p.description });
	}

	const inv: Inventory = { serverName, tools, prompts };

	// Re-poll probe: a well-behaved server returns the same tools twice. One that
	// serves different tools per call can pass review then swap in a poisoned set.
	// Own short timeout + swallow errors so the probe never fails the scan.
	if (tools.length > 0) {
		const second = await withTimeout(client.listTools(), 5000, "repoll")
			.then((r) =>
				(r.tools ?? []).map((t) => ({
					name: t.name,
					description: t.description,
				})),
			)
			.catch(() => null);
		if (second) {
			const diff = diffToolLists(tools, second);
			if (diff.added.length || diff.removed.length || diff.changed.length)
				inv.repollDiff = diff;
		}
	}

	return inv;
}

// Connect to a local stdio MCP server. `env` is passed through explicitly so the
// caller controls what the child process sees (empty for untrusted targets).
export async function connectStdio(opts: {
	command: string;
	args?: string[];
	cwd?: string;
	env?: Record<string, string>;
	serverName: string;
	timeoutMs?: number;
}): Promise<Inventory> {
	const client = new Client(
		{ name: "mcpscan", version: "0.1.0" },
		{ capabilities: {} },
	);
	const transport = new StdioClientTransport({
		command: opts.command,
		args: opts.args ?? [],
		cwd: opts.cwd,
		env: opts.env ?? {},
	});
	try {
		await withTimeout(
			client.connect(transport),
			opts.timeoutMs ?? 30000,
			"connect",
		);
		return await withTimeout(
			collect(client, opts.serverName),
			opts.timeoutMs ?? 30000,
			"list",
		);
	} finally {
		await client.close().catch(() => {});
	}
}

export async function connectUrl(opts: {
	url: string;
	serverName: string;
	timeoutMs?: number;
}): Promise<Inventory> {
	const client = new Client(
		{ name: "mcpscan", version: "0.1.0" },
		{ capabilities: {} },
	);
	const transport = new StreamableHTTPClientTransport(new URL(opts.url));
	try {
		await withTimeout(
			client.connect(transport),
			opts.timeoutMs ?? 30000,
			"connect",
		);
		return await withTimeout(
			collect(client, opts.serverName),
			opts.timeoutMs ?? 30000,
			"list",
		);
	} finally {
		await client.close().catch(() => {});
	}
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
	return Promise.race([
		p,
		new Promise<T>((_, reject) =>
			setTimeout(
				() => reject(new Error(`timeout during ${label} after ${ms}ms`)),
				ms,
			),
		),
	]);
}
