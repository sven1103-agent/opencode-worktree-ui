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
    // Common ports Desktop might use (based on observed behavior)
    const ports = [50132, 50329, 4096, 8080, 3000, 5000, 50133, 50134];
    
    for (const port of ports) {
      try {
        // Quick fetch with short timeout
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
    
    // Test the connection
    const health = await client.global.health();
    await log(`Connected to Desktop server: ${health.data.version}`);
    
    return client;
  } catch (e) {
    await log(`Failed to connect to Desktop: ${e.message}`, "error");
    return null;
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

  // Return the hook handlers (always return hooks, they check for client when firing)
  return {
      // Hook: Fires after any tool executes
      "tool.execute.after": async (input, output, hookContext) => {
        await log(`Hook fired for tool: ${input?.tool || 'unknown'}`);
        await log(`Input: ${JSON.stringify(input)}`);
        await log(`Output type: ${typeof output}`);
        await log(`Output: ${JSON.stringify(output)?.slice(0, 200)}`);

        // Check if our target tool ran successfully
        if (input?.tool !== "worktree-prepare") {
          return;
        }

        await log(`Detected worktree-prepare execution`);
        
        // Create a Desktop-connected client for session visibility
        let desktopClient = null;
        try {
          desktopClient = await createDesktopClient();
          if (desktopClient) {
            await log("Using Desktop-connected SDK client");
          }
        } catch (e) {
          await log(`Failed to create Desktop client: ${e.message}`, "warn");
        }
        
        // Get client from: Desktop client > hook context > stored context
        const hookClient = desktopClient || hookContext?.client || client;
        const hookSessionID = hookContext?.sessionID || sessionID;

        // Parse the tool output JSON
        let result;
        try {
          const rawOutput = output.result;
          await log(`Raw output: ${rawOutput?.substring(0, 100)}`);

          if (!rawOutput) {
            await log("No output from tool", "error");
            return;
          }

          // Handle both string and object output
          const outputStr = typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput);
          result = JSON.parse(outputStr);

          await log(`Parsed result: ${JSON.stringify(result)?.substring(0, 200)}`);
        } catch (parseError) {
          await log(`Failed to parse tool output: ${parseError.message}`, "error");
          console.error("[auto-session] Failed to parse worktree-prepare output:", parseError.message);
          return;
        }

        // Validate the result (success or already_exists are both valid)
        if (result.status !== "success" && result.status !== "already_exists") {
          await log(`Tool did not succeed, skipping session creation: ${result.status}`, "warn");
          return;
        }

        await log(`Worktree created successfully, creating session...`);

        // Extract session info from result
        const {
          worktreePath,
          branchName,
          issue,
          baseBranch,
          baseCommit,
          fallback,
        } = result;

        const issueNum = issue?.number || "unknown";
        const issueTitle = issue?.title || branchName || "Worktree Session";
        const issueUrl = issue?.url || "";

        // Build issue context for the new session
        const issueContext = [
          `## GitHub Issue Context`,
          ``,
          `**Issue #${issueNum}:** ${issueTitle}`,
          `**URL:** ${issueUrl}`,
          ``,
          `**Branch:** ${branchName}`,
          `**Base Branch:** ${baseBranch}`,
          `**Worktree Path:** ${worktreePath}`,
          ``,
          issue?.body ? `### Description\n${issue.body}` : "",
        ].filter(Boolean).join("\n");

        // Create the child session using SDK
        try {
          if (!hookClient) {
            await log("SDK client not available - cannot auto-create session", "error");
            console.log("[auto-session] ⚠️  SDK not available, manual session creation required");
            return;
          }
          
          await log(`Creating session in: ${worktreePath}`);

          const childSession = await hookClient.session.create({
            query: { directory: worktreePath },
            body: {
              parentID: hookSessionID,
              title: `Issue #${issueNum}: ${issueTitle}`,
            },
          });

          await log(`Session created successfully: ${childSession.id}`, "success");
          console.log(`[auto-session] ✅ Created session: ${childSession.id} in ${worktreePath}`);

          // Add initial context prompt to the session
          try {
            await hookClient.session.prompt({
              path: { id: childSession.id },
              body: {
                parts: [{ type: "text", text: issueContext }],
              },
            });
            await log(`Context prompt sent to session`, "success");
          } catch (promptError) {
            await log(`Failed to send context prompt: ${promptError.message}`, "error");
            console.error("[auto-session] Failed to send context prompt:", promptError.message);
          }

        } catch (sdkError) {
          await log(`SDK session creation failed: ${sdkError.message}`, "error");
          console.error("[auto-session] Failed to create session:", sdkError.message);
          console.log("[auto-session] Manual fallback:");
          if (fallback) {
            console.log(`  ${fallback}`);
          }
        }
      },

      // Tool definition: session-status (for diagnostics)
      session_status: tool({
        description: "Check if auto-session plugin is loaded and working",
        args: {},
        async execute(args, context) {
          await log(`Session status check requested`);
          return JSON.stringify({
            status: "loaded",
            plugin: "auto-session",
            version: "1.0.0",
            sessionID: context.sessionID,
            directory: context.directory,
          });
        },
      }),
  };
}
