import { tool } from "@opencode-ai/plugin";
import path from "path";

export default tool({
  description: "Create a synced git worktree from a descriptive title",
  args: {
    title: tool.schema.string().describe("Descriptive title for the worktree/branch"),
  },
  async execute(args, context) {
    const { directory, worktree } = context;
    const title = args.title;
    
    // Generate branch name from title
    const branchName = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 50);
    
    // Find repo root
    let repoRoot = directory;
    try {
      repoRoot = (await Bun.$`git rev-parse --show-toplevel`.cwd(directory).text()).trim();
    } catch {
      return "Error: Not in a git repository";
    }
    
    const worktreePath = path.join(repoRoot, ".worktrees", branchName);
    
    // Get base branch
    let baseBranch = "main";
    try {
      const ref = await Bun.$`git symbolic-ref --short HEAD`.cwd(repoRoot).text();
      baseBranch = ref.trim();
    } catch {
      // Use default
    }
    
    // Create worktree
    try {
      await Bun.$`git fetch --all --quiet`.cwd(repoRoot);
      await Bun.$`git worktree add -b ${branchName} ${worktreePath} ${baseBranch}`.cwd(repoRoot);
    } catch (error) {
      const errorMsg = String(error);
      if (errorMsg.includes("already exists")) {
        return `Worktree already exists at: ${worktreePath}`;
      }
      throw error;
    }
    
    // Get base commit info
    const baseCommit = (await Bun.$`git rev-parse ${baseBranch}`.cwd(repoRoot).text()).trim().substring(0, 7);
    
    return [
      `branchName: ${branchName}`,
      `worktreePath: ${worktreePath}`,
      `defaultBranch: ${baseBranch}`,
      `baseBranch: ${baseBranch}`,
      `baseRef: ${baseBranch}`,
      `baseCommit: ${baseCommit}`,
    ].join("\n");
  },
});
