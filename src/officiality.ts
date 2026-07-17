import { readFile } from "node:fs/promises";

// Whether a catalog entry is published by the vendor of the underlying service
// (official), by the community (unofficial), or can't be told (unknown).
//
// The MCP registry verifies *namespace ownership* (GitHub OAuth for io.github.*,
// DNS/HTTP for domain namespaces) but does NOT flag official vs community — it
// leaves curation to consumers. Deterministic rules decide what they can from
// the reverse-DNS `id`; io.github orgs the rules can't vouch for are judged
// once by an LLM (see classify-officiality.ts) and the verdict persisted in
// data/officiality.json. Rules always shadow stored verdicts, so adding an org
// to VENDOR_GITHUB_ORGS later overrides a stale LLM verdict automatically.

export type Officiality = "official" | "unofficial" | "unknown";
export type RuleVerdict = Officiality | "undecided";

export interface StoredVerdict {
	verdict: "official" | "unofficial";
	method: "llm";
	model: string;
	decidedAt: string;
	reason?: string;
}
export type VerdictMap = Record<string, StoredVerdict>;

export const OFFICIALITY_FILE = "data/officiality.json";

// Namespaces that verify ownership of ONE domain but republish many
// third-party servers under it. Their verification proves the aggregator, not
// the server's vendor — so entries under them are never "official".
export const AGGREGATOR_NAMESPACES = new Set<string>(["ai.smithery"]);

// GitHub orgs whose io.github.<org>/* servers are first-party vendor builds.
// Fast-path only — orgs not listed here get an LLM verdict instead of a
// hardcoded "unofficial". Seeded from the "Official Integrations" list in
// modelcontextprotocol/servers.
export const VENDOR_GITHUB_ORGS = new Set<string>([
	"awslabs",
	"aws-samples",
	"microsoft",
	"azure",
	"github",
	"modelcontextprotocol",
	"stripe",
	"cloudflare",
	"elastic",
	"grafana",
	"redis",
	"mongodb",
	"supabase",
	"neondatabase",
	"pinecone-io",
	"qdrant",
	"chroma-core",
	"sentry",
	"paypal",
	"heroku",
	"cloudinary",
	"hashicorp",
	"apify",
	"e2b-dev",
	"browserbase",
	"notionhq",
	"slackapi",
]);

// Pure namespace rules. "undecided" = a github org the static table can't
// vouch for — the LLM classifier's candidate set.
export function classifyByRule(id: string): RuleVerdict {
	const slashIdx = id.indexOf("/");
	if (slashIdx <= 0) return "unknown";
	const namespace = id.slice(0, slashIdx).toLowerCase();

	if (AGGREGATOR_NAMESPACES.has(namespace)) return "unofficial";

	const gh = /^(?:io|com)\.github\.(.+)$/.exec(namespace);
	if (gh) return VENDOR_GITHUB_ORGS.has(gh[1]) ? "official" : "undecided";

	// Any other registry-verified custom domain is the vendor itself.
	return "official";
}

// Confident rule first, then the persisted LLM verdict, then "unofficial" —
// the base rate for community github publishers, and what undecided entries
// showed before the classifier existed.
export function classifyOfficiality(
	id: string,
	verdicts?: VerdictMap,
): Officiality {
	const rule = classifyByRule(id);
	if (rule !== "undecided") return rule;
	return verdicts?.[id]?.verdict ?? "unofficial";
}

// Tolerant loader: a missing or corrupt verdict file just means "no verdicts
// yet" — callers degrade to rule-only classification.
export async function loadVerdicts(
	path: string = OFFICIALITY_FILE,
): Promise<VerdictMap> {
	try {
		const parsed = JSON.parse(await readFile(path, "utf8")) as {
			verdicts?: VerdictMap;
		};
		return parsed.verdicts ?? {};
	} catch {
		return {};
	}
}
