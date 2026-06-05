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
	SessionManager,
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
import { execCommand, withRecovery } from "./src/sandbox.ts";
import { joinPath, normalizeRepoUrl, repoName, shellQuote, shortId } from "./src/util.ts";
import {
	type RepoSlug,
	compareUrl,
	deleteBranch,
	ensureBranch,
	getBranchSha,
	getDefaultBranch,
	getGithubToken,
	mergeBranch,
	parseRepoSlug,
} from "./src/github.ts";
import { commitAndPush } from "./src/sync.ts";

/** Session custom-entry type recording the sandbox bound to this session. */
const SESSION_ENTRY = "daytona-session";

/** GitHub sync target for a session (set only when pushing is enabled). */
interface GitTarget {
	slug: RepoSlug;
	base: string;
	branch: string;
}

/** Persisted record so a session can reattach its sandbox on resume. */
interface SessionEntryData {
	sandboxId: string;
	cwd: string;
	git?: GitTarget;
}

/** State for the sandbox bound to the current session. */
interface ActiveSandbox {
	sandbox: Sandbox;
	/** Working directory inside the sandbox (repo root, or workspace when no --repo). */
	cwd: string;
	/** GitHub sync target — set only when --repo is a github.com repo and gh has a token. */
	git?: GitTarget;
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
	// Daytona client for the session; reused for reaping at shutdown.
	let daytona: Daytona | null = null;

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
		description: "Manage the active Daytona sandbox: status | url <port> | view | merge",
		getArgumentCompletions: (prefix) => {
			const subs = ["status", "url", "view", "merge"];
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

			if (sub === "view") {
				if (!active.git) {
					ctx.ui.notify("No GitHub branch for this session. Launch Pi with --repo.", "warning");
					return;
				}
				const { slug, base, branch } = active.git;
				ctx.ui.notify(`${branch}: ${compareUrl(slug, base, branch)}`, "info");
				return;
			}

			if (sub === "merge") {
				if (!active.git) {
					ctx.ui.notify("Merge needs a GitHub repo. Launch Pi with --repo.", "warning");
					return;
				}
				const { slug, base, branch } = active.git;
				const ok = await ctx.ui.confirm(
					"Merge branch",
					`Merge ${branch} into ${base}? This does a direct GitHub merge (merge commit) and deletes the branch.`,
				);
				if (!ok) return;
				try {
					// Push the latest work first so the merge includes it.
					const token = await getGithubToken(pi);
					await commitAndPush({ sandbox, cwd, pushEnabled: true }, token);
					const res = await mergeBranch(pi, slug, base, branch);
					if (!res.ok) {
						ctx.ui.notify(`Merge failed: ${res.message}`, "error");
						return;
					}
					await deleteBranch(pi, slug, branch);
					ctx.ui.notify(`Merged ${branch} into ${base} ✓`, "info");
				} catch (err) {
					ctx.ui.notify(`Merge failed: ${errorMessage(err)}`, "error");
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
			const branch = active.git ? ` · ${active.git.branch}` : "";
			ctx.ui.notify(
				`☁ ${shortId(sandbox.id)} · ${state} · ${cwd}${branch}${snapshot} · ${visibility}`,
				"info",
			);
		},
	});

	// --- Lifecycle ---

