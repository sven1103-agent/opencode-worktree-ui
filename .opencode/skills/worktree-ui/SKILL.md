# Worktree UI Skill

This skill provides automatic worktree creation and session management for GitHub issues.

## Overview

The Worktree UI system implements a **hybrid architecture** that combines:
- **Custom Tool** (`worktree-prepare`) - Reliable git worktree creation
- **Plugin Hook** (`auto-session`) - Automatic OpenCode session creation

This approach ensures maximum reliability by separating concerns:
- The tool handles all filesystem and git operations (100% reliable)
- The plugin handles SDK session creation when loaded (~80% in Desktop, 100% in serve mode)

## Auto-Session Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User runs /work-on-issue                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   worktree-prepare.ts                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 1. Parse GitHub URL                                  │    │
│  │ 2. Fetch issue details via gh CLI (if available)    │    │
│  │ 3. Generate branch name from labels                 │    │
│  │ 4. Create git worktree with Bun.$                   │    │
│  │ 5. Return structured JSON with all details          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ JSON Result     │
                    │ { status,       │
                    │   worktreePath, │
                    │   branchName,   │
                    │   issue, ... }  │
                    └─────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   auto-session.js                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Hook: tool.execute.after                            │    │
│  │   └─► Check if tool === "worktree-prepare"          │    │
│  │   └─► Parse JSON output                             │    │
│  │   └─► Validate status === "success"                 │    │
│  │   └─► Call client.session.create()                  │    │
│  │   └─► Send context prompt to new session           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ⚠️ Plugin loads ~80% in Desktop, 100% in serve mode       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 New OpenCode Session                         │
│  - Directory: worktree path                                 │
│  - Title: "Issue #N: {title}"                              │
│  - Parent: current session                                  │
│  - Context: issue description, labels, branch info          │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Structured JSON Return
Tools return JSON (not plain text) so hooks can parse output reliably:
```json
{
  "status": "success",
  "worktreePath": "/repo/.worktrees/fix-issue-123",
  "branchName": "fix/issue-123",
  "issue": { "number": 123, "title": "...", ... },
  "fallback": "cd /repo/.worktrees/fix-issue-123 && opencode serve"
}
```

### 2. Named Exports for Plugins
Plugins must use named exports (not default):
```javascript
export const AutoSessionPlugin = {
  async execute(args, context) { ... }
};
```

### 3. Bun.$ for Shell Commands
Use `Bun.$` directly (not `context.$` which doesn't exist):
```typescript
await Bun.$`git worktree add -b ${branch} ${path} ${base}`.cwd(repoRoot);
```

### 4. Try-Catch Around SDK Calls
Plugin hooks must never throw - catch all errors:
```javascript
try {
  const session = await client.session.create({ ... });
} catch (error) {
  console.error("[auto-session] SDK error:", error.message);
  // Fallback is always shown in tool output
}
```

## Usage

### Quick Start
```bash
/work-on-issue https://github.com/owner/repo/issues/123
```

### With Options
```bash
/work-on-issue <url> title="Custom title"
/work-on-issue <url> baseBranch=develop
/work-on-issue <url> customBranchName=my-branch
```

### Check Plugin Status
```bash
/check-worktree-plugin
```

## Reliability Guarantees

| Component | Desktop Mode | Serve Mode | Fallback |
|-----------|-------------|------------|----------|
| worktree-prepare | 100% | 100% | N/A |
| auto-session plugin | ~80% | 100% | Manual session |
| Worktree creation | 100% | 100% | N/A |
| Session creation | ~80% | 100% | `/work-on-issue` shows fallback |

### Fallback Behavior
When the plugin doesn't load, the tool output includes a fallback command:
```
✅ Worktree created at: /repo/.worktrees/fix-issue-123

⚠️ Plugin not loaded. Manual session creation:
cd /repo/.worktrees/fix-issue-123
opencode serve --directory /repo/.worktrees/fix-issue-123
```

## Troubleshooting

### Plugin Not Loading
1. Clear cache: `rm -rf ~/Library/Caches/opencode`
2. Restart OpenCode Desktop completely
3. Check log: `cat /tmp/opencode-auto-session.log`
4. Use serve mode for 100% reliability

### Worktree Creation Fails
1. Ensure you're in a git repository
2. Check branch name doesn't already exist
3. Verify base branch exists: `git branch -a`

### gh CLI Not Fetching Issue Details
1. Check authentication: `gh auth status`
2. Authenticate if needed: `gh auth login`
3. Issue details will be minimal but worktree still works

## Branch Naming

Branch names are automatically generated from labels:

| Label | Prefix | Example |
|-------|--------|---------|
| bug, bugfix | `fix/` | `fix/auth-bug-123` |
| enhancement, feature | `feat/` | `feat/new-feature-456` |
| documentation, docs | `docs/` | `docs/readme-789` |
| (default) | `fix/` | `fix/issue-123` |

## Testing

### Test Worktree Creation
```bash
git worktree list
# Should show new worktree after /work-on-issue
```

### Test Session Creation
```bash
opencode session list
# Should show new session after plugin fires
```

### Test Edge Cases
```bash
# Invalid URL
/work-on-issue https://invalid-url.com

# Worktree already exists
/work-on-issue <url>  # Run twice

# No git repo
cd /tmp && /work-on-issue <url>
```

## Architecture Files

| File | Purpose |
|------|---------|
| `.opencode/tools/worktree-prepare.ts` | Custom tool - creates worktrees |
| `.opencode/plugins/auto-session.js` | Plugin - auto-creates sessions |
| `.opencode/commands/work-on-issue.md` | Slash command - user interface |
| `.opencode/commands/check-worktree-plugin.md` | Diagnostic command |
| `opencode.json` | Plugin and command registration |
