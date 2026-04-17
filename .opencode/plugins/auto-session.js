import { tool } from "@opencode-ai/plugin";
import fs from "node:fs/promises";

const LOG_FILE = "/tmp/opencode-auto-session.log";

async function log(message, level = "info") {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${level}] ${message}\n`;
  try {
    await fs.appendFile(LOG_FILE, entry);
  } catch (e) {
    console.error(`[auto-session] Failed to write to log: ${e.message}`);
  }
}

export default async function autoSessionPlugin(args, context) {
  await log("=== AUTO-SESSION PLUGIN INITIALIZED ===");
  await log("Plugin ready - using CLI-based session creation");

  return {
    "tool.execute.after": async (input, output, hookContext) => {
      await log(`Hook fired for tool: ${input?.tool || 'unknown'}`);

      // Check for WORKTREE trigger in bash output
      if (input.tool === "bash") {
        const bashOutput = output?.metadata?.output || output?.output || "";
        // Stricter regex: path must start with /, issueNum must be digits
        const worktreeMatch = bashOutput.match(/WORKTREE:(\/[^:]+):(\d+):(.+)/);
        
        if (worktreeMatch) {
          await log("🎯 WORKTREE trigger detected!");
          
          const worktreePath = worktreeMatch[1];
          const issueNum = worktreeMatch[2];
          const issueTitle = worktreeMatch[3];
          
          await log(`Opening worktree via CLI: ${worktreePath}`);
          await log(`Issue: #${issueNum} - ${issueTitle}`);
          
          // Spawn new opencode instance for the worktree
          // This opens in a new Desktop window/tab
          try {
            await log("Spawning opencode CLI...");
            
            // Use Bun.spawn() for proper background process
            const proc = Bun.spawn(["opencode", worktreePath], {
              detached: true,
              stdio: ["ignore", "ignore", "ignore"]
            });
            
            // Don't await - let it run in background
            await log(`✅ opencode spawned with PID: ${proc.pid}`, "success");
            console.log(`[auto-session] ✅ Opening worktree in new session: ${worktreePath}`);
            
          } catch (e) {
            await log(`Failed to spawn opencode: ${e.message}`, "error");
            console.log(`[auto-session] ⚠️  Manual: opencode ${worktreePath}`);
          }
        }
        return;
      }
      
      return;
    },
  };
}
