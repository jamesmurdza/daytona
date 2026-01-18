/**
 * Tool implementations for Daytona sandbox integration
 */

import { z } from "zod";
import type { ToolContext } from "@opencode-ai/plugin";
import type { FileInfo } from "@daytonaio/sdk";
import type { DaytonaSessionManager } from "./session-manager";

export function createDaytonaTools(
  sessionManager: DaytonaSessionManager,
  projectId: string,
  worktree: string
) {
  return {
    /**
     * Executes a shell command in the Daytona sandbox and returns the output
     * @param command - Shell command to execute
     * @param background - Whether to run the command in the background
     */
    bash: {
      description: "Executes shell commands in a Daytona sandbox",
      args: {
        command: z.string(),
        background: z.boolean().optional(),
      },
      async execute(args: { command: string; background?: boolean }, ctx: ToolContext) {
        const sessionId = ctx.sessionID;
        const sandbox = await sessionManager.getSandbox(sessionId, projectId, worktree);
        
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
          const result = await sandbox.process.executeCommand(args.command);
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
        const sandbox = await sessionManager.getSandbox(ctx.sessionID, projectId, worktree);
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
        const sandbox = await sessionManager.getSandbox(ctx.sessionID, projectId, worktree);
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
        const sandbox = await sessionManager.getSandbox(ctx.sessionID, projectId, worktree);
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
        const sandbox = await sessionManager.getSandbox(ctx.sessionID, projectId, worktree);
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
        const sandbox = await sessionManager.getSandbox(ctx.sessionID, projectId, worktree);
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
        const sandbox = await sessionManager.getSandbox(ctx.sessionID, projectId, worktree);
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
        const sandbox = await sessionManager.getSandbox(ctx.sessionID, projectId, worktree);
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
        const sandbox = await sessionManager.getSandbox(ctx.sessionID, projectId, worktree);
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
        return `LSP operations are not yet implemented in the Daytona plugin.`;
      },
    },

    /**
     * Gets a preview URL for the Daytona sandbox
     * @param port - Port number to preview
     */
    getPreviewURL: {
      description: "Gets a preview URL for the Daytona sandbox",
      args: {
        port: z.number(),
      },
      async execute(args: { port: number }, ctx: ToolContext) {
        const sandbox = await sessionManager.getSandbox(ctx.sessionID, projectId, worktree);
        const previewLink = await sandbox.getPreviewLink(args.port);
        return `Sandbox Preview URL: ${previewLink.url}`;
      },
    },
  };
}
