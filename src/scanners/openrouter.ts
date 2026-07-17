const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

// Free-tier rate limit is ~20 req/min. Serialize calls with a minimum spacing
// so concurrent callers (batch scans) don't get 429'd.
// ponytail: process-global gate; fine because LLM calls are rare and batch is
// the only concurrent caller.
const MIN_SPACING_MS = Number(process.env.MCPSCAN_LLM_SPACING_MS ?? 3000);
let gate: Promise<void> = Promise.resolve();

function throttle(): Promise<void> {
	const wait = gate;
	let release: () => void;
	gate = new Promise((r) => {
		release = r;
	});
	return wait.then(() => {
		setTimeout(() => release(), MIN_SPACING_MS);
	});
}

export interface ChatResult {
	content?: string;
	error?: string;
	status?: number;
}

// One throttled chat-completion call. Never throws: network/HTTP failures come
// back as `error` (+ `status` for HTTP errors so callers can react to 429).
export async function chatCompletion(opts: {
	apiKey: string;
	system: string;
	user: string;
	timeoutMs?: number;
}): Promise<ChatResult> {
	await throttle();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);
	try {
		const res = await fetch(ENDPOINT, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${opts.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: MODEL,
				messages: [
					{ role: "system", content: opts.system },
					{ role: "user", content: opts.user },
				],
				temperature: 0,
			}),
			signal: controller.signal,
		});
		if (!res.ok)
			return {
				error: `openrouter ${res.status}: ${await res.text()}`,
				status: res.status,
			};
		const data = (await res.json()) as {
			choices?: { message?: { content?: string } }[];
		};
		return { content: data.choices?.[0]?.message?.content ?? "" };
	} catch (e) {
		return { error: (e as Error).message };
	} finally {
		clearTimeout(timer);
	}
}
