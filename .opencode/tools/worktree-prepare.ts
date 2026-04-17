import { tool } from "@opencode-ai/plugin";
import path from "path";

// GitHub URL pattern to extract owner/repo/issueNum
const GITHUB_URL_PATTERN =
  /github\.com[:/]([^/]+)\/([^/]+)(?:\/issues\/|\/pull\/|\/pull\/)?(\d+)?/i;

function parseGitHubUrl(url: string): { owner: string; repo: string; issueNum: number | null } | null {
  if (!url) return null;
  const match = url.match(GITHUB_URL_PATTERN);
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, ""),
    issueNum: match[3] ? parseInt(match[3], 10) : null,
  };
}

// Infer branch prefix from labels
function inferPrefixFromLabels(labels: string[]): string {
  if (!Array.isArray(labels) || labels.length === 0) {
    return "fix/";
  }
  const labelNames = labels.map((l) => l.toLowerCase());
  const prefixMap: Record<string, string> = {
    bug: "fix/",
    bugfix: "fix/",
    enhancement: "feat/",
    feature: "feat/",
    documentation: "docs/",
    docs: "docs/",
    "good first issue": "fix/",
    helpwanted: "fix/",
  };
  for (const [key, prefix] of Object.entries(prefixMap)) {
    if (labelNames.some((name) => name.includes(key))) {
      return prefix;
    }
  }
  return "fix/";
}

// Generate branch name from title
function slugifyTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function generateBranchName(issueTitle: string, issueNum: number, prefix: string): string {
  const slug = slugifyTitle(issueTitle);
  const sanitized = slug.slice(0, 50);
  return `${prefix}${sanitized}-${issueNum}`;
}

interface IssueInfo {
  number: number | null;
  title: string;
  body: string;
  labels: string[];
  state: string;
  url: string;
  owner?: string;
  repo?: string;
}

