/**
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

/** Fast connectivity check: create -> exec -> delete a sandbox via the SDK. */
import { Daytona } from "@daytona/sdk";

const t0 = Date.now();
console.log("Connecting to Daytona…");
const daytona = new Daytona();

let sandbox;
try {
	sandbox = await daytona.create({ ephemeral: true, labels: { "created-by": "pi-daytona-test" } });
	console.log(`✓ created sandbox ${sandbox.id} in ${((Date.now() - t0) / 1000).toFixed(1)}s (state=${sandbox.state})`);

	const home = await sandbox.getUserHomeDir();
	console.log(`✓ home dir: ${home}`);

	const res = await sandbox.process.executeCommand('echo "hello from sandbox"');
	console.log(`✓ exec exitCode=${res.exitCode} result=${JSON.stringify(res.result?.trim())}`);

	const uname = await sandbox.process.executeCommand("uname -a && which rg git node python3 2>/dev/null");
	console.log(`✓ env:\n${uname.result?.trim()}`);
} catch (err) {
	console.error("✗ FAILED:", err?.message ?? err);
	if (err?.response?.data) console.error("  response:", JSON.stringify(err.response.data));
	process.exitCode = 1;
} finally {
	if (sandbox) {
		try {
			await sandbox.delete();
			console.log(`✓ deleted sandbox ${sandbox.id}`);
		} catch (e) {
			console.error("✗ delete failed:", e?.message ?? e);
		}
	}
}
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
