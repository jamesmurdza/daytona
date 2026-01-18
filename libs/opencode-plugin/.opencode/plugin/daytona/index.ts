/**
 * OpenCode Plugin: Daytona Sandbox Integration
 * 
 * OpenCode plugins extend the AI coding assistant by adding custom tools, handling events,
 * and modifying behavior. Plugins are TypeScript/JavaScript modules that export functions
 * which return hooks for various lifecycle events.
 * 
 * This plugin integrates Daytona sandboxes with OpenCode, providing isolated development
 * environments for each session. It adds custom tools for file operations, command execution,
 * and search within sandboxes, and automatically cleans up resources when sessions end.
 * 
 * Learn more: https://opencode.ai/docs/plugins/
 */

import { type Plugin, type PluginInput, type ToolContext } from "@opencode-ai/plugin"

import { appendFileSync, readFileSync, writeFileSync, existsSync } from "fs"
import { join } from "path"
import { Daytona, type Sandbox, type FileInfo } from "@daytonaio/sdk"
import { z } from "zod";

// OpenCode Types:

export type EventSessionDeleted = {
    type: "session.deleted";
    properties: {
        info: { id: string };
    };
};

// OpenCode constants:

const EVENT_TYPE_SESSION_DELETED = 'session.deleted';

// Daytona plugin types:

type LogLevel = 'INFO' | 'ERROR' | 'WARN';

type SandboxInfo = {
    id: string;
};

// Daytona plugin constants:

const LOG_LEVEL_INFO: LogLevel = 'INFO';
const LOG_LEVEL_ERROR: LogLevel = 'ERROR';
const LOG_LEVEL_WARN: LogLevel = 'WARN';

/**
 * Daytona Sandbox Integration Tools
 * 
 * Requires:
 * - npm install @daytonaio/sdk
 * - Environment: DAYTONA_API_KEY
 */

/**
 * Logger class for handling plugin logging
 */
class Logger {
  private readonly logFile: string;

  constructor(logFile: string) {
    this.logFile = logFile;
  }

  log(message: string, level: LogLevel = LOG_LEVEL_INFO): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    appendFileSync(this.logFile, logEntry);
  }

  info(message: string): void {
    this.log(message, LOG_LEVEL_INFO);
  }

  error(message: string): void {
    this.log(message, LOG_LEVEL_ERROR);
  }

  warn(message: string): void {
    this.log(message, LOG_LEVEL_WARN);
  }
}

/**
 * Manages Daytona sandbox sessions and persists session-sandbox mappings
 */
class DaytonaSessionManager {
  private readonly apiKey: string;
  private readonly sessionMapFile: string;
  private readonly logger: Logger;
  private sessionSandboxes: Map<string, Sandbox | SandboxInfo>;

  // Initialize with API key, session map file path, and logger
  constructor(apiKey: string, sessionMapFile: string, logger: Logger) {
    this.apiKey = apiKey;
    this.sessionMapFile = sessionMapFile;
    this.logger = logger;
    this.sessionSandboxes = this.loadSessionMap();
  }

  // Load session map from file
  private loadSessionMap(): Map<string, Sandbox | SandboxInfo> {
    const map = new Map<string,   Sandbox | SandboxInfo>();
    try {
      if (existsSync(this.sessionMapFile)) {
        const data = JSON.parse(readFileSync(this.sessionMapFile, 'utf-8')) as Record<string, SandboxInfo>;
        for (const [sessionId, sandboxInfo] of Object.entries(data)) {
          map.set(sessionId, sandboxInfo);
        }
      }
    } catch (err) {
      this.logger.error(`Failed to load session map: ${err}`);
    }
    return map;
  }

  // Save session map to file
  private saveSessionMap(): void {
    try {
      const data: Record<string, SandboxInfo> = {};
      for (const [sessionId, sandbox] of this.sessionSandboxes.entries()) {
        data[sessionId] = { id: sandbox.id };
      }
      writeFileSync(this.sessionMapFile, JSON.stringify(data, null, 2));
    } catch (err) {
      this.logger.error(`Failed to save session map: ${err}`);
    }
  }

