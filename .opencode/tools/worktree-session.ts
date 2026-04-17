import { tool } from "@opencode-ai/plugin";
import path from "path";

export default tool({
  description: "Create git worktree from GitHub issue AND switch current session to it",
  args: {
    issueUrl: tool.schema.string().describe("GitHub issue URL"),
    title: tool.schema.string().optional().describe("Override issue title"),
    baseBranch: tool.schema.string().optional().describe("Base branch (default: main)"),
  },
  async execute(args, context) {
    const { directory, sessionID } = context;
    const issueUrl = args.issueUrl;
    
    // Parse GitHub URL
    const match = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
    if (!match) {
      return "Error: Invalid GitHub URL format";
    }
    
    const [, owner, repo, issueNum] = match;
    
    // Try to get issue details from gh CLI
    let issueTitle = args.title || `Issue #${issueNum}`;
    let labels = [];
    try {
      const issueData = await Bun.$`gh issue view ${issueNum} --repo ${owner}/${repo} --json title,labels`.cwd(directory).json();
      issueTitle = issueData.title;
      labels = issueData.labels?.map(l => l.name) || [];
    } catch {
      // Use defaults
    }
    
    // Generate branch name from labels
    let prefix = "fix";
    if (labels.some(l => l.match(/feature|enhancement/i))) prefix = "feat";
    if (labels.some(l => l.match(/doc/i))) prefix = "docs";
    
    const branchName = `${prefix}/${issueTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 40)}-${issueNum}`;
    
    // Find repo root
    let repoRoot = directory;
    try {
      repoRoot = (await Bun.$`git rev-parse --show-toplevel`.cwd(directory).text()).trim();
    } catch {
      return "Error: Not in a git repository";
    }
    
    const worktreePath = path.join(repoRoot, ".worktrees", branchName);
    const baseBranch = args.baseBranch || "main";
    
    // Create worktree
    try {
      await Bun.$`git fetch --all --quiet`.cwd(repoRoot);
      await Bun.$`git worktree add -b ${branchName} ${worktreePath} ${baseBranch}`.cwd(repoRoot);
    } catch (error) {
      const errorMsg = String(error);
      if (errorMsg.includes("already exists")) {
        // Worktree exists, that's ok
      } else {
        throw error;
      }
    }
    
    // NOW: Update current session to worktree using REST API with env auth
    const password = process.env.OPENCODE_SERVER_PASSWORD;
    if (password && sessionID) {
      try {
        // Find server port
        let port = null;
        try {
          const result = await Bun.$`lsof -i TCP -P 2>/dev/null | grep opencode | grep LISTEN | head -1`.nothrow();
          if (result.exitCode === 0 && result.stdout) {
            const portMatch = result.stdout.match(/:(\d+)/);
            if (portMatch) port = parseInt(portMatch[1], 10);
          }
        } catch {}
        
        if (port) {
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
              title: `Issue #${issueNum}: ${issueTitle}`,
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
                  text: `## GitHub Issue #${issueNum}\n\n**${issueTitle}**\n\nNow working in worktree: ${worktreePath}` 
                }],
              }),
            });
            
            return `✅ Created worktree and switched session\nBranch: ${branchName}\nPath: ${worktreePath}`;
          }
        }
      } catch (e) {
        // Session update failed, but worktree was created
      }
    }
    
    // Fallback: just return worktree info
    return [
      `✅ Worktree created`,
      `Branch: ${branchName}`,
      `Path: ${worktreePath}`,
      ``,
      `👉 Switch to worktree: cd ${worktreePath}`,
    ].join("\n");
  },
});
