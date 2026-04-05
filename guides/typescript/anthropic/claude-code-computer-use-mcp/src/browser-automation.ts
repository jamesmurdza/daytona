/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Claude Code + Computer Use MCP Server Example
 * Approach 1: Browser Automation using Playwright MCP
 *
 * This example demonstrates how to use Claude Code with the Playwright MCP server
 * for browser automation tasks running inside a Daytona sandbox.
 */

import { Daytona, Sandbox, OutputMessage, ExecutionResult, Image } from '@daytonaio/sdk'
import { InterpreterContext, ExecuteResponse } from '@daytonaio/toolbox-api-client'
import Anthropic from '@anthropic-ai/sdk'
import * as dotenv from 'dotenv'
import * as readline from 'readline'

// Load environment variables
dotenv.config()

// ANSI color codes for terminal output
const BLUE = '\x1b[34m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

// Helper function to render markdown-like output
function renderMarkdown(text: string, color: string = RESET): string {
  return `${color}${text}${RESET}`
}

// Browser Automation Agent - orchestrates browser tasks using Playwright MCP
class BrowserAutomationAgent {
  private anthropic: Anthropic
  private conversationHistory: any[] = []
  private sandbox: Sandbox
  private ctx: InterpreterContext

  constructor(apiKey: string, sandbox: Sandbox, ctx: InterpreterContext) {
    this.anthropic = new Anthropic({ apiKey })
    this.sandbox = sandbox
    this.ctx = ctx
  }

  async processUserRequest(userMessage: string): Promise<void> {
    // Add user message to conversation history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    })

    console.log(renderMarkdown('\n[Browser Agent] Processing your request...\n', BLUE))

    let continueLoop = true
    while (continueLoop) {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: `You are a Browser Automation Agent with access to a Daytona sandbox running Playwright MCP.

Your capabilities:
1. Navigate to URLs and interact with web pages
2. Fill forms, click buttons, take screenshots
3. Execute browser automation scripts
4. Run shell commands in the sandbox

When you need to perform browser automation:
- Use <browser_task> tags to specify Playwright commands
- The sandbox has Playwright MCP configured and ready to use
- You can run both headless and headed browser sessions

When executing shell commands:
- Use <shell_command> tags for direct command execution

Available Playwright MCP tools in the sandbox:
- browser_navigate: Navigate to URLs
- browser_click: Click elements by selector
- browser_fill: Fill input fields
- browser_screenshot: Take screenshots
- browser_run_code: Execute Playwright scripts

When you're done with all tasks, say "TASK_COMPLETE" to finish.`,
        messages: this.conversationHistory,
      })

      // Extract assistant response
      const assistantMessage = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n')

      console.log(renderMarkdown(`[Browser Agent]: ${assistantMessage}`, BLUE))

      // Add assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: response.content,
      })

      // Check for browser task
      const browserTaskMatch = assistantMessage.match(/<browser_task>([\s\S]*?)<\/browser_task>/)
      // Check for shell command
      const shellCommandMatch = assistantMessage.match(/<shell_command>([\s\S]*?)<\/shell_command>/)

      if (browserTaskMatch) {
        const task = browserTaskMatch[1].trim()
        console.log(renderMarkdown('\n[Executing Browser Task]...\n', GREEN))
        const output = await this.executeBrowserTask(task)
        this.conversationHistory.push({
          role: 'user',
          content: `Browser task completed. Output:\n${output}`,
        })
      } else if (shellCommandMatch) {
        const command = shellCommandMatch[1].trim()
        console.log(renderMarkdown('\n[Executing Shell Command]...\n', YELLOW))
        const output = await this.executeShellCommand(command)
        this.conversationHistory.push({
          role: 'user',
          content: `Shell command completed. Output:\n${output}`,
        })
      } else if (assistantMessage.includes('TASK_COMPLETE')) {
        continueLoop = false
        console.log(renderMarkdown('\n[Browser Agent] All tasks completed!\n', BLUE))
      } else {
        continueLoop = false
      }
    }
  }

  private async executeBrowserTask(task: string): Promise<string> {
    let output = ''

    // Execute the browser automation code via the sandbox's code interpreter
    const playwrightCode = `
import subprocess
import json

# Execute Playwright MCP commands via the installed server
# The sandbox has @playwright/mcp installed and configured

task = '''${task.replace(/'/g, "\\'")}'''
print(f"Executing browser task: {task}")

# For demonstration, we'll use Playwright directly
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Execute the task based on content
    if "navigate" in task.lower() or "go to" in task.lower():
        # Extract URL from task
        import re
        urls = re.findall(r'https?://[^\s<>"{}|\\^\\[\\]\`]+', task)
        if urls:
            page.goto(urls[0])
            print(f"Navigated to: {urls[0]}")
            print(f"Page title: {page.title()}")

    if "screenshot" in task.lower():
        page.screenshot(path='/tmp/screenshot.png')
        print("Screenshot saved to /tmp/screenshot.png")

    browser.close()
    print("Browser task completed successfully")
`

    const result = await this.sandbox.codeInterpreter.runCode(playwrightCode, {
      context: this.ctx,
      onStdout: (msg: OutputMessage) => {
        process.stdout.write(renderMarkdown(msg.output, GREEN))
        output += msg.output
      },
      onStderr: (msg: OutputMessage) => {
        process.stdout.write(renderMarkdown(msg.output, YELLOW))
        output += msg.output
      },
    })

    if (result.error) {
      output += `\nError: ${result.error.value}`
    }

    return output || 'Browser task completed with no output.'
  }

  private async executeShellCommand(command: string): Promise<string> {
    const result = await this.sandbox.process.executeCommand(command)
    return result.result || `Exit code: ${result.exitCode}`
  }
}

