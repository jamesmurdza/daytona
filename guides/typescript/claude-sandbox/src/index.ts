import { Daytona } from '@daytonaio/sdk';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

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
    });

    try {
      console.log('Installing @anthropic-ai/claude-code locally...');
      
      // Install the Claude package locally instead of globally
      const installResult = await sandbox.process.executeCommand(`
        npm init -y && \
        npm install @anthropic-ai/claude-code
      `);
      
      if (installResult.exitCode !== 0) {
        console.error('Error installing @anthropic-ai/claude-code:');
        console.error('Exit code:', installResult.exitCode);
        console.error('Output:', installResult.result);
        
        // Try to get more detailed error information
        const npmDebugLog = await sandbox.process.executeCommand('cat npm-debug.log 2>/dev/null || echo "No npm debug log found"');
        console.error('npm debug log:', npmDebugLog.result);
        
        process.exit(1);
      }

      // Try to use npx to run the cli
      console.log('Trying to run with npx...');
      const result = await sandbox.process.executeCommand(`
        echo "Create a hello world index.html" | npx @anthropic-ai/claude-code -p --dangerously-skip-permissions
      `);
      
      console.log('Output:', result.result);
      
    } finally {
      // Clean up the sandbox
      console.log('Cleaning up...');
      await sandbox.delete();
    }
    
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

main().catch(console.error);