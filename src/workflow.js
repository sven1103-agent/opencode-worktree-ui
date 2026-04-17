import fs from "node:fs/promises";
import path from "node:path";

import {
  parseGitHubUrl,
  fetchIssueDetails,
  getRemoteUrl,
  checkGhAuthenticated,
} from "./github.js";
import {
  inferPrefixFromLabels,
  generateBranchName,
  validateBranchName,
} from "./branch.js";
import { loadWorkflowConfig } from "./config.js";

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function formatConfirmationMessage({
  issueTitle,
  issueNum,
  issueUrl,
  branchName,
  baseBranch,
  worktreePath,
  labels,
}) {
  const labelStr = labels.length > 0 ? labels.join(", ") : "none";
  return [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📋 Issue #${issueNum}: ${issueTitle}`,
    ``,
    `🌿 Branch: ${branchName}`,
    `📍 Base: ${baseBranch}`,
    `🔧 Worktree: ${worktreePath}`,
    `🏷️ Labels: ${labelStr}`,
    ``,
    `Type "yes" to confirm or provide a different branch name.`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  ].join("\n");
}

function createGitRunner($, directory) {
  return async function git(args, options = {}) {
    const cwd = options.cwd ?? directory;
    const command = `git ${args.map((arg) => $.escape(String(arg))).join(" ")}`;
    const result = await $`${{ raw: command }}`.cwd(cwd).quiet().nothrow();
    const stdout = result.text().trim();
    const stderr = result.stderr.toString("utf8").trim();
    if (!options.allowFailure && result.exitCode !== 0) {
      throw new Error(stderr || stdout || `Git command failed: ${command}`);
    }
    return { stdout, stderr, exitCode: result.exitCode };
  };
}

export function createWorkflowService({ directory, $, client, sessionID }) {
  async function getRepoRoot() {
    const git = createGitRunner($, directory);
    try {
      return (await git(["rev-parse", "--show-toplevel"])).stdout;
    } catch (error) {
      throw new Error(
        "This command must run inside a git repository. Initialize a repository first or run it from an existing repo root."
      );
    }
  }

  async function startWorkflow(issueUrl, options = {}) {
    const { customBranchName, autoStart } = options;
    const repoRoot = await getRepoRoot();
    const config = await loadWorkflowConfig(repoRoot);
    const git = createGitRunner($, repoRoot);

    const parsed = parseGitHubUrl(issueUrl);
    if (!parsed || !parsed.issueNum) {
      throw new Error("Invalid GitHub issue URL. Expected: https://github.com/owner/repo/issues/123");
    }

    const { owner, repo, issueNum } = parsed;

    let issueData = null;
    const isGhAuth = await checkGhAuthenticated();
    if (isGhAuth) {
      try {
        issueData = await fetchIssueDetails(owner, repo, issueNum, { $ });
      } catch (error) {
        console.warn("Failed to fetch issue details:", error.message);
      }
    }

    if (!issueData) {
      issueData = {
        title: `Issue #${issueNum}`,
        body: "(Issue details unavailable - GitHub CLI not authenticated or issue not found)",
        labels: [],
        state: "OPEN",
        assignees: [],
        url: issueUrl,
      };
    }

    const prefix = inferPrefixFromLabels(issueData.labels, config.branchPrefix);
    const branchName =
      customBranchName ||
      generateBranchName(issueData.title, issueNum, prefix);

    const validation = validateBranchName(branchName);
    if (!validation.valid) {
      throw new Error(`Invalid branch name: ${validation.reason}`);
    }

    let baseBranch = config.baseBranch;
    try {
      const remoteRef = await git([
        "rev-parse",
        "--abbrev-ref",
        `${config.baseBranch}@{upstream}`,
      ]);
      baseBranch = remoteRef.stdout || config.baseBranch;
    } catch {
      try {
        const result = await git(["symbolic-ref", "--short", "HEAD"]);
        baseBranch = result.stdout || config.baseBranch;
      } catch {
        baseBranch = config.baseBranch;
      }
    }

    const worktreePath = path.join(
      config.worktreeRoot,
      branchName.replace(/\//g, "-")
    );

    const result = {
      issue: issueData,
      branch: {
        name: branchName,
        base: baseBranch,
      },
      worktree: {
        path: worktreePath,
        exists: await pathExists(worktreePath),
      },
      config,
      requiresConfirmation: !config.autoStart,
    };

    return result;
  }

  async function confirmAndExecute(workflowResult, confirmedBranchName = null) {
    const repoRoot = await getRepoRoot();
    const config = await loadWorkflowConfig(repoRoot);
    const git = createGitRunner($, repoRoot);

    const branchName = confirmedBranchName || workflowResult.branch.name;
    const worktreePath = workflowResult.worktree.path;

    if (workflowResult.worktree.exists) {
      return {
        success: false,
        message: `Worktree already exists at: ${worktreePath}`,
        worktreePath,
        branchName,
      };
    }

    await fs.mkdir(config.worktreeRoot, { recursive: true });

    const baseRef = workflowResult.branch.base;
    const createResult = await git([
      "worktree",
      "add",
      "-b",
      branchName,
      worktreePath,
      baseRef,
    ]);

    if (createResult.exitCode !== 0) {
      throw new Error(
        `Failed to create worktree: ${createResult.stderr || createResult.stdout}`
      );
    }

    const childSession = await client.session.create({
      query: { directory: worktreePath },
      body: {
        parentID: sessionID,
        title: `Issue #${workflowResult.issue.url.split("/").pop()}: ${workflowResult.issue.title}`,
      },
    });

    return {
      success: true,
      worktreePath,
      branchName,
      childSessionId: childSession.id,
      message: `✅ Worktree created at ${worktreePath}\n✅ Child session created: ${childSession.id}`,
    };
  }

  async function startAgent(childSessionId, issueData) {
    const prompt = `Work on GitHub issue:\n\nTitle: ${issueData.title}\n\nURL: ${issueData.url}\n\nDescription:\n${issueData.body}\n\nPlease analyze the issue and implement the required changes.`;

    await client.session.prompt({
      path: { id: childSessionId },
      body: {
        parts: [{ type: "text", text: prompt }],
      },
    });

    return {
      started: true,
      message: "🔄 Agent started in child session",
    };
  }

  return {
    startWorkflow,
    confirmAndExecute,
    startAgent,
    getRepoRoot,
  };
}
