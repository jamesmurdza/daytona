import os
import logging
import sys
import re
import asyncio
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, AssistantMessage, TextBlock, ToolUseBlock

# Suppress INFO level logging from claude_agent_sdk
logging.getLogger('claude_agent_sdk').setLevel(logging.WARNING)

loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

# Helper: run an async coro from synchronous context in a robust way
def run_sync(coro):
  try:
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(coro)
  except RuntimeError:
    print("NO EVENT LOOP FOUND")

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

# Async init helper
async def init_client():
  await client.__aenter__()
  print("Agent SDK is ready.")

# Async query runner: uses the global client
async def run_query(prompt):
  await client.query(prompt)
  # Process the response
  async for message in client.receive_response():
    if isinstance(message, AssistantMessage):
      for block in message.content:
        if isinstance(block, TextBlock):
          # Render markdown in the text
          rendered = block.text
          sys.stdout.write(rendered)
          sys.stdout.flush()
        elif isinstance(block, ToolUseBlock):
          print(f"\n[Tool: {block.name}]")
    elif hasattr(message, 'subtype'):
      print(f"\n[Done: {message.subtype}]")

def run_query_sync(prompt):
  return run_sync(run_query(prompt))

# Initialize the client once
run_sync(init_client())
