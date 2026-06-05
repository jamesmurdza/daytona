/**
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live end-to-end integration test.
 *
 * Loads the real extension (index.ts) via Pi's jiti loader against a stub
 * ExtensionAPI/Context, then drives the full v1 journey against REAL Daytona:
 * create + clone, every tool (bash/read/write/edit/ls/find/grep), the system
 * prompt cwd rewrite, /sandbox status + url, preview-URL reachability, and
 * ephemeral teardown.
 *
 * Requires DAYTONA_API_KEY in the environment.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const piRequire = createRequire(
	path.join(root, "node_modules/@earendil-works/pi-coding-agent/package.json"),
);
const { createJiti } = piRequire("jiti");
const jiti = createJiti(import.meta.url);

// Capture created sandboxes via the ESM build jiti loads, so teardown can
// verify deletion by full id (avoids list-indexing lag).
const { Daytona } = await import("@daytona/sdk");
const created = [];
const origCreate = Daytona.prototype.create;
Daytona.prototype.create = async function (...a) {
	const sb = await origCreate.apply(this, a);
	created.push(sb);
	return sb;
};

// --- test bookkeeping ---
let pass = 0;
let fail = 0;
const failures = [];
function ok(msg) {
	pass++;
	console.log(`  ✓ ${msg}`);
}
function bad(msg, detail) {
	fail++;
	failures.push(msg);
	console.log(`  ✗ ${msg}${detail ? ` — ${detail}` : ""}`);
}
function check(cond, msg, detail) {
	if (cond) ok(msg);
	else bad(msg, detail);
}
const getText = (result) =>
	(result?.content ?? [])
		.filter((c) => c.type === "text")
		.map((c) => c.text)
		.join("\n");

// --- stub Pi API + context ---
const tools = new Map();
const commands = new Map();
const handlers = new Map();
const notifications = [];
const statuses = [];
const flagValues = {
	daytona: true,
	repo: "https://github.com/octocat/Hello-World",
	branch: undefined,
	snapshot: undefined,
	public: false,
};

const pi = {
	registerFlag: () => {},
	registerTool: (tool) => tools.set(tool.name, tool),
	registerCommand: (name, opts) => commands.set(name, opts),
	on: (event, handler) => handlers.set(event, handler),
	getFlag: (name) => flagValues[name],
};

const ctx = {
	hasUI: false, // env key present, so resolveApiKey won't prompt
	cwd: process.cwd(),
	ui: {
		notify: (message, type) => notifications.push({ message, type }),
		setStatus: (_key, text) => statuses.push(text),
		input: async () => undefined,
		select: async () => undefined,
		confirm: async () => false,
		theme: { fg: (_color, text) => text },
	},
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exec = (tool, params) => tools.get(tool).execute(`t-${tool}-${Date.now()}`, params, undefined, () => {});

async function main() {
	const mod = await jiti.import(path.join(root, "index.ts"));
	(mod.default ?? mod)(pi);
	console.log(`Loaded extension: ${tools.size} tools, ${commands.size} commands, ${handlers.size} events\n`);

	// 1. Lifecycle: session_start -> real sandbox + clone
	console.log("1. session_start (create + clone)");
	const t0 = Date.now();
	await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
	const ready = notifications.find((n) => /Sandbox ready/.test(n.message));
	check(!!ready, "sandbox created and 'ready' notice shown", ready?.message);
	check(statuses.some((s) => s && /running/.test(s)), "footer status shows running");
	if (!ready) {
		const errN = notifications.find((n) => n.type === "error");
		throw new Error(`session_start did not become ready: ${errN?.message ?? "unknown"}`);
	}
	console.log(`  (startup took ${((Date.now() - t0) / 1000).toFixed(1)}s)`);

	// 2. bash runs in the sandbox (pwd == sandbox cwd, not host)
	console.log("2. bash tool");
	const pwd = await exec("bash", { command: "pwd" });
	const pwdText = getText(pwd).trim();
	check(pwdText.includes("/home/daytona/Hello-World"), "bash pwd is the sandbox repo dir", pwdText);
	check(!pwdText.includes(root), "bash did NOT run on the host");

	// 3. write -> read -> edit -> read round-trip
	console.log("3. write / read / edit");
	await exec("write", { path: "note.txt", content: "hello\nworld\n" });
	const read1 = getText(await exec("read", { path: "note.txt" }));
	check(/hello/.test(read1) && /world/.test(read1), "read returns written content", read1.replace(/\n/g, "\\n"));
	await exec("edit", { path: "note.txt", edits: [{ oldText: "world", newText: "daytona" }] });
	const read2 = getText(await exec("read", { path: "note.txt" }));
	check(/daytona/.test(read2) && !/world/.test(read2), "edit applied (world -> daytona)", read2.replace(/\n/g, "\\n"));

	// 4. ls lists the repo + new file
	console.log("4. ls tool");
	const ls = getText(await exec("ls", { path: "." }));
	check(/README/.test(ls), "ls shows cloned README");
	check(/note\.txt/.test(ls), "ls shows newly written note.txt");

	// 5. find by filename
	console.log("5. find tool");
	await exec("write", { path: "sub/deep/marker.log", content: "x" });
	const find = getText(await exec("find", { pattern: "**/marker.log" }));
	check(/marker\.log/.test(find), "find locates nested file by glob", find);

	// 6. grep file contents (runs inside the sandbox)
	console.log("6. grep tool");
	await exec("write", { path: "haystack.txt", content: "alpha\nNEEDLE_123\ngamma\n" });
	const grep = getText(await exec("grep", { pattern: "NEEDLE_123" }));
	check(/NEEDLE_123/.test(grep), "grep finds the needle in the sandbox", grep);
	const grepNone = getText(await exec("grep", { pattern: "zzz_no_such_token_zzz" }));
	check(/No matches found/.test(grepNone), "grep reports no matches cleanly");

	// 7. before_agent_start rewrites cwd — use a host path UNLIKE process.cwd()
	// to prove the regex match doesn't depend on assuming Pi's prompt cwd.
	console.log("7. before_agent_start cwd rewrite");
	const hostCwd = "/some/unrelated/host/path";
	const fakePrompt = `You are an agent.\nCurrent date: 2026-05-28\nCurrent working directory: ${hostCwd}\nDo work.`;
	const rewritten = await handlers.get("before_agent_start")(
		{ type: "before_agent_start", systemPrompt: fakePrompt, prompt: "", systemPromptOptions: {} },
		ctx,
	);
	check(
		rewritten?.systemPrompt?.includes("/home/daytona/Hello-World") &&
			!rewritten.systemPrompt.includes(hostCwd),
		"system prompt cwd rewritten to sandbox path (independent of host cwd)",
		rewritten?.systemPrompt?.split("\n").find((l) => l.includes("working directory")),
	);

	// 8. user_bash routes to the sandbox
	console.log("8. user_bash routing");
	const ub = handlers.get("user_bash")({ type: "user_bash", command: "pwd", excludeFromContext: false, cwd: "." });
	check(!!ub?.operations, "user_bash returns sandbox operations");

	// 9. /sandbox status
	console.log("9. /sandbox status");
	notifications.length = 0;
	await commands.get("sandbox").handler("status", ctx);
	const statusMsg = notifications.at(-1)?.message ?? "";
	check(/started|running/.test(statusMsg) && /home\/daytona\/Hello-World/.test(statusMsg), "status shows state + cwd", statusMsg);

	// 10. preview URL: start a server, get the URL, fetch it
	console.log("10. /sandbox url <port> + reachability");
	const port = 8080;
	await exec("bash", {
		command: `nohup python3 -m http.server ${port} >/tmp/server.log 2>&1 & sleep 1; echo up`,
	});
	notifications.length = 0;
	await commands.get("sandbox").handler(`url ${port}`, ctx);
	const urlMsg = notifications.at(-1)?.message ?? "";
	const url = urlMsg.match(/Preview \(port \d+\): (\S+)/)?.[1];
	const token = urlMsg.match(/x-daytona-preview-token: ([^"]+)"/)?.[1];
	check(!!url && /^https:\/\/\d+-/.test(url), "preview URL has expected shape", url);
	check(!!token, "private sandbox exposes a preview token");
	if (url) {
		try {
			const resp = await fetch(url, { headers: token ? { "x-daytona-preview-token": token } : {} });
			check(resp.ok, `preview URL reachable (HTTP ${resp.status})`);
		} catch (e) {
			bad("preview URL fetch", e?.message ?? String(e));
		}
	}

	// 10b. preview_url custom tool (LLM-callable) returns the same URL
	console.log("10b. preview_url tool");
	const pv = getText(await exec("preview_url", { port }));
	const toolUrl = pv.match(/(https:\/\/\d+-\S+)/)?.[1];
	check(!!toolUrl && /^https:\/\/\d+-/.test(toolUrl), "preview_url tool returns a URL", pv.split("\n")[0]);
	if (toolUrl) {
		const tok = pv.match(/x-daytona-preview-token: ([^"\s]+)/)?.[1];
		try {
			const resp = await fetch(toolUrl, { headers: tok ? { "x-daytona-preview-token": tok } : {} });
			check(resp.ok, `preview_url tool URL reachable (HTTP ${resp.status})`);
		} catch (e) {
			bad("preview_url tool URL fetch", e?.message ?? String(e));
		}
	}

	// 11. teardown
	console.log("11. session_shutdown (teardown)");
	const daytona = new Daytona();
	const fullId = created[0]?.id;
	check(!!fullId, "captured the created sandbox id");

	await handlers.get("session_shutdown")({ type: "session_shutdown", reason: "quit" }, ctx);
	await new Promise((r) => setTimeout(r, 1500)); // let the deletion settle

	// Confirm it's actually gone: get(fullId) should throw not-found.
	let gone = false;
	try {
		await daytona.get(fullId);
	} catch {
		gone = true;
	}
	check(gone, "sandbox deleted on quit (get() now fails)");

	// cleanup any stray sandboxes from this extension
	const listAll = async (query) => {
		const out = [];
		for await (const s of daytona.list(query)) out.push(s);
		return out;
	};
	for (const s of await listAll({ labels: { "created-by": "pi-daytona" } })) {
		await s.delete().catch(() => {});
		console.log(`  (cleaned up stray sandbox ${s.id})`);
	}

	console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
	if (fail) {
		console.log("Failures:\n" + failures.map((f) => `  - ${f}`).join("\n"));
		process.exitCode = 1;
	}
}

main().catch((err) => {
	console.error("\nFATAL:", err?.stack ?? err?.message ?? err);
	process.exitCode = 1;
});
