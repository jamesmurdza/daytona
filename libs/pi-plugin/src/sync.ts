/**
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sandbox-side git sync: commit the agent's work and push it to the session's
 * GitHub branch using the Daytona git API. Every network git operation runs
 * INSIDE the sandbox; the GitHub token is passed transiently as the push
 * credential. Pushes are serialized so overlapping agent_end events can't race
 * on the same repo, and an unchanged tree is skipped (no empty commits/pushes).
 */

import type { Sandbox } from "@daytona/sdk";
import { withRecovery } from "./sandbox.ts";

const COMMIT_AUTHOR = "pi-daytona";
const COMMIT_EMAIL = "pi@daytona.io";
const PUSH_USERNAME = "x-access-token";

export interface SyncTarget {
	sandbox: Sandbox;
	cwd: string;
	/** True when a GitHub origin and token are available (otherwise commit-only). */
	pushEnabled: boolean;
}

export interface SyncResult {
	committed: boolean;
	pushed: boolean;
}

// Serialize syncs across the whole extension so concurrent triggers don't race.
let queue: Promise<unknown> = Promise.resolve();

export function commitAndPush(target: SyncTarget, token: string | undefined): Promise<SyncResult> {
	const next = queue.then(() => doCommitAndPush(target, token));
	queue = next.catch(() => {}); // keep the chain alive even if one sync throws
	return next;
}

async function doCommitAndPush(target: SyncTarget, token: string | undefined): Promise<SyncResult> {
	const { sandbox, cwd } = target;

	const status = await withRecovery(sandbox, () => sandbox.git.status(cwd));
	const hasChanges = (status.fileStatus?.length ?? 0) > 0;

	let committed = false;
	if (hasChanges) {
		await withRecovery(sandbox, () => sandbox.git.add(cwd, ["."]));
		await withRecovery(sandbox, () =>
			sandbox.git.commit(cwd, `pi: ${new Date().toISOString()}`, COMMIT_AUTHOR, COMMIT_EMAIL),
		);
		committed = true;
	}

	if (!target.pushEnabled || !token) return { committed, pushed: false };

	// Nothing new to push: no fresh commit and nothing already ahead of remote.
	const ahead = status.ahead ?? 0;
	if (!committed && ahead === 0) return { committed, pushed: false };

	await withRecovery(sandbox, () => sandbox.git.push(cwd, PUSH_USERNAME, token));
	return { committed, pushed: true };
}
