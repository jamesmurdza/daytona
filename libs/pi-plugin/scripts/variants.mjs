/**
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Live tests for alternate launch modes and the safety property.
 *   A. no --repo         : no clone, cwd = home
 *   B. --public          : preview URL reachable WITHOUT a token
 *   C. mid-session death : tools error out; they must NOT run on the host
 *   D. auth missing      : graceful notice, stays local, no crash
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const piRequire = createRequire(path.join(root, "node_modules/@earendil-works/pi-coding-agent/package.json"));
const { createJiti } = piRequire("jiti");
const jiti = createJiti(import.meta.url);

// Patch the ESM build (the one jiti loads) so our create-wrapper patches the
// SAME class the extension instantiates. Capture every created sandbox so tests
// have the real object (no list-indexing lag).
const { Daytona } = await import("@daytona/sdk");
const created = [];
const origCreate = Daytona.prototype.create;
Daytona.prototype.create = async function (...a) {
	const sb = await origCreate.apply(this, a);
	created.push(sb);
	return sb;
};

let pass = 0,
	fail = 0;
const failures = [];
const check = (cond, msg, detail) => {
	if (cond) {
		pass++;
		console.log(`  ✓ ${msg}`);
	} else {
		fail++;
		failures.push(msg);
		console.log(`  ✗ ${msg}${detail ? ` — ${detail}` : ""}`);
	}
};
const getText = (r) => (r?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
async function listAll(daytona, query) {
	const out = [];
	for await (const s of daytona.list(query)) out.push(s);
	return out;
}
const PI_LABEL = { labels: { "created-by": "pi-daytona" } };

const mod = await jiti.import(path.join(root, "index.ts"));
const factory = mod.default ?? mod;

function makeHarness(flagValues) {
	const tools = new Map();
	const commands = new Map();
	const handlers = new Map();
	const notifications = [];
	const pi = {
		registerFlag: () => {},
		registerTool: (t) => tools.set(t.name, t),
		registerCommand: (n, o) => commands.set(n, o),
		on: (e, h) => handlers.set(e, h),
		getFlag: (n) => flagValues[n],
	};
	const ctx = {
		hasUI: false,
		cwd: process.cwd(),
		ui: {
			notify: (message, type) => notifications.push({ message, type }),
			setStatus: () => {},
			input: async () => undefined,
			select: async () => undefined,
			confirm: async () => false,
			theme: { fg: (_c, t) => t },
		},
	};
	factory(pi);
	const exec = (tool, params) => tools.get(tool).execute("t", params, undefined, () => {});
	return { tools, commands, handlers, notifications, ctx, exec };
}

async function variantNoRepo() {
	console.log("A. no --repo (default: blank sandbox, cwd = home)");
	const h = makeHarness({ daytona: true });
	await h.handlers.get("session_start")({ type: "session_start", reason: "startup" }, h.ctx);
	const ready = h.notifications.find((n) => /Sandbox ready/.test(n.message));
	check(!!ready, "sandbox ready", h.notifications.find((n) => n.type === "error")?.message);
	const pwd = getText(await h.exec("bash", { command: "pwd" })).trim();
	check(pwd === "/home/daytona", "cwd is home, not a repo dir", pwd);
	await h.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "quit" }, h.ctx);
}

async function variantPublic() {
	console.log("B. --public (tokenless preview)");
	const h = makeHarness({ daytona: true, public: true });
	await h.handlers.get("session_start")({ type: "session_start", reason: "startup" }, h.ctx);
	check(!!h.notifications.find((n) => /Sandbox ready/.test(n.message)), "public sandbox ready");
	const port = 8090;
	await h.exec("bash", { command: `nohup python3 -m http.server ${port} >/tmp/s.log 2>&1 & sleep 1; echo up` });
	h.notifications.length = 0;
	await h.commands.get("sandbox").handler(`url ${port}`, h.ctx);
	const msg = h.notifications.at(-1)?.message ?? "";
	const url = msg.match(/Preview \(port \d+\): (\S+)/)?.[1];
	check(!!url, "public preview URL returned", msg);
	check(!/x-daytona-preview-token/.test(msg), "public URL message omits the token");
	if (url) {
		try {
			const resp = await fetch(url); // no token header
			check(resp.ok, `public URL reachable without token (HTTP ${resp.status})`);
		} catch (e) {
			check(false, "public URL fetch", e?.message);
		}
	}
	await h.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "quit" }, h.ctx);
}

async function variantDeath() {
	console.log("C. mid-session sandbox death (must not run on host)");
	const before = created.length;
	const h = makeHarness({ daytona: true });
	await h.handlers.get("session_start")({ type: "session_start", reason: "startup" }, h.ctx);
	// The captured object is the real sandbox the extension is using.
	const victim = created[before];
	if (victim) await victim.delete().catch(() => {});
	await new Promise((r) => setTimeout(r, 1500)); // let the deletion settle
	check(!!victim, "captured and deleted the sandbox out-of-band");
	// Now a tool call must error — NOT execute on the host.
	let threw = false;
	let hostLeak = false;
	try {
		const out = getText(await h.exec("bash", { command: "pwd" })).trim();
		hostLeak = out.includes(root) || out === process.cwd();
	} catch {
		threw = true;
	}
	check(threw || !hostLeak, "tool errored instead of falling back to the host", hostLeak ? "RAN ON HOST" : "");
	await h.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "quit" }, h.ctx).catch(() => {});
}

async function variantAuthMissing() {
	console.log("D. auth missing (graceful, stays local)");
	const saved = process.env.DAYTONA_API_KEY;
	delete process.env.DAYTONA_API_KEY;
	try {
		const h = makeHarness({ daytona: true });
		await h.handlers.get("session_start")({ type: "session_start", reason: "startup" }, h.ctx);
		check(!!h.notifications.find((n) => n.type === "error" && /API key/i.test(n.message)), "shows a clear no-key error");
		// With no sandbox active, bash falls back to local execution (normal Pi behavior).
		const pwd = getText(await h.exec("bash", { command: "pwd" })).trim();
		check(pwd.length > 0, "tools still work locally (no crash)", pwd);
	} finally {
		if (saved) process.env.DAYTONA_API_KEY = saved;
	}
}

async function cleanup() {
	try {
		const daytona = new Daytona();
		for (const s of await listAll(daytona, PI_LABEL)) {
			await s.delete().catch(() => {});
			console.log(`  (cleaned stray ${s.id})`);
		}
	} catch {}
}

await variantNoRepo();
await variantPublic();
await variantDeath();
await variantAuthMissing();
await cleanup();

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
if (fail) {
	console.log("Failures:\n" + failures.map((f) => `  - ${f}`).join("\n"));
	process.exitCode = 1;
}
