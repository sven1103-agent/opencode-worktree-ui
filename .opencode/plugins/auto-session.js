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

export const AutoSessionPlugin = {
  async execute(args, context) {
    const { client, directory, sessionID } = context;

    await log(`=== AUTO-SESSION PLUGIN INITIALIZED ===`);
    await log(`Session ID: ${sessionID}`);
    await log(`Directory: ${directory}`);

    // Return the hook handlers
    return {
      // Hook: Fires after any tool executes
      "tool.execute.after": async (input, output) => {
        await log(`Tool executed: ${input.tool}`);

        // Check if our target tool ran successfully
        if (input.tool !== "worktree-prepare") {
          return;
        }

        await log(`Detected worktree-prepare execution`);

        // Parse the tool output JSON
        let result;
        try {
          const rawOutput = output.result;
          await log(`Raw output: ${rawOutput}`);

          // Handle both string and object output
          const outputStr = typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput);
          result = JSON.parse(outputStr);

          await log(`Parsed result: ${JSON.stringify(result)}`);
        } catch (parseError) {
          await log(`Failed to parse tool output: ${parseError.message}`, "error");
          console.error("[auto-session] Failed to parse worktree-prepare output:", parseError.message);
          return;
        }

        // Validate the result
        if (result.status !== "success") {
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
          await log(`Creating session in: ${worktreePath}`);

          const childSession = await client.session.create({
            query: { directory: worktreePath },
            body: {
              parentID: sessionID,
              title: `Issue #${issueNum}: ${issueTitle}`,
            },
          });

          await log(`Session created successfully: ${childSession.id}`, "success");
          console.log(`[auto-session] ✅ Created session: ${childSession.id} in ${worktreePath}`);

          // Add initial context prompt to the session
          try {
            await client.session.prompt({
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
  },
};
