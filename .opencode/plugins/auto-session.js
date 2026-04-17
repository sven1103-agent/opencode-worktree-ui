import { tool } from "@opencode-ai/plugin";
import { createOpencodeClient } from "@opencode-ai/sdk";
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

// Try to find OpenCode Desktop server port
async function findDesktopPort() {
  try {
    const ports = [50132, 50329, 4096, 8080, 3000, 5000, 50133, 50134];
    
    for (const port of ports) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300);
        
        const response = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: controller.signal
        });
        clearTimeout(timeout);
        
        if (response.ok) {
          await log(`Found OpenCode server on port ${port}`);
          return port;
        }
      } catch {
        // Port not responding, try next
      }
    }
  } catch (e) {
    await log(`Error finding port: ${e.message}`, "error");
  }
  return null;
}

// Create SDK client connected to Desktop
async function createDesktopClient() {
  const port = await findDesktopPort();
  if (!port) {
    await log("Could not find Desktop server port", "error");
    return null;
  }
  
  const baseUrl = `http://127.0.0.1:${port}`;
  await log(`Creating SDK client for ${baseUrl}`);
  
  try {
    const client = createOpencodeClient({ baseUrl });
    const health = await client.global.health();
    await log(`Connected to Desktop server: ${health.data.version}`);
    return client;
  } catch (e) {
    await log(`Failed to connect to Desktop: ${e.message}`, "error");
    return null;
  }
}

// Helper function to create session for worktree
async function createSessionForWorktree(worktreePath, issueNum, issueTitle, hookContext, client, sessionID) {
  await log(`Creating session for worktree: ${worktreePath}`);
  
  // Create Desktop-connected client
  let desktopClient = null;
  try {
    desktopClient = await createDesktopClient();
  } catch (e) {
    await log(`Could not create Desktop client: ${e.message}`, "warn");
  }
  
  const hookClient = desktopClient || hookContext?.client || client;
  const hookSessionID = hookContext?.sessionID || sessionID;

  if (!hookClient) {
    await log("No client available for session creation", "error");
    console.log(`[auto-session] ⚠️  Manual session creation required: opencode ${worktreePath}`);
    return;
  }

  try {
    const childSession = await hookClient.session.create({
      query: { directory: worktreePath },
      body: {
        parentID: hookSessionID,
        title: `Issue #${issueNum || 'unknown'}: ${issueTitle || 'Worktree Session'}`,
      },
    });

    await log(`Session created: ${childSession.id}`, "success");
    console.log(`[auto-session] ✅ Created session: ${childSession.id}`);

    // Send context
    try {
      await hookClient.session.prompt({
        path: { id: childSession.id },
        body: {
          parts: [{ 
            type: "text", 
            text: `## GitHub Issue #${issueNum || 'unknown'}\n\n**${issueTitle || 'Worktree Session'}**\n\nWorktree: ${worktreePath}` 
          }],
        },
      });
      await log(`Context sent to session`, "success");
    } catch (promptError) {
      await log(`Failed to send context: ${promptError.message}`, "error");
    }

  } catch (sdkError) {
    await log(`Session creation failed: ${sdkError.message}`, "error");
    console.log(`[auto-session] ⚠️  Manual session: opencode ${worktreePath}`);
  }
}

export default async function autoSessionPlugin(args, context) {
  // Store context values if available
  const client = context?.client;
  const directory = context?.directory;
  const sessionID = context?.sessionID;

  await log(`=== AUTO-SESSION PLUGIN INITIALIZED ===`);
  await log(`Session ID: ${sessionID || 'not available'}`);
  await log(`Directory: ${directory || 'not available'}`);
  await log(`Client available: ${!!client}`);

  // Return the hook handlers
  return {
    // Hook: Fires after any tool executes
    "tool.execute.after": async (input, output, hookContext) => {
      await log(`Hook fired for tool: ${input?.tool || 'unknown'}`);

      // Check if this is a worktree trigger from bash tool
      if (input.tool === "bash") {
        const bashOutput = output?.metadata?.output || output?.output || "";
        const worktreeMatch = bashOutput.match(/WORKTREE:([^:]+):([^:]+):(.*)/);
        
        if (worktreeMatch) {
          await log(`Detected WORKTREE trigger from bash`);
          
          const worktreePath = worktreeMatch[1];
          const issueNum = worktreeMatch[2];
          const issueTitle = worktreeMatch[3];
          
          await log(`Worktree: ${worktreePath}, Issue: #${issueNum} ${issueTitle}`);
          
          // Create session
          await createSessionForWorktree(worktreePath, issueNum, issueTitle, hookContext, client, sessionID);
        }
        return;
      }
      
      // Also check worktree-prepare output (hooks may not fire for custom tools)
      if (input.tool === "worktree-prepare") {
        await log(`Detected worktree-prepare execution`);
        
        let result;
        try {
          const rawOutput = output?.output;
          if (rawOutput) {
            const outputStr = typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput);
            result = JSON.parse(outputStr);
            
            if (result.status === "success" || result.status === "already_exists") {
              await log(`Parsed worktree from tool: ${result.worktreePath}`);
              await createSessionForWorktree(
                result.worktreePath, 
                result.issue?.number, 
                result.issue?.title,
                hookContext,
                client,
                sessionID
              );
            }
          }
        } catch (e) {
          await log(`Could not parse worktree output: ${e.message}`, "warn");
        }
        return;
      }
      
      // Not a tool we care about
      return;
    },
  };
}
