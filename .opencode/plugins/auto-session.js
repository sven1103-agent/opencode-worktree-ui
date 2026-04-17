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
  // Log ALL properties from PluginInput
  await log("=== PLUGIN INITIALIZED ===");
  await log(`All context keys: ${Object.keys(context || {}).join(", ")}`);
  await log(`serverUrl: ${context?.serverUrl || "NOT FOUND"}`);
  await log(`directory: ${context?.directory || "NOT FOUND"}`);
  await log(`sessionID from context: ${context?.sessionID || "NOT FOUND"}`);
  await log(`has client: ${!!context?.client}`);
  await log(`has $ (BunShell): ${!!context?.$}`);
  await log(`has project: ${!!context?.project}`);

  return {
    "tool.execute.after": async (input, output, hookContext) => {
      await log(`Hook fired: ${input.tool}`);
      await log(`Input sessionID: ${input.sessionID || "NOT FOUND"}`);

      // Check for WORKTREE trigger
      if (input.tool !== "bash") return;

      const bashOutput = output?.metadata?.output || output?.output || "";
      await log(`Bash output: ${bashOutput.substring(0, 100)}`);

      const match = bashOutput.match(/WORKTREE:(\/[^:]+):(\d+):(.+)/);
      if (!match) return;

      await log("🎯 WORKTREE detected!");
      const worktreePath = match[1];
      const issueNum = match[2];
      const issueTitle = match[3];
      const sessionID = input.sessionID;

      await log(`Path: ${worktreePath}`);
      await log(`Session: ${sessionID || "NOT FOUND"}`);

      if (!sessionID) {
        await log("No sessionID - cannot update", "error");
        return;
      }

      // Try to update session using serverUrl
      const serverUrl = context?.serverUrl;
      if (!serverUrl) {
        await log("No serverUrl in context", "error");
        console.log(`[auto-session] Manual: cd ${worktreePath}`);
        return;
      }

      try {
        await log(`Using serverUrl: ${serverUrl}`);

        // Get password from environment
        const password = process.env.OPENCODE_SERVER_PASSWORD;
        if (!password) {
          await log("No OPENCODE_SERVER_PASSWORD", "error");
          return;
        }

        const auth = Buffer.from(`opencode:${password}`).toString("base64");

        // Update session via REST API
        const response = await fetch(`${serverUrl}/session/${sessionID}`, {
          method: "PUT",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            directory: worktreePath,
            title: `Issue #${issueNum}: ${issueTitle}`,
          }),
        });

        if (response.ok) {
          await log("✅ Session updated!", "success");
          console.log(`[auto-session] ✅ Switched to: ${worktreePath}`);

          // Send context
          await fetch(`${serverUrl}/session/${sessionID}/prompt`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              noReply: true,
              parts: [
                {
                  type: "text",
                  text: `## Issue #${issueNum}: ${issueTitle}\n\nWorking in: ${worktreePath}`,
                },
              ],
            }),
          });
        } else {
          await log(`HTTP ${response.status}: ${await response.text()}`, "error");
        }
      } catch (e) {
        await log(`Error: ${e.message}`, "error");
        console.log(`[auto-session] Manual: cd ${worktreePath}`);
      }
    },
  };
}
