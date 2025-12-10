import { Daytona } from '@daytonaio/sdk';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

import * as readline from 'readline';

async function processPrompt(prompt: string, sandbox: any): Promise<void> {
  console.log('Processing your request...');
  try {
    const result = await sandbox.process.executeCommand(`
      echo "${prompt.replace(/"/g, '\\"')}" | npx @anthropic-ai/claude-code -p --dangerously-skip-permissions
    `);
    console.log('Claude:', result.result);
    return result.result;
  } catch (error) {
    console.error('Error processing prompt:', error);
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

  // Initialize the Daytona client
  const daytona = new Daytona({ apiKey });
  
  console.log('Creating sandbox...');
  
  try {
    // Create a new sandbox with node template
    const sandbox = await daytona.create({
      language: 'typescript',
      envVars: {
        'ANTHROPIC_API_KEY': process.env.SANDBOX_ANTHROPIC_API_KEY || '',
      },
    });
    const previewLink = await sandbox.getPreviewLink(80);
    console.log(`Preview link: ${previewLink.url}`);

    try {
      console.log('Installing Claude Code...');
      const installResult = await sandbox.process.executeCommand(`
        npm init -y && \
        npm install @anthropic-ai/claude-code
      `);
      
      if (installResult.exitCode !== 0) {
        console.error('Error installing Claude Code.');
        process.exit(1);
      }

      // Set up readline interface for user input
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'Enter your prompt (or press Ctrl+C to exit): ', 
      });

      console.log('Claude Code is ready! Type your prompt and press Enter to get a response.');
      console.log('Press Ctrl+C at any time to exit.');

      // Process user input in a loop
      const processUserInput = async () => {

        const prompt = await new Promise<string>((resolve) => {
          rl.question('Enter your prompt (or press Ctrl+C to exit): ', (answer) => {
            resolve(answer);
          });
        });

        if (prompt.trim()) {
          try {
            await processPrompt(prompt, sandbox);
          } catch (error) {
            console.error('Error:', error);
          } finally {
            processUserInput();
          }
        } else {
          processUserInput();
        }
      };
      
      // Start the input processing loop
      await new Promise<void>((resolve) => {
        // Handle process exit to ensure cleanup
        const cleanup = async () => {
          console.log('Cleaning up...');
          await sandbox.delete();
          process.exit(0);
        };

        // Handle Ctrl+C and process exit
        process.on('SIGINT', cleanup);
        process.on('exit', cleanup);

        // Start the input loop
        const run = async () => {
          try {
            await processUserInput();
          } catch (error) {
            console.error('Error in input loop:', error);
            await cleanup();
          }
        };

        run();
      });
    } finally {
      // This will be called if there's an error in the main try block
      console.log('Cleaning up...');
      await sandbox.delete();
    }
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

main().catch(console.error);