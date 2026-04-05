/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Claude Code + Computer Use MCP Server Example
 * Approach 2: Desktop Automation using Daytona Computer Use API
 *
 * This example demonstrates how to use Claude Code with Daytona's built-in
 * Computer Use API for full desktop automation (mouse, keyboard, screenshots).
 */

import { Daytona, Sandbox, OutputMessage, ExecutionResult } from '@daytonaio/sdk'
import { InterpreterContext } from '@daytonaio/toolbox-api-client'
import Anthropic from '@anthropic-ai/sdk'
import * as dotenv from 'dotenv'
import * as readline from 'readline'
import * as fs from 'fs'

// Load environment variables
dotenv.config()

// ANSI color codes for terminal output
const PURPLE = '\x1b[35m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const RESET = '\x1b[0m'

// Helper function for colored output
function colorize(text: string, color: string): string {
  return `${color}${text}${RESET}`
}

// Desktop Automation Agent using Daytona Computer Use API
class DesktopAutomationAgent {
  private anthropic: Anthropic
  private conversationHistory: any[] = []
  private sandbox: Sandbox

  constructor(apiKey: string, sandbox: Sandbox) {
    this.anthropic = new Anthropic({ apiKey })
    this.sandbox = sandbox
  }

  async processUserRequest(userMessage: string): Promise<void> {
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    })

    console.log(colorize('\n[Desktop Agent] Processing your request...\n', PURPLE))

    let continueLoop = true
    while (continueLoop) {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: `You are a Desktop Automation Agent with access to a Daytona sandbox with full desktop environment.

Your capabilities through Daytona Computer Use API:
1. Mouse operations: move, click, double-click, drag, scroll
2. Keyboard operations: type text, press keys, key combinations (Ctrl+C, Alt+Tab, etc.)
3. Screenshots: take full screen or regional screenshots
4. Display info: get screen resolution, list open windows
5. Full GUI automation of desktop applications

Use these tags to execute actions:
- <mouse_move x="100" y="200">Move mouse to coordinates</mouse_move>
- <mouse_click x="100" y="200" button="left" double="false">Click at position</mouse_click>
- <mouse_drag from_x="100" from_y="100" to_x="200" to_y="200">Drag operation</mouse_drag>
- <keyboard_type>Text to type</keyboard_type>
- <keyboard_press key="Enter" modifiers="ctrl,shift">Press key with modifiers</keyboard_press>
- <keyboard_hotkey>alt+tab</keyboard_hotkey>
- <screenshot>Take screenshot</screenshot>
- <get_windows>List open windows</get_windows>
- <get_display_info>Get display information</get_display_info>

When you're done with all tasks, say "TASK_COMPLETE" to finish.`,
        messages: this.conversationHistory,
      })

      const assistantMessage = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n')

      console.log(colorize(`[Desktop Agent]: ${assistantMessage}`, PURPLE))

      this.conversationHistory.push({
        role: 'assistant',
        content: response.content,
      })

      // Parse and execute desktop automation commands
      let actionExecuted = false

      // Mouse move
      const mouseMoveMatch = assistantMessage.match(/<mouse_move x="(\d+)" y="(\d+)">([\s\S]*?)<\/mouse_move>/)
      if (mouseMoveMatch) {
        const [, x, y] = mouseMoveMatch
        await this.executeMouseMove(parseInt(x), parseInt(y))
        actionExecuted = true
      }

      // Mouse click
      const mouseClickMatch = assistantMessage.match(/<mouse_click x="(\d+)" y="(\d+)"(?: button="(\w+)")?(?: double="(\w+)")?>([\s\S]*?)<\/mouse_click>/)
      if (mouseClickMatch) {
        const [, x, y, button = 'left', double = 'false'] = mouseClickMatch
        await this.executeMouseClick(parseInt(x), parseInt(y), button, double === 'true')
        actionExecuted = true
      }

      // Mouse drag
      const mouseDragMatch = assistantMessage.match(/<mouse_drag from_x="(\d+)" from_y="(\d+)" to_x="(\d+)" to_y="(\d+)">([\s\S]*?)<\/mouse_drag>/)
      if (mouseDragMatch) {
        const [, fromX, fromY, toX, toY] = mouseDragMatch
        await this.executeMouseDrag(parseInt(fromX), parseInt(fromY), parseInt(toX), parseInt(toY))
        actionExecuted = true
      }

      // Keyboard type
      const keyboardTypeMatch = assistantMessage.match(/<keyboard_type>([\s\S]*?)<\/keyboard_type>/)
      if (keyboardTypeMatch) {
        await this.executeKeyboardType(keyboardTypeMatch[1])
        actionExecuted = true
      }

      // Keyboard press
      const keyboardPressMatch = assistantMessage.match(/<keyboard_press key="(\w+)"(?: modifiers="([^"]*)")?>([\s\S]*?)<\/keyboard_press>/)
      if (keyboardPressMatch) {
        const [, key, modifiers = ''] = keyboardPressMatch
        await this.executeKeyboardPress(key, modifiers.split(',').filter(Boolean))
        actionExecuted = true
      }

      // Keyboard hotkey
      const hotkeyMatch = assistantMessage.match(/<keyboard_hotkey>([\s\S]*?)<\/keyboard_hotkey>/)
      if (hotkeyMatch) {
        await this.executeHotkey(hotkeyMatch[1])
        actionExecuted = true
      }

      // Screenshot
      const screenshotMatch = assistantMessage.match(/<screenshot>([\s\S]*?)<\/screenshot>/)
      if (screenshotMatch) {
        await this.takeScreenshot()
        actionExecuted = true
      }

      // Get windows
      const getWindowsMatch = assistantMessage.match(/<get_windows>([\s\S]*?)<\/get_windows>/)
      if (getWindowsMatch) {
        await this.getWindows()
        actionExecuted = true
      }

      // Get display info
      const displayInfoMatch = assistantMessage.match(/<get_display_info>([\s\S]*?)<\/get_display_info>/)
      if (displayInfoMatch) {
        await this.getDisplayInfo()
        actionExecuted = true
      }

      if (actionExecuted) {
        // Continue loop to process any follow-up actions
      } else if (assistantMessage.includes('TASK_COMPLETE')) {
        continueLoop = false
        console.log(colorize('\n[Desktop Agent] All tasks completed!\n', PURPLE))
      } else {
        continueLoop = false
      }
    }
  }

  private async executeMouseMove(x: number, y: number): Promise<void> {
    console.log(colorize(`[Mouse] Moving to (${x}, ${y})...`, GREEN))
    try {
      const result = await this.sandbox.computerUse.mouse.move(x, y)
      console.log(colorize(`[Mouse] Moved to: ${JSON.stringify(result)}`, GREEN))
      this.conversationHistory.push({
        role: 'user',
        content: `Mouse moved to (${x}, ${y}). Result: ${JSON.stringify(result)}`,
      })
    } catch (error: any) {
      const errMsg = `Error moving mouse: ${error.message}`
      console.log(colorize(errMsg, YELLOW))
      this.conversationHistory.push({ role: 'user', content: errMsg })
    }
  }

  private async executeMouseClick(x: number, y: number, button: string, double: boolean): Promise<void> {
    console.log(colorize(`[Mouse] Clicking at (${x}, ${y}), button: ${button}, double: ${double}...`, GREEN))
    try {
      const result = await this.sandbox.computerUse.mouse.click(x, y, button, double)
      console.log(colorize(`[Mouse] Clicked at: ${JSON.stringify(result)}`, GREEN))
      this.conversationHistory.push({
        role: 'user',
        content: `Mouse clicked at (${x}, ${y}). Result: ${JSON.stringify(result)}`,
      })
    } catch (error: any) {
      const errMsg = `Error clicking mouse: ${error.message}`
      console.log(colorize(errMsg, YELLOW))
      this.conversationHistory.push({ role: 'user', content: errMsg })
    }
  }

  private async executeMouseDrag(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
    console.log(colorize(`[Mouse] Dragging from (${fromX}, ${fromY}) to (${toX}, ${toY})...`, GREEN))
    try {
      const result = await this.sandbox.computerUse.mouse.drag(fromX, fromY, toX, toY)
      console.log(colorize(`[Mouse] Drag completed: ${JSON.stringify(result)}`, GREEN))
      this.conversationHistory.push({
        role: 'user',
        content: `Mouse dragged from (${fromX}, ${fromY}) to (${toX}, ${toY}). Result: ${JSON.stringify(result)}`,
      })
    } catch (error: any) {
      const errMsg = `Error dragging: ${error.message}`
      console.log(colorize(errMsg, YELLOW))
      this.conversationHistory.push({ role: 'user', content: errMsg })
    }
  }

  private async executeKeyboardType(text: string): Promise<void> {
    console.log(colorize(`[Keyboard] Typing: "${text}"...`, GREEN))
    try {
      await this.sandbox.computerUse.keyboard.type(text)
      console.log(colorize(`[Keyboard] Typed successfully`, GREEN))
      this.conversationHistory.push({
        role: 'user',
        content: `Typed: "${text}" successfully.`,
      })
    } catch (error: any) {
      const errMsg = `Error typing: ${error.message}`
      console.log(colorize(errMsg, YELLOW))
      this.conversationHistory.push({ role: 'user', content: errMsg })
    }
  }

  private async executeKeyboardPress(key: string, modifiers: string[]): Promise<void> {
    const modStr = modifiers.length > 0 ? ` with modifiers: ${modifiers.join('+')}` : ''
    console.log(colorize(`[Keyboard] Pressing: ${key}${modStr}...`, GREEN))
    try {
      await this.sandbox.computerUse.keyboard.press(key, modifiers)
      console.log(colorize(`[Keyboard] Key pressed successfully`, GREEN))
      this.conversationHistory.push({
        role: 'user',
        content: `Pressed key: ${key}${modStr} successfully.`,
      })
    } catch (error: any) {
      const errMsg = `Error pressing key: ${error.message}`
      console.log(colorize(errMsg, YELLOW))
      this.conversationHistory.push({ role: 'user', content: errMsg })
    }
  }

  private async executeHotkey(hotkey: string): Promise<void> {
    console.log(colorize(`[Keyboard] Executing hotkey: ${hotkey}...`, GREEN))
    try {
      await this.sandbox.computerUse.keyboard.hotkey(hotkey)
      console.log(colorize(`[Keyboard] Hotkey executed successfully`, GREEN))
      this.conversationHistory.push({
        role: 'user',
        content: `Hotkey "${hotkey}" executed successfully.`,
      })
    } catch (error: any) {
      const errMsg = `Error executing hotkey: ${error.message}`
      console.log(colorize(errMsg, YELLOW))
      this.conversationHistory.push({ role: 'user', content: errMsg })
    }
  }

  private async takeScreenshot(): Promise<void> {
    console.log(colorize(`[Screenshot] Taking screenshot...`, CYAN))
    try {
      const screenshot = await this.sandbox.computerUse.screenshot.takeFullScreen()
      console.log(colorize(`[Screenshot] Screenshot taken successfully`, CYAN))

      // Save screenshot locally
      if (screenshot.screenshot) {
        const buffer = Buffer.from(screenshot.screenshot, 'base64')
        const filename = `screenshot_${Date.now()}.png`
        fs.writeFileSync(filename, buffer)
        console.log(colorize(`[Screenshot] Saved to: ${filename}`, CYAN))
        this.conversationHistory.push({
          role: 'user',
          content: `Screenshot taken and saved to ${filename}. Image dimensions available.`,
        })
      }
    } catch (error: any) {
      const errMsg = `Error taking screenshot: ${error.message}`
      console.log(colorize(errMsg, YELLOW))
      this.conversationHistory.push({ role: 'user', content: errMsg })
    }
  }

  private async getWindows(): Promise<void> {
    console.log(colorize(`[Display] Getting open windows...`, CYAN))
    try {
      const windows = await this.sandbox.computerUse.display.getWindows()
      console.log(colorize(`[Display] Windows: ${JSON.stringify(windows, null, 2)}`, CYAN))
      this.conversationHistory.push({
        role: 'user',
        content: `Open windows: ${JSON.stringify(windows)}`,
      })
    } catch (error: any) {
      const errMsg = `Error getting windows: ${error.message}`
      console.log(colorize(errMsg, YELLOW))
      this.conversationHistory.push({ role: 'user', content: errMsg })
    }
  }

  private async getDisplayInfo(): Promise<void> {
    console.log(colorize(`[Display] Getting display info...`, CYAN))
    try {
      const info = await this.sandbox.computerUse.display.getInfo()
      console.log(colorize(`[Display] Info: ${JSON.stringify(info, null, 2)}`, CYAN))
      this.conversationHistory.push({
        role: 'user',
        content: `Display info: ${JSON.stringify(info)}`,
      })
    } catch (error: any) {
      const errMsg = `Error getting display info: ${error.message}`
      console.log(colorize(errMsg, YELLOW))
      this.conversationHistory.push({ role: 'user', content: errMsg })
    }
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

  // Initialize Daytona client
  const daytona = new Daytona({ apiKey: daytonaApiKey })
  let sandbox: Sandbox | undefined

  const cleanup = async () => {
    try {
      console.log('\nCleaning up...')
      if (sandbox) {
        // Stop desktop environment first
        try {
          await sandbox.computerUse.stop()
          console.log('Desktop environment stopped')
        } catch (e) {
          // Ignore errors if desktop wasn't started
        }
        await sandbox.delete()
      }
    } catch (e) {
      console.error('Error during cleanup:', e)
    } finally {
      process.exit(0)
    }
  }

  try {
    console.log('Creating sandbox with desktop environment support...')

    // Create a sandbox with desktop capabilities
    sandbox = await daytona.create({
      language: 'python',
      envVars: {
        ANTHROPIC_API_KEY: anthropicApiKey,
      },
      autoStopInterval: 30,
    })

    console.log(`Sandbox created: ${sandbox.id}`)

    // Register cleanup handler
    process.once('SIGINT', cleanup)

    // Start the desktop environment
    console.log('Starting desktop environment...')
    await sandbox.computerUse.start()
    console.log('Desktop environment started!')

    // Wait for desktop to be ready
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Get desktop status
    const status = await sandbox.computerUse.getStatus()
    console.log(`Desktop status: ${JSON.stringify(status)}`)

    // Get display info
    const displayInfo = await sandbox.computerUse.display.getInfo()
    console.log(`Display: ${JSON.stringify(displayInfo)}`)

    // Initialize the Desktop Automation Agent
    const desktopAgent = new DesktopAutomationAgent(anthropicApiKey, sandbox)

    // Set up readline interface
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.once('SIGINT', cleanup)

    console.log('\n' + '='.repeat(60))
    console.log(colorize('Desktop Automation Agent Ready', PURPLE))
    console.log('='.repeat(60))
    console.log('This agent can control the desktop using Daytona Computer Use API.')
    console.log('Example prompts:')
    console.log('  - "Take a screenshot of the desktop"')
    console.log('  - "Move the mouse to coordinates 500, 300"')
    console.log('  - "Type Hello World and press Enter"')
    console.log('  - "Press Ctrl+C to copy"')
    console.log('  - "Get information about the display"')
    console.log('  - "List all open windows"')
    console.log('Press Ctrl+C at any time to exit.\n')

    // Interactive prompt loop
    while (true) {
      const prompt = await new Promise<string>((resolve) => rl.question('User: ', resolve))
      if (!prompt.trim()) continue
      await desktopAgent.processUserRequest(prompt)
    }
  } catch (error) {
    console.error('An error occurred:', error)
    if (sandbox) {
      try {
        await sandbox.computerUse.stop()
      } catch (e) {
        // Ignore
      }
      await sandbox.delete()
    }
    process.exit(1)
  }
}

main().catch(console.error)
