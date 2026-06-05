/**
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Test-only fake model provider for a real end-to-end run (no paid LLM).
 *
 * Turn 1: emit a real `bash` tool call (`pwd && echo PI_DAYTONA_E2E_MARKER`).
 * Pi's actual agent loop executes it via the pi-daytona bash tool (→ Daytona
 * sandbox), then calls us again.
 * Turn 2: dump the conversation (incl. the tool result) to a host file for
 * inspection, then emit a final text message and stop.
 */

import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { writeFileSync } from "node:fs";

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
		baseUrl: "https://fake.invalid", // unused: streamSimple handles everything
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

			if (turn === 1) {
				const command = process.env.E2E_CMD ?? "pwd && echo PI_DAYTONA_E2E_MARKER";
				const toolCall = { type: "toolCall" as const, id: "call_1", name: "bash", arguments: { command } };
				const message = { ...base, content: [toolCall], stopReason: "toolUse" as const };
				stream.push({ type: "start", partial: message });
				stream.push({ type: "toolcall_start", contentIndex: 0, partial: message });
				stream.push({ type: "toolcall_end", contentIndex: 0, toolCall, partial: message });
				stream.push({ type: "done", reason: "toolUse", message });
			} else {
				try {
					writeFileSync("/tmp/logs/e2e-context.json", JSON.stringify(context, null, 2));
				} catch (e) {
					writeFileSync("/tmp/logs/e2e-context.json", `capture failed: ${String(e)}`);
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
