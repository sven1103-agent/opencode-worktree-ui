import { tool } from "@opencode-ai/plugin";

import { createWorkflowService } from "./workflow.js";
import { parseGitHubUrl } from "./github.js";

const PLUGIN_ID = "@sven1103/opencode-worktree-ui";

function extractGitHubUrl(text) {
  const githubUrlPattern =
    /https?:\/\/github\.com\/[^\/]+\/[^\/]+\/(?:issues|pull)\/\d+/g;
  const match = text.match(githubUrlPattern);
  return match ? match[0] : null;
}

export const WorktreeUiPlugin = async ({ client, directory, $, sessionID }) => {
  const service = createWorkflowService({
    directory,
    $,
    client,
    sessionID,
  });

  let currentWorkflow = null;

  async function onToolExecuteBefore(input, output) {
    const toolName = input?.tool;
    const args = output?.args || {};

    if (toolName === "issue_workflow_confirm" && sessionID) {
      const confirmedBranch = args.branchName || currentWorkflow?.branch.name;
      if (!currentWorkflow) {
        throw new Error("No workflow in progress. Start with /issue-workflow <url>");
      }

      try {
        const result = await service.confirmAndExecute(currentWorkflow, confirmedBranch);
        if (!result.success) {
          output.output = result.message;
          return;
        }

        output.output = result.message;

        const config = currentWorkflow.config;
        if (config.autoStart) {
          await service.startAgent(result.childSessionId, currentWorkflow.issue);
        }
      } catch (error) {
        throw new Error(`Workflow failed: ${error.message}`);
      }
    }
  }

  return {
    "tool.execute.before": onToolExecuteBefore,
    tool: {
      issue_workflow_start: tool({
        description: "Start an interactive issue workflow - parses GitHub issue and creates worktree-based session",
        args: {
          url: tool.schema.string().describe("GitHub issue URL (e.g., https://github.com/owner/repo/issues/123)"),
          branchName: tool.schema.string().optional().describe("Optional custom branch name"),
        },
        async execute(args, context) {
          const url = args.url;
          if (!url) {
            return "Please provide a GitHub issue URL. Usage: /issue-workflow <url>";
          }

          const parsed = parseGitHubUrl(url);
          if (!parsed || !parsed.issueNum) {
            return "Invalid GitHub issue URL. Expected format: https://github.com/owner/repo/issues/123";
          }

          try {
            const result = await service.startWorkflow(url, {
              customBranchName: args.branchName,
            });

            currentWorkflow = result;

            const config = await import("./config.js").then((m) =>
              m.loadWorkflowConfig(context.directory)
            );

            let fullConfig = config;
            if (typeof config.then === "function") {
              fullConfig = await config;
            }

            const msg = [
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
              `📋 Issue #${parsed.issueNum}: ${result.issue.title}`,
              ``,
              `🌿 Branch: ${result.branch.name}`,
              `📍 Base: ${result.branch.base}`,
              `🔧 Worktree: ${result.worktree.path}`,
              `🏷️ Labels: ${result.issue.labels.join(", ") || "none"}`,
              ``,
            ];

            if (fullConfig.autoStart) {
              msg.push(`⚡ Auto-start enabled - will begin work automatically`);
            } else {
              msg.push(`Type "yes" or provide a different branch name to confirm.`);
            }

            msg.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

            context.metadata({
              metadata: {
                workflow: {
                  issueUrl: url,
                  issueNum: parsed.issueNum,
                  branchName: result.branch.name,
                  worktreePath: result.worktree.path,
                },
              },
            });

            return msg.join("\n");
          } catch (error) {
            return `Error: ${error.message}`;
          }
        },
      }),
      issue_workflow_confirm: tool({
        description: "Confirm the issue workflow and create worktree + session",
        args: {
          branchName: tool.schema.string().optional().describe("Branch name (uses suggested if not provided)"),
        },
        async execute(args, context) {
          if (!currentWorkflow) {
            return "No workflow in progress. Start with issue_workflow_start first.";
          }

          try {
            const result = await service.confirmAndExecute(
              currentWorkflow,
              args.branchName
            );

            if (!result.success) {
              return result.message;
            }

            const config = currentWorkflow.config;
            if (config.autoStart) {
              await service.startAgent(result.childSessionId, currentWorkflow.issue);
              return `${result.message}\n\n🔄 Agent started in child session`;
            }

            return result.message;
          } catch (error) {
            return `Error: ${error.message}`;
          }
        },
      }),
      issue_workflow_status: tool({
        description: "Check current workflow status",
        args: {},
        async execute(args, context) {
          if (!currentWorkflow) {
            return "No active workflow. Use issue_workflow_start to begin.";
          }

          return [
            `Active Workflow:`,
            `- Issue: ${currentWorkflow.issue.title}`,
            `- Branch: ${currentWorkflow.branch.name}`,
            `- Worktree: ${currentWorkflow.worktree.path}`,
            `- Auto-start: ${currentWorkflow.config.autoStart}`,
          ].join("\n");
        },
      }),
    },
  };
};

const plugin = {
  id: PLUGIN_ID,
  server: WorktreeUiPlugin,
};

export default plugin;
