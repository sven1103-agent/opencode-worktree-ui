import { tool } from "@opencode-ai/plugin";
import path from "path";

export default tool({
  description: "Create a new git worktree and open a session in it",
  args: {
    branchName: tool.schema.string().describe("Name for the new branch/worktree"),
    baseBranch: tool.schema.string().optional().describe("Base branch to create from (default: main)"),
  },
  async execute(args, context) {
    const { directory } = context;
    
    const branchName = args.branchName;
    const baseBranch = args.baseBranch || "main";
    
    // Find repo root
    let repoRoot = directory;
    try {
      repoRoot = (await Bun.$`git rev-parse --show-toplevel`.cwd(directory).text()).trim();
    } catch {
      return "Error: Not in a git repository";
    }
    
    const worktreePath = path.join(repoRoot, ".worktrees", branchName.replace(/\//g, "-"));
    
    // Create worktree
    try {
      await Bun.$`git worktree add -b ${branchName} ${worktreePath} ${baseBranch}`.cwd(repoRoot);
    } catch (error) {
      const errorMsg = String(error);
      if (errorMsg.includes("already exists")) {
        return `Worktree already exists at: ${worktreePath}`;
      }
      throw error;
    }
    
    // Create a new session in the worktree
    // Note: This requires the SDK client which isn't available in custom tools
    // We'll return instructions instead
    
    return [
      `✅ Created worktree at: ${worktreePath}`,
      `Branch: ${branchName}`,
      `Base: ${baseBranch}`,
      ``,
      `Note: To open a session in this worktree, use:`,
      `  opencode ${worktreePath}`,
    ].join("\n");
  },
});
