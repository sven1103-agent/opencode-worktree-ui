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

// Create SDK client from serverUrl
async function createClientFromContext(context) {
  const serverUrl = context?.serverUrl;
  
  if (!serverUrl) {
    await log("No serverUrl in context", "error");
    return null;
  }
  
  const baseUrl = serverUrl.toString();
  await log(`Creating SDK client for ${baseUrl}`);
  
  try {
    const client = createOpencodeClient({ baseUrl });
    await log("SDK client created successfully");
    return client;
  } catch (e) {
    await log(`Failed to create SDK client: ${e.message}`, "error");
    return null;
  }
}

// Helper to create session for worktree
async function createSessionForWorktree(worktreePath, issueNum, issueTitle, context) {
  await log(`Creating session for worktree: ${worktreePath}`);
  
  // Create client from context's serverUrl
  const sdkClient = await createClientFromContext(context);
  
  if (!sdkClient) {
    await log("No SDK client available", "error");
    console.log(`[auto-session] ⚠️  Manual session creation: opencode ${worktreePath}`);
    return;
  }

  const sessionID = context?.sessionID;

  try {
    const childSession = await sdkClient.session.create({
      query: { directory: worktreePath },
      body: {
        parentID: sessionID,
        title: `Issue #${issueNum || 'unknown'}: ${issueTitle || 'Worktree Session'}`,
      },
    });

    await log(`✅ Session created: ${childSession.data?.id || childSession.id}`, "success");
    console.log(`[auto-session] ✅ Created session: ${childSession.data?.id || childSession.id}`);

    // Send context to new session
    try {
      await sdkClient.session.prompt({
        path: { id: childSession.data?.id || childSession.id },
        body: {
          parts: [{ 
            type: "text", 
            text: `## GitHub Issue #${issueNum || 'unknown'}\n\n**${issueTitle || 'Worktree Session'}**\n\nWorktree: ${worktreePath}\n\nReady to work on this issue!` 
          }],
        },
      });
      await log("Context sent to session", "success");
    } catch (promptError) {
      await log(`Failed to send context: ${promptError.message}`, "error");
    }

  } catch (sdkError) {
    await log(`Session creation failed: ${sdkError.message}`, "error");
    console.log(`[auto-session] ⚠️  Manual session: opencode ${worktreePath}`);
  }
}

export default async function autoSessionPlugin(args, context) {
  // Log what we have in context
  await log("=== AUTO-SESSION PLUGIN INITIALIZED ===");
  await log(`serverUrl: ${context?.serverUrl || 'NOT AVAILABLE'}`);
  await log(`sessionID: ${context?.sessionID || 'NOT AVAILABLE'}`);
  await log(`directory: ${context?.directory || 'NOT AVAILABLE'}`);

  // Return the hook handlers
  return {
    // Hook: Fires after any tool executes
    "tool.execute.after": async (input, output, hookContext) => {
      await log(`Hook fired for tool: ${input?.tool || 'unknown'}`);

      // Check for WORKTREE trigger in bash output
      if (input.tool === "bash") {
        const bashOutput = output?.metadata?.output || output?.output || "";
        const worktreeMatch = bashOutput.match(/WORKTREE:([^:]+):([^:]+):(.*)/);
        
        if (worktreeMatch) {
          await log("🎯 WORKTREE trigger detected!");
          
          const worktreePath = worktreeMatch[1];
          const issueNum = worktreeMatch[2];
          const issueTitle = worktreeMatch[3];
          
          await log(`Worktree: ${worktreePath}`);
          await log(`Issue: #${issueNum} - ${issueTitle}`);
          
          // Create session using hookContext (has serverUrl)
          await createSessionForWorktree(worktreePath, issueNum, issueTitle, hookContext);
        }
        return;
      }
      
      // Not a tool we care about
      return;
    },
  };
}
