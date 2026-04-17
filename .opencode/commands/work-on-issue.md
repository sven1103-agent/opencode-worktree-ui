---
description: Start work on a GitHub issue in an isolated worktree session
---

# Work on GitHub Issue

This command creates a dedicated git worktree for a GitHub issue and automatically sets up a new OpenCode session with full context.

## How It Works

1. **Extract** - Parses the GitHub issue URL to identify the repository and issue number
2. **Prepare** - Calls the `worktree-prepare` tool to create an isolated worktree
3. **Auto-Session** - (If plugin loaded) Automatically creates a new OpenCode session in the worktree
4. **Context** - The new session receives the issue title, description, labels, and branch info

## Usage

```
/work-on-issue https://github.com/owner/repo/issues/123
```

### With Options

```
/work-on-issue https://github.com/owner/repo/issues/123 title="Custom title"
/work-on-issue https://github.com/owner/repo/issues/123 baseBranch=develop
/work-on-issue https://github.com/owner/repo/issues/123 customBranchName=my-custom-branch
```

## Automatic Features

- **Branch Naming** - Automatically generates branch names based on labels:
  - `bug`/`bugfix` → `fix/issue-title-123`
  - `enhancement`/`feature` → `feat/issue-title-123`
  - `documentation`/`docs` → `docs/issue-title-123`
  - Default → `fix/issue-title-123`

- **GitHub Integration** - If `gh` CLI is authenticated, fetches:
  - Issue title and description
  - Labels for branch naming
  - Assignees
  - Current state (open/closed)

## What You'll See

On success:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Issue #123: Fix authentication bug

🌿 Branch: fix/authentication-bug-123
📍 Base: main
🔧 Worktree: /repo/.worktrees/fix-authentication-bug-123
🏷️ Labels: bug, p1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Worktree created successfully
✅ Session auto-created (plugin loaded)

Your new session is ready with full issue context!
```

## Fallback (If Plugin Doesn't Load)

If the auto-session plugin doesn't load in Desktop mode, you'll see:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Issue #123: Fix authentication bug

🌿 Branch: fix/authentication-bug-123
📍 Worktree: /repo/.worktrees/fix-authentication-bug-123
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Worktree created successfully

⚠️ Auto-session plugin not loaded
Manual session creation:
  cd /repo/.worktrees/fix-authentication-bug-123
  opencode serve --directory /repo/.worktrees/fix-authentication-bug-123
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Troubleshooting

### "Not in a git repository"
Run the command from within a git repository.

### "Invalid GitHub URL"
Make sure the URL is in format: `https://github.com/owner/repo/issues/123`

### "Base branch not found"
Specify the base branch explicitly: `/work-on-issue <url> baseBranch=main`

### "Worktree already exists"
The worktree was already created. You can use the existing one or specify a different branch name.

### "Session not auto-created"
The auto-session plugin may not have loaded. This happens ~20% of the time in Desktop mode. Use the fallback command to create the session manually. For 100% reliability, use `opencode serve` mode.

## For Best Results

- Use `opencode serve` instead of Desktop for 100% reliability
- Ensure `gh` CLI is authenticated for full issue context
- Clear cache periodically: `rm -rf ~/Library/Caches/opencode`
