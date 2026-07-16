// Whether a catalog entry is published by the vendor of the underlying service
// (official), by the community (unofficial), or can't be told (unknown).
//
// The MCP registry verifies *namespace ownership* (GitHub OAuth for io.github.*,
// DNS/HTTP for domain namespaces) but does NOT flag official vs community — it
// leaves curation to consumers. So we derive it from the reverse-DNS `id`:
//   - a verified custom domain (com.microsoft/…) is the vendor itself → official
//   - io.github.<org> is official only if <org> is a known vendor org
//   - aggregators publishing many third-party servers under one namespace →
//     unofficial regardless
// Derived at summarize/render time from `id` alone, so it never needs a re-scan.

export type Officiality = "official" | "unofficial" | "unknown";

// Namespaces that verify ownership of ONE domain but republish many
// third-party servers under it. Their verification proves the aggregator, not
// the server's vendor — so entries under them are never "official".
export const AGGREGATOR_NAMESPACES = new Set<string>(["ai.smithery"]);

// GitHub orgs whose io.github.<org>/* servers are first-party vendor builds.
// Seeded from the "Official Integrations" list in modelcontextprotocol/servers.
// Static table — add orgs as new vendors publish under io.github.
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

// Namespace = the part before the first "/" (lowercased). io.github.<owner> is
// treated specially since the owner is what identifies the vendor there.
export function classifyOfficiality(id: string): Officiality {
	const slashIdx = id.indexOf("/");
	if (slashIdx <= 0) return "unknown";
	const namespace = id.slice(0, slashIdx).toLowerCase();

	if (AGGREGATOR_NAMESPACES.has(namespace)) return "unofficial";

	const gh = /^(?:io|com)\.github\.(.+)$/.exec(namespace);
	if (gh) return VENDOR_GITHUB_ORGS.has(gh[1]) ? "official" : "unofficial";

	// Any other registry-verified custom domain is the vendor itself.
	return "official";
}
