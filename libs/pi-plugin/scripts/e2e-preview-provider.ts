/**
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test-only provider for a real end-to-end run of the preview_url custom tool.
 *
 * Turn 1: bash -> background a web server.
 * Turn 2: call the `preview_url` tool for that port (Pi dispatches it to the
 *         pi-daytona extension, which hits real Daytona getPreviewLink).
 * Turn 3: dump the conversation (incl. the preview_url tool result) to a host
 *         file, then emit a final message and stop.
 */

import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { writeFileSync } from "node:fs";

const PORT = 8055;
const ZERO_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export default function (pi: ExtensionAPI) {
	let turn = 0;

	pi.registerProvider("fake", {
		name: "Fake",
		baseUrl: "https://fake.invalid",
		apiKey: "dummy-key",
		api: "anthropic-messages",
		models: [
			{
				id: "test",
				name: "Fake Test Model",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 200000,
				maxTokens: 4096,
			},
		],
		streamSimple: (model: any, context: any) => {
			turn++;
			const stream = createAssistantMessageEventStream();
			const base = {
				role: "assistant" as const,
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: ZERO_USAGE,
				timestamp: Date.now(),
			};
			const toolTurn = (id: string, name: string, args: Record<string, any>) => {
				const toolCall = { type: "toolCall" as const, id, name, arguments: args };
				const message = { ...base, content: [toolCall], stopReason: "toolUse" as const };
				stream.push({ type: "start", partial: message });
				stream.push({ type: "toolcall_start", contentIndex: 0, partial: message });
				stream.push({ type: "toolcall_end", contentIndex: 0, toolCall, partial: message });
				stream.push({ type: "done", reason: "toolUse", message });
			};

			if (turn === 1) {
				toolTurn("c1", "bash", { command: `python3 -m http.server ${PORT} &` });
			} else if (turn === 2) {
				toolTurn("c2", "preview_url", { port: PORT });
			} else {
				try {
					writeFileSync("/tmp/logs/e2e-preview.json", JSON.stringify(context, null, 2));
				} catch (e) {
					writeFileSync("/tmp/logs/e2e-preview.json", `capture failed: ${String(e)}`);
				}
				const text = { type: "text" as const, text: "Done." };
				const message = { ...base, content: [text], stopReason: "stop" as const };
				stream.push({ type: "start", partial: message });
				stream.push({ type: "text_start", contentIndex: 0, partial: message });
				stream.push({ type: "text_delta", contentIndex: 0, delta: "Done.", partial: message });
				stream.push({ type: "text_end", contentIndex: 0, content: "Done.", partial: message });
				stream.push({ type: "done", reason: "stop", message });
			}
			return stream;
		},
	});
}
