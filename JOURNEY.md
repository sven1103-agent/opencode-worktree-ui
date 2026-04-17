# OpenCode Worktree UI - Development Journey

This document captures what was attempted, what was learned, and what remains unresolved during the development of the `opencode-worktree-ui` plugin.

## Date
April 15, 2026

## Goal
Create an OpenCode plugin that provides an interactive, UI-friendly workflow for:
1. Creating git worktrees from GitHub issues
2. Spawning new sessions in isolated directories
3. Auto-starting agents to work on tasks

## What Was Built

### 1. Main Plugin: `opencode-worktree-ui`
**Location**: `~/git/opencode-worktree-ui/`

**Features**:
- GitHub issue URL parsing
- Branch name generation based on issue labels (bug → fix/, feature → feat/, etc.)
- Git worktree creation via `git worktree add`
- Session creation via SDK `client.session.create({ query: { directory } })`
- Auto-starting agents via `client.session.prompt()`
- Configuration via `.opencode/issue-workflow.json`

**Tools Provided**:
- `issue_workflow` - Main workflow tool

**Files**:
```
opencode-worktree-ui/
├── package.json
├── README.md
├── src/
│   ├── index.js           # Main plugin entry
│   ├── config.js          # Config loading
│   ├── github.js          # GitHub API via gh CLI
│   ├── branch.js          # Branch name generation
│   └── workflow.js        # Core orchestration
├── commands/
│   └── issue-workflow.md  # Slash command docs
├── skills/
│   └── worktree-ui/
│       └── SKILL.md       # Policy skill
├── schemas/
│   └── config.schema.json # JSON schema
└── .opencode/
    └── issue-workflow.json # Example config
```

### 2. Test Plugin: `session-test.js`
**Location**: `~/git/idea-factory/.opencode/plugins/session-test.js`

**Purpose**: Minimal plugin to test session creation and directory management

**Tools**:
- `create_test_session` - Creates directory, creates session, auto-starts task

## What Works

### ✅ Session Creation in Different Directories
```javascript
const childSession = await client.session.create({
  query: { directory: worktreePath },
  body: {
    parentID: sessionID,
    title: "New Session Title",
  },
});
```
**Result**: Session created successfully with correct working directory

### ✅ Auto-Starting Tasks in New Sessions
```javascript
await client.session.prompt({
  path: { id: childSessionId },
  body: {
    parts: [{ type: "text", text: "Create a hello.txt file..." }],
  },
});
```
**Result**: Agent starts working in the new session

### ✅ Worktree Creation
```javascript
await $`git worktree add -b ${branchName} ${worktreePath} ${baseBranch}`;
```
**Result**: Git worktree created successfully

### ✅ GitHub API Integration
Using `gh` CLI to fetch issue details:
```javascript
await $`gh issue view ${issueNum} --repo ${owner}/${repo} --json title,body,labels`;
```

## What Does NOT Work

### ❌ Plugin Loading in OpenCode Desktop (Inconsistent)
**Issue**: Plugins load intermittently in Desktop mode
- Sometimes sessions are created (observed at 9:30 PM)
- Sometimes nothing happens despite tool being called
- Changes to plugin code don't always take effect even after restart

**Possible Causes**:
- Desktop bundles client + server and may cache plugin state
- Plugin loading order or initialization timing
- Configuration file location (project vs global)

### ❌ Auto-Switching to New Session in UI
**Attempted**:
```javascript
await client.tui.submitPrompt({
  body: { parts: [{ text: `/session switch ${childSessionId}` }] },
});
```
**Result**: No API available to programmatically switch the user's current session view

**Workaround**: User must manually run `opencode <worktree-path>` or `/session switch <id>`

### ❌ Global Config Plugin Loading
**Attempted**: Adding plugin to `~/.config/opencode/opencode.json`
**Result**: Did not resolve loading issues, reverted

## Configuration

### Project-Level (`.opencode/issue-workflow.json`)
```json
{
  "branchPrefix": {
    "bug": "fix/",
    "feature": "feat/",
    "documentation": "docs/",
    "chore": "chore/"
  },
  "baseBranch": "main",
  "worktreeRoot": ".worktrees/$REPO",
  "autoStart": false
}
```

### Project-Level Plugin Registration
In `opencode.json`:
```json
{
  "plugin": [".opencode/plugins/opencode-worktree-ui.js"]
}
```

## Known Limitations

1. **Plugin Loading**: Desktop mode has inconsistent plugin loading
2. **UI Switching**: Cannot auto-switch user to new session (must be manual)
3. **Session Visibility**: New sessions exist but don't appear in Desktop sidebar until manually opened
4. **GitHub Auth**: Requires `gh` CLI to be authenticated for issue details

## Test Results

### Successful Session Creation (9:30 PM)
- Tool: `create_test_session`
- Result: Created session `ses_26d63d7c9ffelYgwgO5kG0I6r2` with title "Empty conversation start"
- Working directory: New directory created
- Verification: Session appeared in `opencode session list`

### Failed Attempts (Later)
- Tool called but no directory created
- Tool called but no session created
- No explicit error messages shown

## PoC: Desktop Session Creation

See [pocs/PLAN.md](./pocs/PLAN.md) for a focused test to determine if `client.session.create()` works reliably in OpenCode Desktop.

**Goal**: Prove minimal session creation works before building full workflow.

**Test Command**:
```
/create_test_session /tmp/test-opencode-session
```

**Files**:
- `.opencode/plugins/test-session.js` - Minimal test plugin
- `pocs/PLAN.md` - Full test procedure and success criteria

## Recommended Next Steps

### Option 1: Use `opencode serve` Mode (Recommended for Plugin Reliability)
For reliable plugin execution:
```bash
# Terminal 1
opencode serve

# Terminal 2
opencode http://localhost:9090
```

### Option 2: Custom Tools (Limited - Cannot Create Sessions)
Custom tools in `.opencode/tools/` are simpler to load but CANNOT create sessions because they don't have access to `client`. They only get `context` with `{ directory, worktree, sessionID, messageID, agent }`.

### Option 3: External SDK Script
Use the SDK from outside OpenCode to create sessions:
```javascript
import { createOpencodeClient } from "@opencode-ai/sdk";
const client = createOpencodeClient();
await client.session.create({ ... });
```

### Option 4: Slash Commands with External Tool
Slash commands call tools. The `wt-new` command already exists and calls `worktree_prepare` tool. Create that tool to handle worktree creation.

## Key Learnings

1. **SDK is powerful but Desktop integration is fragile** - The SDK methods work correctly, but the plugin loading mechanism in Desktop mode is not reliable for development

2. **Session creation works** - Creating sessions in different directories via SDK is fully functional

3. **No programmatic UI control** - Cannot force the Desktop UI to switch sessions programmatically

4. **Plugin development workflow** - Requires frequent restarts and has unclear caching behavior

## Files to Reference

- Plugin source: `~/git/opencode-worktree-ui/`
- Test plugin: `~/git/idea-factory/.opencode/plugins/session-test.js`
- Main plugin: `~/git/idea-factory/.opencode/plugins/opencode-worktree-ui.js`
- Config example: `~/git/opencode-worktree-ui/.opencode/issue-workflow.json`

## Conclusion

The technical implementation is sound - sessions can be created, worktrees can be managed, and agents can be auto-started. However, the OpenCode Desktop plugin loading mechanism introduces significant unpredictability that makes the user experience unreliable. For production use, the `opencode serve` + SDK client approach would be more stable.
