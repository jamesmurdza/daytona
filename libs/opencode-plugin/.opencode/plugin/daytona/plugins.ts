/**
 * OpenCode plugin implementations for Daytona sandbox integration
 */

import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Logger } from "./logger";
import type { DaytonaSessionManager } from "./session-manager";
import type { EventSessionDeleted } from "./types";
import { EVENT_TYPE_SESSION_DELETED } from "./types";
import { createDaytonaTools } from "./tools";

/**
 * Creates the custom tools plugin for Daytona sandbox integration
 * Provides tools for file operations, command execution, and search within sandboxes
 */
export function createCustomToolsPlugin(
  logger: Logger,
  sessionManager: DaytonaSessionManager
): Plugin {
  return async (pluginCtx: PluginInput) => {
    logger.info('OpenCode started with Daytona plugin');
    const projectId = pluginCtx.project.id;
    const worktree = pluginCtx.project.worktree;
    
    return {
      tool: createDaytonaTools(sessionManager, projectId, worktree),
    };
  };
}

/**
 * Creates the session cleanup plugin for Daytona
 * Automatically cleans up sandbox resources when sessions end
 */
export function createSessionCleanupPlugin(
  sessionManager: DaytonaSessionManager
): Plugin {
  return async (pluginCtx: PluginInput) => {
    const projectId = pluginCtx.project.id;
    
    return {
      /**
       * Cleans up sandbox resources when a session is deleted
       */
      event: async ({ event }) => {
        if (event.type === EVENT_TYPE_SESSION_DELETED) {
          const sessionId = (event as EventSessionDeleted).properties.info.id;
          await sessionManager.deleteSandbox(sessionId, projectId);
        }
      },
    };
  };
}

/**
 * Creates the system transform plugin for Daytona
 * Adds Daytona-specific instructions to the system prompt
 */
export function createSystemTransformPlugin(): Plugin {
  return async (pluginCtx: PluginInput) => {
    return {
      "experimental.chat.system.transform": async (input, output) => {
        output.system.push(`
        ## Daytona Sandbox Integration
        This session is running with Daytona sandbox integration enabled.
        All tool calls will execute in a Daytona sandbox environment.
        The sandbox working directory is /home/daytona/.
        Do NOT try to use the current working directory of the host system.
        When executing long-running commands, use the 'background' option to run them asynchronously.
      `);
      },
    };
  };
}
