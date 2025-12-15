import { Daytona, Sandbox } from '@daytonaio/sdk'
import * as dotenv from 'dotenv'
import * as readline from 'readline'
import * as fs from 'fs'
import * as path from 'path'

// Load environment variables from .env file
dotenv.config()

// Function to run the coding agent in the sandbox with the given prompt
async function processPrompt(prompt: string, sandbox: any, ctx: any): Promise<void> {
  console.log('Processing your request...')

  try {
    const result = await sandbox.codeInterpreter.runCode(`coding_agent.run_query_sync(os.environ.get('PROMPT', ''))`, {
      context: ctx,
      envs: {
        PROMPT: prompt,
      },
      onStdout: (msg: any) => process.stdout.write(msg.output),
      onStderr: (msg: any) => process.stdout.write(msg.output),
    })

    if (result.error) {
      throw new Error(`Execution error: ${result.error.value}`)
    }
  } catch (error) {
    console.error('\nError processing prompt:', error)
    throw error
  }
}

async function main() {
  // Get the Daytona API key from environment variables
  const apiKey = process.env.DAYTONA_API_KEY

  if (!apiKey) {
    console.error('Error: DAYTONA_API_KEY environment variable is not set')
    console.error('Please create a .env file with your Daytona API key')
    process.exit(1)
  }

  // Check for Anthropic API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set')
    console.error('Please create a .env file with your Anthropic API key')
    process.exit(1)
  }

  // Initialize the Daytona client
  const daytona = new Daytona({ apiKey })

  console.log('Creating sandbox...')

  try {
    // Create a new sandbox with typescript template
    const sandbox = await daytona.create({
      language: 'typescript',
      envVars: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
    })
    const previewLink = await sandbox.getPreviewLink(80)

    try {
      console.log('Installing Agent SDK...')
      // Install using process command to ensure it's in the system Python
      const installResult = await sandbox.process.executeCommand('python3 -m pip install claude-agent-sdk')

      if (installResult.exitCode !== 0) {
        console.error('Error installing Agent SDK:', installResult.result || 'Unknown error')
        process.exit(1)
      }

      console.log('Initializing Agent SDK...')

      // Use a context to maintain state between agent queries
      const ctx = await sandbox.codeInterpreter.createContext()

      // Upload and import the coding agent script
      // This works because /tmp is in the PYTHONPATH by default
      await sandbox.fs.uploadFile('src/coding_agent.py', '/tmp/coding_agent.py')
      const initResult = await sandbox.codeInterpreter.runCode(
        `import os, coding_agent;`,
        {
          context: ctx,
          envs: {
            PREVIEW_URL: previewLink.url,
          },
          onStdout: (msg: any) => console.log(msg.output),
          onStderr: (msg: any) => console.error(msg.output),
        },
      )

      if (initResult.error) {
        console.error('Error running init code:', initResult.error.value)
        process.exit(1)
      }

      // Set up readline interface for user input
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      console.log('Press Ctrl+C at any time to exit.')

      // Process user input in a loop
      const processUserInput = async (): Promise<void> => {
        try {
          const prompt = await new Promise<string>((resolve) => {
            // If the user presses Ctrl+C while readline is waiting, readline emits a 'SIGINT'
            // event (it does not necessarily let the process-level SIGINT handler run). We
            // attach a one-time listener that runs our cleanup and prevents the question
            // callback from hanging.
            const onReadlineSigint = () => {
              // Cleanup will exit the process; don't try to resolve the prompt here.
              cleanup(0).catch((e) => console.error('Cleanup failed:', e))
            }

            rl.once('SIGINT', onReadlineSigint)

            rl.question('User: ', (answer) => {
              // If we got an answer, remove our SIGINT handler and resolve normally.
              rl.removeListener('SIGINT', onReadlineSigint)
              resolve(answer)
            })
          })

          if (prompt.trim()) {
            try {
              await processPrompt(prompt, sandbox, ctx)
            } catch (error) {
              console.error('Error processing prompt:', error)
            }
          }

          // Continue the loop
          processUserInput()
        } catch (error) {
          // If readline is closed, exit gracefully
          if (error instanceof Error && error.message.includes('readline')) {
            return
          }
          console.error('Error in input loop:', error)
          // Continue the loop even on error
          processUserInput()
        }
      }

      // Handle cleanup — make idempotent so multiple signals don't race
      let cleanedUp = false
      const cleanup = async (exitCode = 0) => {
        if (cleanedUp) return
        cleanedUp = true
        console.log('\n\nCleaning up...')

        try {
          // Close readline if still open
          try {
            rl.close()
          } catch (err) {
            // ignore
          }

          // Try deleting the sandbox, but don't hang forever
          const deletePromise = sandbox.delete()
          const timeout = new Promise((resolve) => setTimeout(resolve, 5000))
          await Promise.race([deletePromise, timeout])
        } catch (error) {
          console.error('Error during cleanup:', error)
        } finally {
          // Use setImmediate to allow stdout to flush
          setImmediate(() => process.exit(exitCode))
        }
      }

      // Handle signals — ensure cleanup runs for SIGINT (Ctrl+C) and SIGTERM
      const onSignal = (signal: string) => {
        console.log(`\nReceived ${signal}`)
        cleanup(0).catch((e) => console.error('Cleanup failed:', e))
      }

      process.on('SIGINT', () => onSignal('SIGINT'))
      process.on('SIGTERM', () => onSignal('SIGTERM'))

      // (Note: uncaughtException/unhandledRejection handlers removed —
      // keep global error handling elsewhere if desired.)

      // Start the input loop
      await processUserInput()
    } catch (error) {
      // This will be called if there's an error in the inner try block
      console.error('Error in main loop:', error)
      console.log('Cleaning up...')
      try {
        await sandbox.delete()
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError)
      }
      process.exit(1)
    }
  } catch (error) {
    console.error('An error occurred:', error)
    process.exit(1)
  }
}

main().catch(console.error)
