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

// Create authenticated API client using environment variables
async function createAuthenticatedClient() {
  // Get password from environment (set by Desktop)
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password) {
    await log("OPENCODE_SERVER_PASSWORD not in environment", "error");
    return null;
  }
  
  // Create Basic Auth header
  const auth = Buffer.from(`opencode:${password}`).toString('base64');
  
  // Find server port
  const port = await findServerPort();
  if (!port) {
    await log("Could not find server port", "error");
    return null;
  }
  
  const baseUrl = `http://127.0.0.1:${port}`;
  await log(`Creating authenticated client for ${baseUrl}`);
  
  // Return API client object
  return {
    baseUrl,
    authHeader: `Basic ${auth}`,
    
    // Session update method
    async updateSession(sessionID, directory, title) {
      const response = await fetch(`${baseUrl}/session/${sessionID}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          directory,
          title,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      
      return await response.json();
    },
    
    // Session prompt method (for context)
    async sendPrompt(sessionID, text) {
      const response = await fetch(`${baseUrl}/session/${sessionID}/prompt`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          noReply: true,
          parts: [{ type: 'text', text }],
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      
      return await response.json();
    },
  };
}

// Find OpenCode server port
async function findServerPort() {
  try {
    // Try to get from process
    const result = await Bun.$`lsof -i TCP -P 2>/dev/null | grep opencode | grep LISTEN | head -1`.nothrow();
    if (result.exitCode === 0 && result.stdout) {
      const match = result.stdout.match(/:(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  } catch {
    // Fallback to common ports
    const ports = [52033, 51314, 51181, 51045, 50132, 4096];
    for (const port of ports) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300);
        const response = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (response.ok || response.status === 401) {
          return port;
        }
      } catch {
        // Continue
      }
    }
  }
  return null;
}

export default async function autoSessionPlugin(args, context) {
  await log("=== AUTO-SESSION PLUGIN INITIALIZED ===");
  await log("Using environment-based authentication");
  
  // Log env availability (don't log the actual password!)
  const hasPassword = !!process.env.OPENCODE_SERVER_PASSWORD;
  await log(`OPENCODE_SERVER_PASSWORD available: ${hasPassword}`);

  return {
    "tool.execute.after": async (input, output, hookContext) => {
      await log(`Hook fired for tool: ${input?.tool || 'unknown'}`);

      // Check for WORKTREE trigger
      if (input.tool === "bash") {
        const bashOutput = output?.metadata?.output || output?.output || "";
        await log(`Bash output: ${bashOutput?.substring(0, 100)}`);
        const worktreeMatch = bashOutput.match(/WORKTREE:(\/[^:]+):(\d+):(.+)/);
        
        if (worktreeMatch) {
          await log("🎯 WORKTREE trigger detected!");
          
          const worktreePath = worktreeMatch[1];
          const issueNum = worktreeMatch[2];
          const issueTitle = worktreeMatch[3];
          const sessionID = input?.sessionID;
          
          await log(`Worktree: ${worktreePath}`);
          await log(`Issue: #${issueNum} - ${issueTitle}`);
          await log(`Session ID: ${sessionID || 'unknown'}`);
          
          if (!sessionID) {
            await log("No sessionID available", "error");
            console.log(`[auto-session] ⚠️  Manual: cd ${worktreePath}`);
            return;
          }
          
          // Create authenticated client and update session
          try {
            await log("Creating authenticated client...");
            const client = await createAuthenticatedClient();
            
            if (!client) {
              await log("Failed to create client", "error");
              console.log(`[auto-session] ⚠️  Manual: cd ${worktreePath}`);
              return;
            }
            
            await log("Updating session...");
            await client.updateSession(
              sessionID,
              worktreePath,
              `Issue #${issueNum}: ${issueTitle}`
            );
            await log("✅ Session updated!", "success");
            
            // Send context
            await client.sendPrompt(
              sessionID,
              `## GitHub Issue #${issueNum}\n\n**${issueTitle}**\n\nNow working in worktree: ${worktreePath}`
            );
            await log("✅ Context sent!", "success");
            
            console.log(`[auto-session] ✅ Switched to worktree: ${worktreePath}`);
            
          } catch (e) {
            await log(`Failed: ${e.message}`, "error");
            console.log(`[auto-session] ⚠️  Manual: cd ${worktreePath}`);
          }
        }
        return;
      }
      
      return;
    },
  };
}
