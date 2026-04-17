import { $ } from "bun";

const GITHUB_URL_PATTERN =
  /github\.com[\/:]([^\/]+)\/([^\/]+)(?:\/issues|\/pull|\/pull\/)?(\d+)?/;

export function parseGitHubUrl(url) {
  const match = url.match(GITHUB_URL_PATTERN);
  if (!match) {
    return null;
  }
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, ""),
    issueNum: match[3] ? parseInt(match[3], 10) : null,
  };
}

export async function fetchIssueDetails(owner, repo, issueNum, options = {}) {
  const { $$, allowFailure = false } = options;

  const cmd = $$.command ?? $;
  const cwd = $$.cwd ? { cwd: $$.cwd } : {};

  try {
    const result = await cmd`gh issue view ${issueNum} --repo ${owner}/${repo} --json title,body,labels,state,assignees ${cwd}`.nothrow();

    if (result.exitCode !== 0) {
      if (allowFailure) {
        return null;
      }
      throw new Error(`Failed to fetch issue #${issueNum}: ${result.stderr || result.stdout}`);
    }

    const data = JSON.parse(result.stdout);
    return {
      title: data.title,
      body: data.body,
      labels: data.labels || [],
      state: data.state,
      assignees: data.assignees || [],
      url: `https://github.com/${owner}/${repo}/issues/${issueNum}`,
    };
  } catch (error) {
    if (allowFailure) {
      return null;
    }
    throw error;
  }
}

export async function checkGhAuthenticated() {
  try {
    const result = await $`gh auth status`.nothrow();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function getDefaultBranch(owner, repo, options = {}) {
  const { $$, allowFailure = false } = options;
  const cmd = $$.command ?? $;
  const cwd = $$.cwd ? { cwd: $$.cwd } : {};

  try {
    const result = await cmd`gh repo view ${owner}/${repo} --json defaultBranchRef ${cwd}`.nothrow();

    if (result.exitCode !== 0) {
      if (allowFailure) {
        return "main";
      }
      throw new Error(`Failed to get default branch: ${result.stderr}`);
    }

    const data = JSON.parse(result.stdout);
    return data.defaultBranchRef?.name || "main";
  } catch {
    return "main";
  }
}

export async function getRemoteUrl(repoRoot) {
  const result = await $`git remote get-url origin`.cwd(repoRoot).nothrow();
  if (result.exitCode !== 0) {
    return null;
  }
  return result.stdout.trim();
}