  // Get or create a sandbox for the given session ID
  async getSandbox(sessionId: string): Promise<Sandbox> {
    if (!this.apiKey) {
      this.logger.error('DAYTONA_API_KEY is not set. Cannot create or retrieve sandbox.');
      throw new Error('DAYTONA_API_KEY is not set. Please set the environment variable to use Daytona sandboxes.');
    }
    if (!this.sessionSandboxes.has(sessionId)) {
      this.logger.info(`Creating new sandbox for session: ${sessionId}`);
      const daytona = new Daytona({ apiKey: this.apiKey });
      const sandbox = await daytona.create();
      this.sessionSandboxes.set(sessionId, sandbox);
      this.saveSessionMap();
      this.logger.info(`Sandbox created successfully.`);
    } else {
      const sandboxInfo = this.sessionSandboxes.get(sessionId);
      if (sandboxInfo && !('process' in sandboxInfo)) {
        const daytona = new Daytona({ apiKey: this.apiKey });
        const sandbox = await daytona.create();
        this.sessionSandboxes.set(sessionId, sandbox);
        this.saveSessionMap();
      } else {
        this.logger.info(`Reusing existing sandbox for session: ${sessionId}`);
      }
    }

    const sandbox = this.sessionSandboxes.get(sessionId);
    if (!sandbox) {
      throw new Error(`Failed to get sandbox for session: ${sessionId}`);
    }
    if (!('process' in sandbox)) {
      throw new Error(`Sandbox is not fully initialized for session: ${sessionId}`);
    }
    return sandbox as Sandbox;
  }

  // Delete the sandbox associated with the given session ID
  async deleteSandbox(sessionId: string): Promise<void> {
    const sandbox = this.sessionSandboxes.get(sessionId);
    if (sandbox && 'delete' in sandbox) {
      this.logger.info(`Removing sandbox for session: ${sessionId}`);
      await sandbox.delete();
      this.sessionSandboxes.delete(sessionId);
      this.saveSessionMap();
      this.logger.info(`Sandbox deleted successfully.`);
    } else {
      this.logger.warn(`No sandbox found for session: ${sessionId}`);
    }
  }
}

// Initialize logger and session manager
const LOG_FILE = join(process.env.HOME || '/tmp', '.daytona-plugin.log');
const SESSION_MAP_FILE = join(process.env.HOME || '/tmp', '.daytona-sessions.json');
const logger = new Logger(LOG_FILE);

const sessionManager = new DaytonaSessionManager(
  process.env.DAYTONA_API_KEY || '',
  SESSION_MAP_FILE,
  logger
);

