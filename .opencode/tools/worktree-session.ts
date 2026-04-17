import { tool } from "@opencode-ai/plugin";
import path from "path";

export default tool({
  description: "Create a new git worktree and auto-switch current session to it",
  args: {
    branchName: tool.schema.string().describe("Name for the new branch/worktree"),
    baseBranch: tool.schema.string().optional().describe("Base branch to create from (default: main)"),
  },
  async execute(args, context) {
    const { directory, sessionID } = context;
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
        // Worktree exists, that's ok, we'll still try to switch
      } else {
        throw error;
      }
    }
    
    // NOW: Try to auto-switch current session to worktree
    const password = process.env.OPENCODE_SERVER_PASSWORD;
    
    if (!password) {
      return [
        `✅ Worktree created`,
        `Branch: ${branchName}`,
        `Path: ${worktreePath}`,
        ``,
        `⚠️ Auto-switch not available (no auth)`,
        `👉 Manual: cd ${worktreePath}`,
      ].join("\n");
    }
    
    if (!sessionID) {
      return [
        `✅ Worktree created`,
        `Branch: ${branchName}`,
        `Path: ${worktreePath}`,
        ``,
        `⚠️ Auto-switch not available (no sessionID)`,
        `👉 Manual: cd ${worktreePath}`,
      ].join("\n");
    }
    
    // Find server port and switch session
    try {
      // Get port from lsof
      const portResult = await Bun.$`lsof -i TCP -P 2>/dev/null | grep opencode | grep LISTEN | head -1 | grep -o ':\\d*' | sed 's/://'`.nothrow().text();
      const port = parseInt(portResult.trim(), 10);
      
      if (!port || isNaN(port)) {
        return [
          `✅ Worktree created`,
          `Branch: ${branchName}`,
          `Path: ${worktreePath}`,
          ``,
          `⚠️ Auto-switch not available (port detection failed: ${portResult})`,
          `👉 Manual: cd ${worktreePath}`,
        ].join("\n");
      }
      
      const auth = Buffer.from(`opencode:${password}`).toString('base64');
      
      // Update session directory
      const response = await fetch(`http://127.0.0.1:${port}/session/${sessionID}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          directory: worktreePath,
          title: `Worktree: ${branchName}`,
        }),
      });
      
      if (response.ok) {
        // Send context message
        await fetch(`http://127.0.0.1:${port}/session/${sessionID}/prompt`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            noReply: true,
            parts: [{ 
              type: 'text', 
              text: `## Worktree Session\n\nNow working in: ${worktreePath}\n\nBranch: ${branchName}` 
            }],
          }),
        });
        
        return [
          `✅ Worktree created`,
          `✅ Session switched`,
          `Branch: ${branchName}`,
          `Path: ${worktreePath}`,
        ].join("\n");
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
      
    } catch (e) {
      return [
        `✅ Worktree created`,
        `Branch: ${branchName}`,
        `Path: ${worktreePath}`,
        ``,
        `⚠️ Auto-switch failed: ${e.message}`,
        `👉 Manual: cd ${worktreePath}`,
      ].join("\n");
    }
  },
});
