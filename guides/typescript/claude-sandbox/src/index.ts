import { Daytona, Sandbox } from '@daytonaio/sdk';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

// Load environment variables from .env file
dotenv.config();

async function processPrompt(prompt: string, sandbox: any, ctx: any): Promise<void> {
  console.log('Processing your request...');
  
  try {
    // Use the Python code interpreter to run Agent SDK code
    // The code interpreter maintains state between calls, so the client persists
    const pythonCode = `
import asyncio
import sys
import os
import re
from claude_agent_sdk import AssistantMessage, TextBlock, ToolUseBlock

def render_markdown(text):
    # ANSI escape codes
    ESC = chr(27)
    BOLD = ESC + '[1m'
    ITALIC = ESC + '[3m'
    DIM = ESC + '[2m'
    RESET = ESC + '[0m'
    
    # Convert **bold** to ANSI bold (process first)
    text = re.sub(r'\\*\\*(.+?)\\*\\*', BOLD + r'\\1' + RESET, text)
    # Convert *italic* to ANSI italic (single asterisks that aren't part of **)
    # Use negative lookahead/lookbehind to avoid matching **
    text = re.sub(r'(?<!\\*)\\*([^\\*\\n]+?)\\*(?!\\*)', ITALIC + r'\\1' + RESET, text)
    # Convert code backticks to ANSI dim
    backtick = chr(96)
    text = re.sub(backtick + r'([^' + backtick + r']+?)' + backtick, DIM + r'\\1' + RESET, text)
    return text

async def run_query():
    # Connect client if not already connected (connection persists across calls)
    try:
        if 'client_connected' not in globals():
            await client.connect()
            globals()['client_connected'] = True
    except Exception as e:
        # If already connected or other error, continue anyway
        if 'already' not in str(e).lower() and 'connected' not in str(e).lower():
            raise
    
    # Get the prompt from environment variable
    prompt = os.environ.get('PROMPT', '')
    
    # Use the global client that maintains conversation context
    await client.query(prompt)
    
    # Process the response
    async for message in client.receive_response():
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    # Render markdown in the text
                    rendered = render_markdown(block.text)
                    sys.stdout.write(rendered)
                    sys.stdout.flush()
                elif isinstance(block, ToolUseBlock):
                    print(f"\\n[Tool: {block.name}]")
        elif hasattr(message, 'subtype'):
            print(f"\\n[Done: {message.subtype}]")

asyncio.run(run_query())
`;

    const result = await sandbox.codeInterpreter.runCode(pythonCode, {
      context: ctx,
      envs: {
        PROMPT: prompt,
      },
      onStdout: (msg: any) => process.stdout.write(msg.output),
      onStderr: (msg: any) => {
        // Filter out INFO level messages
        const output = msg.output;
        //if (!output.includes('INFO:') && !output.includes('Using bundled Claude Code CLI')) {
          process.stderr.write(output);
        //}
      },
    });

    if (result.error) {
      throw new Error(`Execution error: ${result.error.value}`);
    }
  } catch (error) {
    console.error('\nError processing prompt:', error);
    throw error;
  }
}

async function main() {
  // Get the Daytona API key from environment variables
  const apiKey = process.env.DAYTONA_API_KEY;
 
  if (!apiKey) {
    console.error('Error: DAYTONA_API_KEY environment variable is not set');
    console.error('Please create a .env file with your Daytona API key');
    process.exit(1);
  }

  // Check for Anthropic API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is not set');
    console.error('Please create a .env file with your Anthropic API key');
    process.exit(1);
  }

  // Initialize the Daytona client
  const daytona = new Daytona({ apiKey });

  console.log('Creating sandbox...');
  
  try {
    // Create a new sandbox with typescript template
    const sandbox = await daytona.create({
      language: 'typescript',
      envVars: {
        'ANTHROPIC_API_KEY': process.env.ANTHROPIC_API_KEY,
      },
    });
    const previewLink = await sandbox.getPreviewLink(80);

    try {
      console.log('Installing Agent SDK...');
      // Install using process command to ensure it's in the system Python
      const installResult = await sandbox.process.executeCommand(
        'python3 -m pip install claude-agent-sdk'
      );
      
      if (installResult.exitCode !== 0) {
        console.error('Error installing Agent SDK:', installResult.result || 'Unknown error');
        process.exit(1);
      }

      // Test that the SDK is available in the code interpreter
      console.log('Initializing Agent SDK...');
      // Use a context to maintain state between calls
      const ctx = await sandbox.codeInterpreter.createContext();
      
      // Initialize ClaudeSDKClient for continuous conversation
      const initCode = `
import asyncio
import os
import logging
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions

# Suppress INFO level logging from claude_agent_sdk
logging.getLogger('claude_agent_sdk').setLevel(logging.WARNING)

# Get the preview URL from environment variable
preview_url = os.environ.get('PREVIEW_URL', '')

# Create a global client instance for continuous conversation
client = ClaudeSDKClient(
    options=ClaudeAgentOptions(
        allowed_tools=["Read", "Edit", "Glob", "Grep", "Bash"],
        permission_mode="acceptEdits",
        system_prompt=f"You are running in a Daytona sandbox. Your public preview URL for port 80 is: {preview_url}. This is an example of the preview URL format - when you start services on different ports, they will be accessible at similar preview URLs following the same pattern. For example, a server on port 8000 would be accessible at a preview URL like this one but for port 8000."
    )
)

# Connect the client (this will be awaited in the first query)
print("Agent SDK is ready.")
`;
      
      const initResult = await sandbox.codeInterpreter.runCode(initCode, {
        context: ctx,
        envs: {
          PREVIEW_URL: previewLink.url,
        },
        onStdout: (msg: any) => console.log(msg.output),
        onStderr: (msg: any) => console.error(msg.output),
      });
      
      if (initResult.error) {
        console.error('Error initializing Agent SDK:', initResult.error.value);
        process.exit(1);
      }

      // Set up readline interface for user input
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      console.log('Press Ctrl+C at any time to exit.');

      // Process user input in a loop
      const processUserInput = async (): Promise<void> => {
        try {
          const prompt = await new Promise<string>((resolve) => {
            rl.question('User: ', (answer) => {
              resolve(answer);
            });
          });

          if (prompt.trim()) {
            try {
              await processPrompt(prompt, sandbox, ctx);
            } catch (error) {
              console.error('Error processing prompt:', error);
            }
          }
          
          // Continue the loop
          processUserInput();
        } catch (error) {
          // If readline is closed, exit gracefully
          if (error instanceof Error && error.message.includes('readline')) {
            return;
          }
          console.error('Error in input loop:', error);
          // Continue the loop even on error
          processUserInput();
        }
      };
      
      // Handle cleanup
      const cleanup = async () => {
        console.log('\n\nCleaning up...');
        rl.close();
        try {
          await sandbox.delete();
        } catch (error) {
          console.error('Error during cleanup:', error);
        }
        process.exit(0);
      };

      // Handle Ctrl+C
      process.on('SIGINT', cleanup);

      // Start the input loop
      await processUserInput();
    } catch (error) {
      // This will be called if there's an error in the inner try block
      console.error('Error in main loop:', error);
      console.log('Cleaning up...');
      try {
        await sandbox.delete();
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

main().catch(console.error);