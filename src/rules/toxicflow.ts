import type { Finding, FlowLabel } from "../model.js";
import type { ToolInfo } from "../scanners/metadata.js";

// "Lethal trifecta" reasoning: a single server (or co-installed set) is
// dangerous when it can read attacker-controlled content, touch private data,
// AND send data to an external party — an injected comment/email can then steer
// the model into exfiltrating secrets. We classify each tool into capability
// legs by keyword, then flag the combination.

// Reads content authored by third parties — the prompt-injection carrier.
// Requires a read verb AND an untrusted-content noun so "delete_comment" (a
// destructive op, not a read) is not mislabeled.
const READ_VERB_RE =
	/\b(get|read|list|fetch|search|retrieve|view|load|browse|scrape|crawl|check|open|receive)\b/;
const UNTRUSTED_NOUN_RE =
	/\b(comments?|issues?|emails?|inbox|messages?|tickets?|reviews?|posts?|threads?|web ?pages?|urls?|html|feeds?|rss|notifications?|pull ?requests?|prs?|dms?|chats?|transcripts?)\b/;

// Can access private/sensitive data.
const PRIVATE_DATA_RE =
	/\b(secrets?|api ?keys?|tokens?|credentials?|passwords?|private|ssh|\.env|env vars?|environment variables?|vault|wallet|files?|documents?|database|db|records?|contacts?)\b/;

// Can transmit data to an external party.
const PUBLIC_SINK_RE =
	/\b(send|post|publish|upload|share|submit|forward|tweet|broadcast|email|sms|notify|webhook|http ?request)\b|\bcreate (issue|comment|pr|pull ?request)\b/;

// Can destroy or mutate state / execute code.
const DESTRUCTIVE_RE =
	/\b(delete|remove|drop|destroy|overwrite|modify|execute|exec|run|eval|kill|terminate|truncate|format|reset)\b/;

function haystack(name: string, description?: string): string {
	return `${name.replace(/[_-]/g, " ")} ${description ?? ""}`.toLowerCase();
}

// Capability labels for one tool. Exported so scan.ts can persist them on the
// ToolSnapshot for later inspection and site rendering.
export function classifyTool(name: string, description?: string): FlowLabel[] {
	const h = haystack(name, description);
	const labels: FlowLabel[] = [];
	if (READ_VERB_RE.test(h) && UNTRUSTED_NOUN_RE.test(h))
		labels.push("untrusted-content");
	if (PRIVATE_DATA_RE.test(h)) labels.push("private-data");
	if (PUBLIC_SINK_RE.test(h)) labels.push("public-sink");
	if (DESTRUCTIVE_RE.test(h)) labels.push("destructive");
	return labels;
}

// One server-level finding when an untrusted-content reader coexists with a
// public sink (the exfil channel). Private-data presence upgrades it to the
// full lethal trifecta.
export function toxicFlowFindings(
	tools: ToolInfo[],
	serverName: string,
): Finding[] {
	const legs: Record<FlowLabel, string[]> = {
		"untrusted-content": [],
		"private-data": [],
		"public-sink": [],
		destructive: [],
	};
	for (const t of tools) {
		for (const label of classifyTool(t.name, t.description))
			legs[label].push(t.name);
	}

	const hasUntrusted = legs["untrusted-content"].length > 0;
	const hasSink = legs["public-sink"].length > 0;
	if (!hasUntrusted || !hasSink) return [];

	const hasPrivate = legs["private-data"].length > 0;
	const parts = [
		`Untrusted content: ${legs["untrusted-content"].join(", ")}`,
		hasPrivate ? `Private data: ${legs["private-data"].join(", ")}` : null,
		`Public sink: ${legs["public-sink"].join(", ")}`,
		legs.destructive.length
			? `Destructive: ${legs.destructive.join(", ")}`
			: null,
	].filter(Boolean) as string[];
	const listing = parts.join(" · ");

	return [
		{
			id: "MCP-TOXIC-FLOW-001",
			severity: hasPrivate ? "high" : "medium",
			category: "toxic-flow",
			title: hasPrivate
				? "Lethal trifecta: untrusted input + private data + external sink"
				: "Toxic flow: untrusted input can reach an external sink",
			detail: `Server "${serverName}" exposes tools that together enable an exfiltration flow. ${listing}.`,
			evidence: { source: `server:${serverName}`, snippet: listing },
			confidence: hasPrivate ? 0.6 : 0.45,
			remediation:
				"Do not co-install these capabilities under one trust boundary; an injected comment/email can steer the model to exfiltrate via the sink tool.",
		},
	];
}
