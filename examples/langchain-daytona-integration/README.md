# LangChain + Daytona Integration Examples

This directory contains comprehensive examples demonstrating how to integrate [LangChain](https://www.langchain.com/) with [Daytona](https://daytona.io) sandboxes for building secure, powerful AI agents.

## What is Daytona?

Daytona provides secure, elastic infrastructure for running AI-generated code. It offers:

- **Sub-90ms sandbox creation** - Lightning-fast isolated environments
- **Secure execution** - Run untrusted code with zero risk to your infrastructure
- **Multi-language support** - Python, TypeScript, JavaScript, and more
- **Rich APIs** - File system, Git, process execution, and desktop automation

## Examples Overview

| Example | Description |
|---------|-------------|
| `basic_code_executor.py` | Simple tool for executing Python code in sandboxes |
| `multi_tool_agent.py` | Agent with file ops, code execution, and shell commands |
| `code_review_agent.py` | AI code reviewer that clones repos and analyzes code |
| `web_scraper_agent.py` | Secure web scraping with isolated browser environment |

## Requirements

- Python 3.10+
- Daytona API key ([Get one here](https://app.daytona.io/dashboard/keys))
- OpenAI API key or Anthropic API key

## Installation

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install langchain langchain-openai langchain-anthropic daytona python-dotenv
```

## Environment Variables

Create a `.env` file:

```env
DAYTONA_API_KEY=your_daytona_api_key
OPENAI_API_KEY=your_openai_api_key
# Or for Anthropic:
# ANTHROPIC_API_KEY=your_anthropic_api_key
```

## Quick Start

```python
from langchain_daytona import DaytonaCodeExecutorTool
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_openai import ChatOpenAI

# Create tools
code_executor = DaytonaCodeExecutorTool()

# Create agent
llm = ChatOpenAI(model="gpt-4")
agent = create_tool_calling_agent(llm, [code_executor], prompt)
executor = AgentExecutor(agent=agent, tools=[code_executor])

# Run
result = executor.invoke({"input": "Calculate the first 10 Fibonacci numbers"})
print(result)

# Cleanup
code_executor.cleanup()
```

## License

Apache 2.0 - See the main project LICENSE file.
