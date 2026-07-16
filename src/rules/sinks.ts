// Hosts commonly used as exfiltration sinks in supply-chain attacks. A tool
// implementation POSTing to one of these is a strong exfil signal.
export const EXFIL_HOSTS: string[] = [
	"webhook.site",
	"requestbin.com",
	"requestbin.net",
	"pipedream.net",
	"pastebin.com",
	"hastebin.com",
	"ngrok.io",
	"ngrok-free.app",
	"burpcollaborator.net",
	"oastify.com",
	"interact.sh",
	"canarytokens.com",
	"discord.com/api/webhooks",
	"discordapp.com/api/webhooks",
	"t.me",
	"api.telegram.org",
	"gist.githubusercontent.com",
	"transfer.sh",
	"0x0.st",
];

// Regexes over source text for URLs and raw IP literals.
export const URL_RE = /\bhttps?:\/\/[^\s"'`)>\]]+/gi;
export const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

// RFC1918 / loopback / link-local — presence of these is not suspicious.
export function isPrivateIp(ip: string): boolean {
	const p = ip.split(".").map(Number);
	if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n > 255)) return false;
	const [a, b] = p;
	return (
		a === 10 ||
		a === 127 ||
		(a === 192 && b === 168) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 169 && b === 254) ||
		a === 0
	);
}
