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
 * 
 * Daytona Sandbox Integration Tools
 * 
 * Requires:
 * - npm install @daytonaio/sdk
 * - Environment: DAYTONA_API_KEY
 */

import { join } from "path";
import type { Plugin } from "@opencode-ai/plugin";

// Import modules
import { Logger } from "./logger";
import { DaytonaSessionManager } from "./session-manager";
import {
  createCustomToolsPlugin,
  createSessionCleanupPlugin,
  createSystemTransformPlugin,
} from "./plugins";

// Export types for consumers
export type { EventSessionDeleted, LogLevel, SandboxInfo, SessionInfo, ProjectSessionData } from "./types";

// Initialize logger and session manager
const LOG_FILE = join(process.env.HOME || '/tmp', '.daytona-plugin.log');
const STORAGE_DIR = join(process.env.HOME || '/tmp', '.local/share/opencode/storage/daytona');

const logger = new Logger(LOG_FILE);
const sessionManager = new DaytonaSessionManager(
  process.env.DAYTONA_API_KEY || '',
  STORAGE_DIR,
  logger
);

// Export plugin instances
export const CustomToolsPlugin: Plugin = createCustomToolsPlugin(logger, sessionManager);
export const DaytonaSessionCleanupPlugin: Plugin = createSessionCleanupPlugin(sessionManager);
export const SystemTransformPlugin: Plugin = createSystemTransformPlugin();