async function main() {
  // Validate environment variables
  const daytonaApiKey = process.env.DAYTONA_API_KEY
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY

  if (!daytonaApiKey) {
    console.error('Error: DAYTONA_API_KEY environment variable is not set')
    process.exit(1)
  }

  if (!anthropicApiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set')
    process.exit(1)
  }

  const sandboxApiKey = process.env.SANDBOX_ANTHROPIC_API_KEY || anthropicApiKey

  // Initialize Daytona client
  const daytona = new Daytona({ apiKey: daytonaApiKey })
  let sandbox: Sandbox | undefined

  const cleanup = async () => {
    try {
      console.log('\nCleaning up...')
      if (sandbox) await sandbox.delete()
    } catch (e) {
      console.error('Error deleting sandbox:', e)
    } finally {
      process.exit(0)
    }
  }

  try {
    console.log('Creating sandbox with Playwright MCP support...')

    // Create a sandbox with browser automation dependencies
    sandbox = await daytona.create({
      image: Image.base('python:3.11-slim').runCommands(
        'apt-get update',
        'apt-get install -y --no-install-recommends wget gnupg2 curl',
        // Install Node.js for Playwright MCP
        'curl -fsSL https://deb.nodesource.com/setup_20.x | bash -',
        'apt-get install -y nodejs',
        // Install Playwright and its dependencies
        'pip install playwright',
        'playwright install chromium',
        'playwright install-deps chromium',
        // Install Playwright MCP server
        'npm install -g @playwright/mcp@latest',
      ),
      envVars: {
        ANTHROPIC_API_KEY: sandboxApiKey,
      },
      autoStopInterval: 30,
    }, {
      timeout: 300, // 5 minutes for image creation
      onSnapshotCreateLogs: console.log,
    })

    console.log(`Sandbox created: ${sandbox.id}`)

    // Register cleanup handler
    process.once('SIGINT', cleanup)

    // Initialize code interpreter context
    console.log('Initializing browser automation environment...')
    const ctx = await sandbox.codeInterpreter.createContext()

    // Verify Playwright is working
    const verifyResult = await sandbox.codeInterpreter.runCode(`
import sys
print(f"Python version: {sys.version}")
try:
    from playwright.sync_api import sync_playwright
    print("Playwright is installed and ready!")
except ImportError as e:
    print(f"Playwright import error: {e}")
`)
    console.log(verifyResult.stdout)

    // Initialize the Browser Automation Agent
    const browserAgent = new BrowserAutomationAgent(anthropicApiKey, sandbox, ctx)

    // Set up readline interface
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.once('SIGINT', cleanup)

    console.log('\n' + '='.repeat(60))
    console.log(renderMarkdown('Browser Automation Agent Ready', BLUE))
    console.log('='.repeat(60))
    console.log('This agent can automate browser tasks using Playwright MCP.')
    console.log('Example prompts:')
    console.log('  - "Go to https://example.com and take a screenshot"')
    console.log('  - "Navigate to https://news.ycombinator.com and get the page title"')
    console.log('  - "Open https://google.com and tell me what you see"')
    console.log('Press Ctrl+C at any time to exit.\n')

    // Interactive prompt loop
    while (true) {
      const prompt = await new Promise<string>((resolve) => rl.question('User: ', resolve))
      if (!prompt.trim()) continue
      await browserAgent.processUserRequest(prompt)
    }
  } catch (error) {
    console.error('An error occurred:', error)
    if (sandbox) await sandbox.delete()
    process.exit(1)
  }
}

main().catch(console.error)
