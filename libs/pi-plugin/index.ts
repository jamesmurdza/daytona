/**
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * pi-daytona — run Pi's tools inside a remote, ephemeral Daytona sandbox.
 *
 * The agent runs locally; only tool execution
 * (bash + file I/O) is redirected into a Daytona container. Activation is
 * launch-scoped via the `--daytona` flag; the sandbox is torn down on exit.
 *
 * Blueprint: examples/extensions/ssh.ts from @earendil-works/pi-coding-agent.
 */

import { Daytona, type Sandbox } from "@daytona/sdk";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { resolveApiKey } from "./src/auth.ts";
import { type FindParams, runRemoteFind } from "./src/find-tool.ts";
import { type GrepParams, runRemoteGrep } from "./src/grep-tool.ts";
import {
	createBashOps,
	createEditOps,
	createLsOps,
	createReadOps,
	createWriteOps,
} from "./src/ops.ts";
import { withRecovery } from "./src/sandbox.ts";
import { joinPath, normalizeRepoUrl, repoName, shortId } from "./src/util.ts";

/** State for the sandbox bound to the current session. */
interface ActiveSandbox {
	sandbox: Sandbox;
	/** Working directory inside the sandbox (repo root, or home when no --repo). */
	cwd: string;
}

export default function (pi: ExtensionAPI) {
	pi.registerFlag("daytona", { description: "Run tools inside a Daytona sandbox", type: "boolean" });
	pi.registerFlag("repo", { description: "Git repo to clone into the sandbox", type: "string" });
	pi.registerFlag("branch", { description: "Branch to clone (with --repo)", type: "string" });
	pi.registerFlag("snapshot", { description: "Daytona snapshot/base image to use", type: "string" });
	pi.registerFlag("public", { description: "Create a public sandbox (preview URLs need no token)", type: "boolean" });

	const localCwd = process.cwd();
	const localBash = createBashTool(localCwd);
	const localRead = createReadTool(localCwd);
	const localWrite = createWriteTool(localCwd);
	const localEdit = createEditTool(localCwd);
	const localLs = createLsTool(localCwd);
	const localFind = createFindTool(localCwd);
	const localGrep = createGrepTool(localCwd);

	// Resolved lazily on session_start (CLI flags are not available at load time).
	let active: ActiveSandbox | null = null;

	// --- Tool registration: delegate to the sandbox when one is active. ---

	pi.registerTool({
		...localBash,
		async execute(id, params, signal, onUpdate) {
			if (active) {
				const tool = createBashTool(active.cwd, { operations: createBashOps(active.sandbox) });
				return tool.execute(id, params, signal, onUpdate);
			}
			return localBash.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localRead,
		async execute(id, params, signal, onUpdate) {
			if (active) {
				const tool = createReadTool(active.cwd, { operations: createReadOps(active.sandbox) });
				return tool.execute(id, params, signal, onUpdate);
			}
			return localRead.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localWrite,
		async execute(id, params, signal, onUpdate) {
			if (active) {
				const tool = createWriteTool(active.cwd, { operations: createWriteOps(active.sandbox) });
				return tool.execute(id, params, signal, onUpdate);
			}
			return localWrite.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localEdit,
		async execute(id, params, signal, onUpdate) {
			if (active) {
				const tool = createEditTool(active.cwd, { operations: createEditOps(active.sandbox) });
				return tool.execute(id, params, signal, onUpdate);
			}
			return localEdit.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localLs,
		async execute(id, params, signal, onUpdate) {
			if (active) {
				const tool = createLsTool(active.cwd, { operations: createLsOps(active.sandbox) });
				return tool.execute(id, params, signal, onUpdate);
			}
			return localLs.execute(id, params, signal, onUpdate);
		},
	});

	// find and grep can't be redirected via operations: Pi runs fd/ripgrep
	// locally, and Daytona's searchFiles only does basename matching. So we run
	// the search inside the sandbox via dedicated tools.
	pi.registerTool({
		...localFind,
		async execute(id, params, signal, onUpdate) {
			if (active) {
				return runRemoteFind(active.sandbox, active.cwd, params as FindParams);
			}
			return localFind.execute(id, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...localGrep,
		async execute(id, params, signal, onUpdate) {
			if (active) {
				return runRemoteGrep(active.sandbox, active.cwd, params as GrepParams);
			}
			return localGrep.execute(id, params, signal, onUpdate);
		},
	});

	// Custom tool: let the agent fetch a port's preview URL itself, so after it
	// starts a server (e.g. `npm run dev &`) it can hand the user a clickable
	// link without them running /sandbox url.
	pi.registerTool({
		name: "preview_url",
		label: "Preview URL",
		description:
			"Get the public preview URL for a port served inside the Daytona sandbox. " +
			"Use this after starting a server (e.g. a dev server on port 3000) to give the user a link.",
		promptSnippet: "Get a browser-openable preview URL for a port served in the sandbox",
		parameters: Type.Object({
			port: Type.Number({ description: "The port the server listens on inside the sandbox" }),
		}),
		async execute(_id, { port }) {
			if (!active) {
				return { content: [{ type: "text", text: "No active Daytona sandbox." }], details: undefined };
			}
			const { sandbox } = active;
			const link = await withRecovery(sandbox, () => sandbox.getPreviewLink(port));
			const text = sandbox.public
				? `Preview URL for port ${port}: ${link.url}`
				: `Preview URL for port ${port}: ${link.url}\n` +
					`This is a private sandbox, so the URL needs an auth header:\n` +
					`  curl -H "x-daytona-preview-token: ${link.token}" ${link.url}`;
			return { content: [{ type: "text", text }], details: undefined };
		},
	});

	// Route user `!` bash commands to the sandbox too.
	pi.on("user_bash", () => {
		if (!active) return;
		return { operations: createBashOps(active.sandbox) };
	});

	// --- Informational commands (read-only; don't change the backend) ---

	pi.registerCommand("sandbox", {
		description: "Inspect the active Daytona sandbox: status | url <port>",
		getArgumentCompletions: (prefix) => {
			const subs = ["status", "url"];
			const matches = subs.filter((s) => s.startsWith(prefix.trim()));
			return matches.length > 0 ? matches.map((s) => ({ value: s, label: s })) : null;
		},
		handler: async (args, ctx) => {
			if (!active) {
				ctx.ui.notify("No Daytona sandbox is active. Launch Pi with --daytona.", "warning");
				return;
			}
			const [sub, ...rest] = args.trim().split(/\s+/).filter(Boolean);
			const { sandbox, cwd } = active;

			if (sub === "url") {
				const port = Number(rest[0]);
				if (!Number.isInteger(port) || port <= 0) {
					ctx.ui.notify("Usage: /sandbox url <port>", "warning");
					return;
				}
				try {
					const link = await withRecovery(sandbox, () => sandbox.getPreviewLink(port));
					if (sandbox.public) {
						ctx.ui.notify(`Preview (port ${port}): ${link.url}`, "info");
					} else {
						ctx.ui.notify(
							`Preview (port ${port}): ${link.url}\n` +
								`Private sandbox — include header:\n` +
								`  curl -H "x-daytona-preview-token: ${link.token}" ${link.url}`,
							"info",
						);
					}
				} catch (err) {
					ctx.ui.notify(`Failed to get preview URL: ${errorMessage(err)}`, "error");
				}
				return;
			}

			// Default subcommand: status.
			try {
				await sandbox.refreshData();
			} catch {
				// Show last-known data if the refresh call fails.
			}
			const state = sandbox.state ?? "unknown";
			const visibility = sandbox.public ? "public" : "private";
			const snapshot = sandbox.snapshot ? ` · ${sandbox.snapshot}` : "";
			ctx.ui.notify(
				`☁ ${shortId(sandbox.id)} · ${state} · ${cwd}${snapshot} · ${visibility}`,
				"info",
			);
		},
	});

	// --- Lifecycle ---

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("daytona") !== true) return;
		if (active) return; // already running (e.g. after reload)

		const apiKey = await resolveApiKey(ctx);
		if (!apiKey) {
			ctx.ui.notify("Daytona: no API key found — staying local. Set DAYTONA_API_KEY.", "error");
			return;
		}

		setStatus(ctx, "☁ daytona · spinning up sandbox…");
		const startedAt = Date.now();

		try {
			const daytona = new Daytona({ apiKey });
			const snapshot = stringFlag(pi.getFlag("snapshot"));
			const isPublic = pi.getFlag("public") === true;

			const sandbox = await daytona.create({
				snapshot,
				public: isPublic,
				// Idle PAUSES the sandbox (its filesystem is preserved) rather than
				// destroying it, so stepping away doesn't lose your work — the next
				// tool call transparently restarts it (see withRecovery). We still
				// delete on quit; autoDeleteInterval is a leak backstop for crashes.
				autoStopInterval: 30, // minutes idle -> stop
				autoDeleteInterval: 1440, // delete only after ~24h continuously stopped
				labels: { "created-by": "pi-daytona" },
			});

			const home = (await sandbox.getUserHomeDir()) ?? "/home/daytona";
			let cwd = home;

			const repo = stringFlag(pi.getFlag("repo"));
			if (repo) {
				const url = normalizeRepoUrl(repo);
				cwd = joinPath(home, repoName(repo));
				const branch = stringFlag(pi.getFlag("branch"));
				await sandbox.git.clone(url, cwd, branch);
			}

			active = { sandbox, cwd };

			const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
			ctx.ui.notify(`Sandbox ready · ${shortId(sandbox.id)} · ${secs}s`, "info");
			setRunningStatus(ctx, sandbox.id, cwd);
		} catch (err) {
			active = null;
			setStatus(ctx, undefined);
			ctx.ui.notify(`Daytona: failed to start sandbox — ${errorMessage(err)}`, "error");
		}
	});

	// Rewrite the agent's "current working directory" to the sandbox path.
	// Match the whole line (not a literal host path) so this works regardless of
	// what Pi used as the prompt cwd — avoids a silent no-op if they diverge.
	pi.on("before_agent_start", (event) => {
		if (!active) return;
		const replacement = `Current working directory: ${active.cwd} (inside Daytona sandbox ${shortId(active.sandbox.id)})`;
		const systemPrompt = event.systemPrompt.replace(/Current working directory: .*/g, replacement);
		return { systemPrompt };
	});

	// Tear down the sandbox on exit (it's ephemeral to the session).
	pi.on("session_shutdown", async (event, ctx) => {
		if (!active) return;
		if (event.reason !== "quit" && event.reason !== "reload") return;
		const { sandbox } = active;
		active = null;
		setStatus(ctx, undefined);
		try {
			await sandbox.delete();
		} catch {
			// Best-effort: autoStop + autoDelete reap it later if this didn't run.
		}
	});
}

// --- helpers ---

function setStatus(ctx: ExtensionContext, text: string | undefined): void {
	ctx.ui.setStatus("daytona", text === undefined ? undefined : ctx.ui.theme.fg("accent", text));
}

function setRunningStatus(ctx: ExtensionContext, id: string, cwd: string): void {
	setStatus(ctx, `☁ daytona · ${shortId(id)} · running · ${cwd}`);
}

function stringFlag(value: boolean | string | undefined): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