export default tool({
  description: "Create a synced git worktree from a GitHub issue URL or descriptive title",
  args: {
    issueUrl: tool.schema.string().describe("GitHub issue URL (e.g., https://github.com/owner/repo/issues/123)"),
    title: tool.schema.string().optional().describe("Optional title override for branch name"),
    customBranchName: tool.schema.string().optional().describe("Optional branch name override"),
    baseBranch: tool.schema.string().optional().describe("Base branch to create worktree from (default: main)"),
  },
  async execute(args, context) {
    const { directory } = context;
    const { issueUrl, title, customBranchName, baseBranch: baseBranchOverride } = args;

    try {
      // Find repo root
      let repoRoot = directory;
      try {
        repoRoot = (await Bun.$`git rev-parse --show-toplevel`.cwd(directory).text()).trim();
      } catch {
        return JSON.stringify({
          status: "error",
          error: "Not in a git repository",
          fallback: `cd /path/to/git/repo && /work-on-issue ${issueUrl || title}`,
        });
      }

      // Determine base branch
      let baseBranch = baseBranchOverride || "main";
      try {
        const ref = await Bun.$`git symbolic-ref --short HEAD`.cwd(repoRoot).text();
        const currentBranch = ref.trim();
        // Check if current branch tracks an upstream
        try {
          await Bun.$`git rev-parse ${currentBranch}@{upstream}`.cwd(repoRoot);
          baseBranch = currentBranch;
        } catch {
          // Not tracking upstream, use main or provided
        }
      } catch {
        // Use default
      }

      // Handle GitHub URL
      let parsedIssue: IssueInfo | null = null;
      let branchName = customBranchName || "";

      if (issueUrl) {
        const parsed = parseGitHubUrl(issueUrl);
        if (!parsed || !parsed.issueNum) {
          return JSON.stringify({
            status: "error",
            error: `Invalid GitHub URL: ${issueUrl}`,
            fallback: `Manually create worktree and session for: ${issueUrl}`,
          });
        }

        const { owner, repo, issueNum } = parsed;

        // Fetch issue details via gh CLI if available
        try {
          const authCheck = await Bun.$`gh auth status`.nothrow();
          if (authCheck.exitCode === 0) {
            const ghResult = await Bun.$`
              gh issue view ${issueNum} --repo ${owner}/${repo} --json title,body,labels,state,assignees
            `.cwd(repoRoot).nothrow();

            if (ghResult.exitCode === 0) {
              const ghData = JSON.parse(ghResult.stdout);
              const labels = ghData.labels || [];
              const prefix = inferPrefixFromLabels(labels);

              parsedIssue = {
                number: issueNum,
                title: title || ghData.title,
                body: ghData.body || "",
                labels: labels.map((l: { name?: string }) => typeof l === "string" ? l : l.name || ""),
                state: ghData.state,
                url: issueUrl,
                owner,
                repo,
              };

              if (!branchName) {
                branchName = generateBranchName(parsedIssue.title, issueNum, prefix);
              }
            }
          }
        } catch {
          // gh CLI not available or failed, continue with minimal data
        }

        // If gh failed or not authenticated
        if (!parsedIssue) {
          parsedIssue = {
            number: issueNum,
            title: title || `Issue #${issueNum}`,
            body: "(Issue details unavailable - GitHub CLI not authenticated or issue not found)",
            labels: [],
            state: "OPEN",
            url: issueUrl,
            owner,
            repo,
          };

          if (!branchName) {
            branchName = `issue-${issueNum}`;
          }
        }
      } else if (title) {
        // Generate branch name from title only
        const slug = slugifyTitle(title);
        branchName = customBranchName || slug.slice(0, 50);
        parsedIssue = {
          number: null,
          title,
          body: "",
          labels: [],
          state: "OPEN",
          url: issueUrl || "",
        };
      } else {
        return JSON.stringify({
          status: "error",
          error: "Either issueUrl or title must be provided",
          fallback: "/worktree-prepare issueUrl=https://github.com/owner/repo/issues/123",
        });
      }

      // Sanitize branch name
      branchName = branchName
        .replace(/[^a-zA-Z0-9\/-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 100);

      if (!branchName) {
        return JSON.stringify({
          status: "error",
          error: "Could not generate valid branch name",
          fallback: "Manually create worktree with: git worktree add -b fix/your-branch ../worktrees/your-branch main",
        });
      }

      // Create worktree path
      const safeBranchName = branchName.replace(/\//g, "-");
      const worktreePath = path.join(repoRoot, ".worktrees", safeBranchName);

      // Check if worktree already exists
      try {
        const listOutput = await Bun.$`git worktree list --porcelain`.cwd(repoRoot).text();
        if (listOutput.includes(worktreePath)) {
          return JSON.stringify({
            status: "already_exists",
            worktreePath,
            branchName,
            issue: parsedIssue,
            baseBranch,
            fallback: `cd ${worktreePath} && opencode serve --directory ${worktreePath}`,
            message: `Worktree already exists at: ${worktreePath}`,
          });
        }
      } catch {
        // Continue with creation
      }

      // Ensure worktrees directory exists
      const worktreesDir = path.join(repoRoot, ".worktrees");
      try {
        await Bun.$`mkdir -p ${worktreesDir}`.text();
      } catch {
        // Ignore if already exists
      }

      // Create the worktree
      try {
        await Bun.$`git fetch --all --quiet`.cwd(repoRoot).nothrow();
        await Bun.$`git worktree add -b ${branchName} ${worktreePath} ${baseBranch}`.cwd(repoRoot);
      } catch (error) {
        const errorMsg = String(error);
        if (errorMsg.includes("already exists")) {
          return JSON.stringify({
            status: "already_exists",
            worktreePath,
            branchName,
            issue: parsedIssue,
            baseBranch,
            fallback: `cd ${worktreePath} && opencode serve --directory ${worktreePath}`,
            message: `Worktree already exists at: ${worktreePath}`,
          });
        }
        if (errorMsg.includes("invalid reference")) {
          return JSON.stringify({
            status: "error",
            error: `Base branch '${baseBranch}' not found. Try specifying a different base branch.`,
            fallback: `/worktree-prepare issueUrl=${issueUrl || ""} baseBranch=main`,
          });
        }
        return JSON.stringify({
          status: "error",
          error: `Failed to create worktree: ${errorMsg}`,
          fallback: `git worktree add -b ${branchName} ${worktreePath} ${baseBranch}`,
        });
      }

      // Get base commit
      let baseCommit = "";
      try {
        baseCommit = (await Bun.$`git rev-parse ${baseBranch}`.cwd(repoRoot).text()).trim().substring(0, 7);
      } catch {
        // Ignore
      }

      return JSON.stringify({
        status: "success",
        worktreePath,
        branchName,
        issue: parsedIssue,
        baseBranch,
        baseCommit,
        fallback: `cd ${worktreePath} && opencode serve --directory ${worktreePath}`,
      });

    } catch (error) {
      const errorMsg = String(error);
      return JSON.stringify({
        status: "error",
        error: errorMsg,
        fallback: `Manually create worktree and run: opencode serve --directory /path/to/worktree`,
      });
    }
  },
});