export const CustomToolsPlugin: Plugin = async (pluginCtx: PluginInput) => {
  logger.info('OpenCode started with Daytona plugin');
  return {
    tool: {
      /**
       * Executes a shell command in the Daytona sandbox and returns the output
       * @param command - Shell command to execute
       */
      bash: {
        description: "Executes shell commands in a Daytona sandbox",
        args: {
          command: z.string(),
          background: z.boolean().optional(),
        },
        async execute(args: { command: string; background?: boolean }, ctx: ToolContext) {
          const sessionId = ctx.sessionID;
          const sandbox = await sessionManager.getSandbox(sessionId);
          if (args.background) {
            // Run command in background using session-based execution
            const execSessionId = `exec-session-${sessionId}`;
            
            // Create session if it doesn't exist
            try {
              await sandbox.process.getSession(execSessionId);
            } catch {
              await sandbox.process.createSession(execSessionId);
            }
            
            // Execute command asynchronously in the session
            const result = await sandbox.process.executeSessionCommand(execSessionId, {
              command: args.command,
              runAsync: true,
            });
            
            return `Command started in background (cmdId: ${result.cmdId})`;
          } else {
            const result = await sandbox.process.executeCommand(args.command)
            return `Exit code: ${result.exitCode}\n${result.result}`;
          }
        },
      },

      /**
       * Reads and returns the contents of a file from the sandbox
       * @param filePath - Path to the file to read
       */
      read: {
        description: "Reads file from Daytona sandbox",
        args: {
          filePath: z.string(),
        },
        async execute(args: { filePath: string }, ctx: ToolContext) {
          const sandbox = await sessionManager.getSandbox(ctx.sessionID);
          const buffer = await sandbox.fs.downloadFile(args.filePath);
          const decoder = new TextDecoder();
          return decoder.decode(buffer);
        },
      },

      /**
       * Writes content to a file in the sandbox, creating it if it doesn't exist
       * @param filePath - Path to the file to write
       * @param content - Content to write to the file
       */
      write: {
        description: "Writes content to file in Daytona sandbox",
        args: {
          filePath: z.string(),
          content: z.string(),
        },
        async execute(args: { filePath: string; content: string }, ctx: ToolContext) {
          const sandbox = await sessionManager.getSandbox(ctx.sessionID);
          await sandbox.fs.uploadFile(Buffer.from(args.content), args.filePath);
          return `Written ${args.content.length} bytes to ${args.filePath}`;
        },
      },

      /**
       * Replaces the first occurrence of a text pattern in a file
       * @param filePath - Path to the file to edit
       * @param oldString - Text to search for
       * @param newString - Text to replace with
       */
      edit: {
        description: "Replaces text in a file in Daytona sandbox",
        args: {
          filePath: z.string(),
          oldString: z.string(),
          newString: z.string(),
        },
        async execute(args: { filePath: string; oldString: string; newString: string }, ctx: ToolContext) {
          const sandbox = await sessionManager.getSandbox(ctx.sessionID);
          const buffer = await sandbox.fs.downloadFile(args.filePath);
          const decoder = new TextDecoder();
          const content = decoder.decode(buffer);
          const newContent = content.replace(args.oldString, args.newString);
          await sandbox.fs.uploadFile(Buffer.from(newContent), args.filePath);
          return `Edited ${args.filePath}`;
        },
      },

      /**
       * Applies multiple text replacements to a file atomically
       * @param filePath - Path to the file to edit
       * @param edits - Array of {oldString, newString} pairs to apply
       */
      multiedit: {
        description: "Applies multiple edits to a file in Daytona sandbox atomically",
        args: {
          filePath: z.string(),
          edits: z.array(
            z.object({
              oldString: z.string(),
              newString: z.string(),
            })
          ),
        },
        async execute(args: { filePath: string; edits: Array<{ oldString: string; newString: string }> }, ctx: ToolContext) {
          const sandbox = await sessionManager.getSandbox(ctx.sessionID);
          const buffer = await sandbox.fs.downloadFile(args.filePath);
          const decoder = new TextDecoder();
          let content = decoder.decode(buffer);
          
          for (const edit of args.edits) {
            content = content.replace(edit.oldString, edit.newString);
          }
          
          await sandbox.fs.uploadFile(Buffer.from(content), args.filePath);
          return `Applied ${args.edits.length} edits to ${args.filePath}`;
        },
      },

      /**
       * Patches a file by replacing a code snippet with a new one
       * @param filePath - Path to the file to patch
       * @param oldSnippet - Code snippet to search for
       * @param newSnippet - Code snippet to replace with
       */
      patch: {
        description: "Patches a file with a code snippet in Daytona sandbox",
        args: {
          filePath: z.string(),
          oldSnippet: z.string(),
          newSnippet: z.string(),
        },
        async execute(args: { filePath: string; oldSnippet: string; newSnippet: string }, ctx: ToolContext) {
          const sandbox = await sessionManager.getSandbox(ctx.sessionID);
          const buffer = await sandbox.fs.downloadFile(args.filePath);
          const decoder = new TextDecoder();
          const content = decoder.decode(buffer);
          const newContent = content.replace(args.oldSnippet, args.newSnippet);
          await sandbox.fs.uploadFile(Buffer.from(newContent), args.filePath);
          return `Patched ${args.filePath}`;
        },
      },

      /**
       * Lists files and directories in the specified path (or working directory)
       * @param dirPath - Optional directory path to list (defaults to working directory)
       */
      ls: {
        description: "Lists files in a directory in Daytona sandbox",
        args: {
          dirPath: z.string().optional(),
        },
        async execute(args: { dirPath?: string }, ctx: ToolContext) {
          const sandbox = await sessionManager.getSandbox(ctx.sessionID);
          const workDir = await sandbox.getWorkDir();
          const path = args.dirPath || workDir;
          const files = await sandbox.fs.listFiles(path) as FileInfo[];
          return files.map((f) => f.name).join('\n');
        },
      },

      /**
       * Searches for files matching a glob pattern in the sandbox
       * @param pattern - Glob pattern to match files (e.g., "**\/*.ts")
       */
      glob: {
        description: "Searches for files matching a pattern in Daytona sandbox",
        args: {
          pattern: z.string(),
        },
        async execute(args: { pattern: string }, ctx: ToolContext) {
          const sandbox = await sessionManager.getSandbox(ctx.sessionID);
          const workDir = await sandbox.getWorkDir();
          const result = await sandbox.fs.searchFiles(workDir, args.pattern);
          return result.files.join('\n');
        },
      },

      /**
       * Searches for text patterns in files and returns matching lines
       * @param pattern - Text pattern to search for
       */
      grep: {
        description: "Searches for text pattern in files in Daytona sandbox",
        args: {
          pattern: z.string(),
        },
        async execute(args: { pattern: string }, ctx: ToolContext) {
          const sandbox = await sessionManager.getSandbox(ctx.sessionID);
          const workDir = await sandbox.getWorkDir();
          const matches = await sandbox.fs.findFiles(workDir, args.pattern);
          return matches.map((m) => `${m.file}:${m.line}: ${m.content}`).join('\n');
        },
      },

      /**
       * Performs LSP (Language Server Protocol) operations for code intelligence (not yet implemented)
       * @param op - LSP operation to perform
       * @param filePath - Path to the file
       * @param line - Line number
       */
      lsp: {
        description: "LSP operation in Daytona sandbox (code intelligence)",
        args: {
          op: z.string(),
          filePath: z.string(),
          line: z.number(),
        },
        async execute(args: { op: string; filePath: string; line: number }, ctx: ToolContext) {
          return `LSP operations are not yet implemented in the Daytona plugin.`
        },
      },

      getPreviewURL: {
        description: "Gets a preview URL for the Daytona sandbox",
        args: {
          port: z.number()
        },
        async execute(args: { port: number }, ctx: ToolContext) {
          const sandbox = await sessionManager.getSandbox(ctx.sessionID);
          const previewLink = await sandbox.getPreviewLink(args.port);
          return `Sandbox Preview URL: ${previewLink.url}`;
        },
      },
    },
  }
}

export const DaytonaSessionCleanupPlugin: Plugin = async ({ $ }) => {
  return {
    /**
     * Cleans up sandbox resources when a session is deleted
     */
    event: async ({ event } ) => {
      if (event.type === EVENT_TYPE_SESSION_DELETED) {
        const sessionId = (event as EventSessionDeleted).properties.info.id;
        await sessionManager.deleteSandbox(sessionId);
      }
    },
  };
};

export const SystemTransformPlugin: Plugin = async (pluginCtx: PluginInput) => {
  return {
    "experimental.chat.system.transform": async (input, output) => {
      output.system.push(`
        ## Daytona Sandbox Integration
        This session is running with Daytona sandbox integration enabled.
        All tool calls will execute in a Daytona sandbox environment.
        The sandbox working directory is /home/daytona/.
        Do NOT try to use the current working directory of the host system.
        When executing long-running commands, use the 'background' option to run them asynchronously.
      `)
    },
  }
}
