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

export default async function autoSessionPlugin(context) {
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

      let worktreePath = null;
      let issueNum = null;
      let issueTitle = null;

      // Check for worktree-prepare tool
      if (input.tool === "worktree-prepare") {
        await log("Detected worktree-prepare tool execution");
        try {
          const result = output?.metadata?.output || output?.output || "";
          const parsed = JSON.parse(result);
          if (parsed.status === "success" || parsed.status === "already_exists") {
            worktreePath = parsed.worktreePath;
            issueNum = parsed.issue?.number || "0";
            issueTitle = parsed.issue?.title || "Worktree";
            await log(`Parsed worktree: ${worktreePath}`);
          }
        } catch (e) {
          await log(`Failed to parse worktree-prepare output: ${e.message}`, "error");
        }
      }
      // Check for WORKTREE trigger in bash
      else if (input.tool === "bash") {
        const bashOutput = output?.metadata?.output || output?.output || "";
        await log(`Bash output: ${bashOutput.substring(0, 100)}`);

        const match = bashOutput.match(/WORKTREE:(\/[^:]+):(\d+):(.+)/);
        if (match) {
          worktreePath = match[1];
          issueNum = match[2];
          issueTitle = match[3];
        }
      }

      if (!worktreePath) return;

      await log("🎯 WORKTREE detected!");
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
