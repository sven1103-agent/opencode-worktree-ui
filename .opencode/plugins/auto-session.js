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
  await log("Smart workflow: Update current session to worktree");

  return {
    "tool.execute.after": async (input, output, hookContext) => {
      await log(`Hook fired for tool: ${input?.tool || 'unknown'}`);

      // Check for WORKTREE trigger in bash output
      if (input.tool === "bash") {
        const bashOutput = output?.metadata?.output || output?.output || "";
        // Stricter regex: path starts with /, issueNum is digits
        const worktreeMatch = bashOutput.match(/WORKTREE:(\/[^:]+):(\d+):(.+)/);
        
        if (worktreeMatch) {
          await log("🎯 WORKTREE trigger detected!");
          
          const worktreePath = worktreeMatch[1];
          const issueNum = worktreeMatch[2];
          const issueTitle = worktreeMatch[3];
          
          await log(`Worktree: ${worktreePath}`);
          await log(`Issue: #${issueNum} - ${issueTitle}`);
          await log(`Session ID: ${input?.sessionID || 'unknown'}`);
          
          // SMART WORKFLOW: Update current session to worktree
          try {
            await log("Updating current session to worktree...");
            
            // Use hookContext which has the client
            const client = hookContext?.client;
            const sessionID = input?.sessionID || hookContext?.sessionID;
            
            if (!client || !sessionID) {
              await log("No client or sessionID available", "error");
              console.log(`[auto-session] ⚠️  Manual switch: cd ${worktreePath}`);
              return;
            }
            
            // Update session directory to worktree
            await client.session.update({
              path: { id: sessionID },
              body: {
                directory: worktreePath,
                title: `Issue #${issueNum}: ${issueTitle}`,
              },
            });
            
            await log("✅ Session updated to worktree!", "success");
            console.log(`[auto-session] ✅ Switched to worktree: ${worktreePath}`);
            
            // Send context message
            try {
              await client.session.prompt({
                path: { id: sessionID },
                body: {
                  noReply: true, // Don't trigger AI response, just set context
                  parts: [{ 
                    type: "text", 
                    text: `## GitHub Issue #${issueNum}\n\n**${issueTitle}**\n\nNow working in worktree: ${worktreePath}` 
                  }],
                },
              });
              await log("Context message sent", "success");
            } catch (e) {
              await log(`Failed to send context: ${e.message}`, "warn");
            }
            
          } catch (e) {
            await log(`Failed to update session: ${e.message}`, "error");
            console.log(`[auto-session] ⚠️  Manual: cd ${worktreePath}`);
          }
        }
        return;
      }
      
      return;
    },
  };
}