	pi.on("session_start", async (event, ctx) => {
		if (pi.getFlag("daytona") !== true) return;
		if (active) return; // already running (e.g. after reload)

		const apiKey = await resolveApiKey(ctx);
		if (!apiKey) {
			ctx.ui.notify("Daytona: no API key found — staying local. Set DAYTONA_API_KEY.", "error");
			return;
		}

		const dt = new Daytona({ apiKey });
		daytona = dt;
		const persisted = ctx.sessionManager.getSessionFile() !== undefined;
		const sessionId = ctx.sessionManager.getSessionId();

		// Reap sandboxes whose session was deleted from the resume menu. Runs in
		// the background so it never slows startup.
		if (persisted) void reapOrphans(dt);

		setStatus(ctx, "☁ daytona · spinning up sandbox…");
		const startedAt = Date.now();

		try {
			// Reattach to this session's existing sandbox on resume/reload. A fork
			// always gets a fresh sandbox (branched off the parent below).
			if (persisted && event.reason !== "fork") {
				const prev = latestSessionEntry(ctx);
				if (prev) {
					try {
						setStatus(ctx, "☁ daytona · resuming sandbox…");
						const sandbox = await dt.get(prev.sandboxId);
						await ensureStarted(sandbox);
						active = { sandbox, cwd: prev.cwd, git: prev.git };
						ctx.ui.notify(`Reattached sandbox · ${shortId(sandbox.id)}${prev.git ? ` · ${prev.git.branch}` : ""}`, "info");
						setRunningStatus(ctx, sandbox.id, prev.cwd);
						return;
					} catch {
						// Sandbox is gone (reaped/deleted) — fall through and create a fresh one.
					}
				}
			}

			const snapshot = stringFlag(pi.getFlag("snapshot"));
			const isPublic = pi.getFlag("public") === true;

			const sandbox = await dt.create({
				snapshot,
				public: isPublic,
				// Idle PAUSES the sandbox (filesystem preserved); the next tool call
				// transparently restarts it (see withRecovery). The sandbox persists
				// across sessions and is only reaped once its session is deleted, so
				// autoDelete is just a long crash backstop for persisted sessions.
				autoStopInterval: 30, // minutes idle -> stop
				autoDeleteInterval: persisted ? 43200 : 1440, // 30d backstop vs 24h when ephemeral
				labels: { "created-by": "pi-daytona", "session-id": sessionId },
			});

			const home = (await sandbox.getUserHomeDir()) ?? "/home/daytona";
			let cwd = home;
			let git: GitTarget | undefined;

			const repo = stringFlag(pi.getFlag("repo"));
			if (repo) {
				const url = normalizeRepoUrl(repo);
				cwd = joinPath(home, repoName(repo));
				const slug = parseRepoSlug(url);
				const token = slug ? await getGithubToken(pi) : undefined;

				if (slug && token) {
					// Each session gets its own GitHub branch pi/<short-session-id>. We create
					// the ref on GitHub first (off the base), then clone that branch so
					// the sandbox has an upstream to push back to (see sync.ts).
					const branch = `pi/${shortId(sessionId)}`;
					let base = stringFlag(pi.getFlag("branch"));
					// A fork branches off the parent session's branch.
					if (event.reason === "fork") {
						const parent = latestSessionEntry(ctx);
						if (parent?.git) base = parent.git.branch;
					}
					if (!base) base = await getDefaultBranch(pi, slug);
					if (!base) throw new Error("Could not resolve a base branch on GitHub.");

					const sha = await getBranchSha(pi, slug, base);
					if (!sha) throw new Error(`Base branch '${base}' not found on GitHub.`);
					await ensureBranch(pi, slug, branch, sha);
					await sandbox.git.clone(url, cwd, branch, undefined, "x-access-token", token);
					git = { slug, base, branch };
				} else {
					// Not a github.com repo, or no gh token: clone read-only, no push.
					await sandbox.git.clone(url, cwd, stringFlag(pi.getFlag("branch")));
					ctx.ui.notify(
						"Daytona: GitHub sync disabled (needs `gh auth login` and a github.com --repo).",
						"warning",
					);
				}
			} else {
				// No --repo: still create a throwaway git repo in the sandbox for
				// consistency (the agent's work is committed, just never pushed). The
				// initial empty commit gives HEAD a valid ref, so git.status() doesn't
				// fail with "reference not found" on the first sync.
				cwd = joinPath(home, "workspace");
				await execCommand(
					sandbox,
					`mkdir -p ${shellQuote(cwd)} && cd ${shellQuote(cwd)} && git init -q -b pi && ` +
						`git config user.name "pi-daytona" && git config user.email "pi@daytona.io" && ` +
						`git commit -q --allow-empty -m "pi: init"`,
					home,
				);
			}

			active = { sandbox, cwd, git };
			// Record the sandbox so this session can reattach it after a restart.
			if (persisted) {
				const data: SessionEntryData = { sandboxId: sandbox.id, cwd, git };
				pi.appendEntry(SESSION_ENTRY, data);
			}

			const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
			const branchInfo = git ? ` · ${git.branch}` : "";
			ctx.ui.notify(`Sandbox ready · ${shortId(sandbox.id)}${branchInfo} · ${secs}s`, "info");
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

	// After each agent loop ends, commit the work and push it to the session's
	// GitHub branch (commit-only when no --repo). The push is serialized and
	// skips an unchanged tree (see sync.ts).
	pi.on("agent_end", async (_event, ctx) => {
		if (!active) return;
		const token = active.git ? await getGithubToken(pi) : undefined;
		try {
			const res = await commitAndPush({ sandbox: active.sandbox, cwd: active.cwd, pushEnabled: !!active.git }, token);
			if (res.pushed && active.git) {
				ctx.ui.notify(
					`Pushed ${active.git.branch} → ${compareUrl(active.git.slug, active.git.base, active.git.branch)}`,
					"info",
				);
			}
		} catch (err) {
			ctx.ui.notify(`Daytona: sync failed — ${errorMessage(err)}`, "warning");
		}
	});

	// On exit, flush a final sync, then KEEP the sandbox (autoStop pauses it) so
	// the session can be resumed later. The sandbox is only deleted once its
	// session is deleted from the resume menu — handled by reapOrphans, which we
	// also run here to catch sessions deleted during this run.
	pi.on("session_shutdown", async (event, ctx) => {
		if (!active) return;
		if (event.reason !== "quit" && event.reason !== "reload") return;
		const current = active;
		active = null;
		setStatus(ctx, undefined);
		try {
			const token = current.git ? await getGithubToken(pi) : undefined;
			await commitAndPush({ sandbox: current.sandbox, cwd: current.cwd, pushEnabled: !!current.git }, token);
		} catch {
			// best-effort final sync
		}

		const persisted = ctx.sessionManager.getSessionFile() !== undefined;
		if (persisted) {
			// Reap sandboxes whose session no longer exists; this session's own
			// sandbox stays (its session file still exists) and is paused by autoStop.
			if (daytona) await reapOrphans(daytona);
		} else {
			// In-memory session: nothing to resume, so delete the sandbox now.
			try {
				await current.sandbox.delete();
			} catch {
				// Best-effort: autoStop + autoDelete reap it later if this didn't run.
			}
		}
	});
}

/** Most recent Daytona sandbox record in this session (for reattach / fork base). */
function latestSessionEntry(ctx: ExtensionContext): SessionEntryData | undefined {
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i--) {
		const e = entries[i] as { type?: string; customType?: string; data?: unknown };
		if (e.type === "custom" && e.customType === SESSION_ENTRY) {
			return e.data as SessionEntryData;
		}
	}
	return undefined;
}

/** Ensure a sandbox is running, starting it if it was paused or archived. */
async function ensureStarted(sandbox: Sandbox): Promise<void> {
	try {
		await sandbox.refreshData();
	} catch {
		// If we can't read state, let start() surface the real error.
	}
	if (sandbox.state !== "started") {
		await sandbox.start();
	}
}

/**
 * Delete pi-daytona sandboxes whose session no longer exists. This is how a
 * sandbox gets cleaned up when its session is deleted from the resume menu —
 * Pi has no session-deleted hook, so we reconcile against SessionManager.listAll().
 * Best-effort: never throws.
 */
async function reapOrphans(daytona: Daytona): Promise<void> {
	try {
		const live = new Set((await SessionManager.listAll()).map((s) => s.id));
		const orphans: Sandbox[] = [];
		for await (const sandbox of daytona.list({ labels: { "created-by": "pi-daytona" } })) {
			let labels = sandbox.labels;
			if (!labels || Object.keys(labels).length === 0) {
				try {
					await sandbox.refreshData();
					labels = sandbox.labels;
				} catch {
					continue;
				}
			}
			const sid = labels?.["session-id"];
			// Only reap sandboxes we can attribute to a session that no longer exists.
			if (sid && !live.has(sid)) orphans.push(sandbox);
		}
		await Promise.allSettled(orphans.map((s) => s.delete()));
	} catch {
		// best-effort reconciliation
	}
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
