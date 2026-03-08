/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sandbox } from '@daytonaio/sdk'
import { AmpMessage, AssistantMessage, ResultMessage, UserMessage } from './types.js'
import { renderMarkdown } from './utils.js'

const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true'
function debug(...args: unknown[]) {
  if (DEBUG) console.error('[debug]', ...args)
}

// Formats a tool call for display (Amp uses cmd, path, file_path, command, etc.)
function formatToolUse(block: { name: string; input?: Record<string, unknown> }): string {
  const inp = block.input
  const description =
    (inp?.description as string) ||
    (inp?.cmd as string) ||
    (inp?.command as string) ||
    (inp?.path && `${block.name} ${inp.path}`) ||
    (inp?.file_path && `${block.name} ${inp.file_path}`) ||
    (inp?.query && `${block.name}: ${inp.query}`) ||
    block.name
  return `\n🔧 ${description}`
}

// Represents an Amp Code session within a Daytona sandbox
export class AmpSession {
  private threadId: string | null = null
  private systemPrompt: string | null = null

  constructor(private sandbox: Sandbox) {}

  // Handle a single JSON line from Amp's --stream-json output
  private handleJsonLine(line: string): void {
    try {
      const parsed = JSON.parse(line) as AmpMessage
      debug('parsed', parsed.type, parsed.subtype ?? '')

      // System message with thread ID
      if (parsed.type === 'system' && parsed.subtype === 'init') {
        const sysMsg = parsed as { session_id?: string; thread_id?: string }
        // Amp uses session_id in init message
        if (sysMsg.session_id && !this.threadId) {
          this.threadId = sysMsg.session_id
          debug('captured thread_id from init:', this.threadId)
        }
        return
      }

      // Assistant messages contain text and tool use blocks
      if (parsed.type === 'assistant') {
        const msg = parsed as AssistantMessage
        const outputs: string[] = []

        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text) {
            outputs.push(renderMarkdown(block.text))
          } else if (block.type === 'tool_use') {
            outputs.push(formatToolUse(block))
          }
        }

        if (outputs.length > 0) {
          process.stdout.write(outputs.join(''))
        }
        return
      }

      // User message with tool_result = output from a tool run
      if (parsed.type === 'user') {
        const msg = parsed as UserMessage
        const blocks = msg.message?.content ?? []
        const toolResults = blocks.filter((b) => b.type === 'tool_result') as Array<{
          type: 'tool_result'
          content: string
          is_error?: boolean
        }>
        if (toolResults.length > 0) {
          const lines = toolResults.map((b) => (b.is_error ? `\n⚠ ${b.content}` : `\n${b.content}`))
          process.stdout.write(lines.join(''))
        }
        return
      }

      // Result message at end
      if (parsed.type === 'result') {
        const msg = parsed as ResultMessage
        if (msg.is_error) {
          if (msg.error?.includes('require paid credits')) {
            console.error('\n❌ Amp execute mode requires paid credits. Please add credits at https://ampcode.com/pay')
            process.exit(1)
          }
          process.stdout.write(`\n❌ Error: ${msg.error}`)
        }
      }
    } catch {
      // Not valid JSON, ignore
      debug('invalid JSON line:', line)
    }
  }

  // Run an amp command and stream output
  private async runAmpCommand(args: string[]): Promise<void> {
    const command = ['amp', '--dangerously-allow-all', '--stream-json', '-m smart', ...args].join(' ')
    debug('running:', command)

    await this.sandbox.process.executeCommand(command, {
      cwd: '/home/daytona',
      timeout: 600,
      onStdout: (data: string) => {
        for (const line of data.split('\n').filter(Boolean)) {
          this.handleJsonLine(line)
        }
      },
      onStderr: (data: string) => {
        debug('stderr:', data)
      },
    })
  }

  // Get the thread ID from the most recent thread
  private async getThreadId(): Promise<string | null> {
    const result = await this.sandbox.process.executeCommand('amp threads list --json')
    if (result.exitCode !== 0 || !result.result) {
      debug('failed to list threads:', result.result)
      return null
    }

    try {
      const threads = JSON.parse(result.result)
      if (Array.isArray(threads) && threads.length > 0) {
        return threads[0].id
      }
    } catch {
      debug('failed to parse threads list:', result.result)
    }
    return null
  }

  // Processes a user prompt by running amp CLI
  async processPrompt(prompt: string): Promise<void> {
    console.log('Thinking...')

    if (this.threadId) {
      // Continue existing thread
      await this.runAmpCommand(['threads', 'continue', this.threadId, '-x', JSON.stringify(prompt)])
    } else {
      // Start new thread
      await this.runAmpCommand(['-x', JSON.stringify(prompt)])

      // Capture thread ID for next turn
      this.threadId = await this.getThreadId()
      debug('captured thread_id:', this.threadId)
    }

    console.log('\n')
  }

  // Initialize the session with an optional system prompt
  async initialize(options?: { systemPrompt?: string }): Promise<void> {
    console.log('Starting Amp Code...')

    if (options?.systemPrompt?.trim()) {
      this.systemPrompt = options.systemPrompt.trim()
      // Send system prompt as first message
      await this.processPrompt(
        `Follow these instructions for the rest of this conversation:\n\n${this.systemPrompt}`,
      )
    }

    console.log('Agent ready. Press Ctrl+C at any time to exit.\n')
  }
}
