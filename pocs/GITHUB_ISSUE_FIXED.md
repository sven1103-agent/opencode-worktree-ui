# FIXED: OpenCode Plugin Context Architecture

## The Problem (Mistake on My Part)

I originally thought OpenCode Desktop plugins had an empty context bug where all `PluginInput` properties were `undefined`.

**Wrong code:**
```javascript
export default async function autoSessionPlugin(args, context) {
  // context was the 2nd parameter - but it's actually the 1st!
  console.log(context?.serverUrl); // undefined
}
```

**Correct code:**
```javascript
export default async function autoSessionPlugin(context) {
  // context is the 1st (and only) parameter
  console.log(context?.serverUrl); // works!
}
```

## What I Learned

The OpenCode plugin documentation is correct. The plugin function receives `PluginInput` as its **first and only parameter**, not the second parameter after `args`.

## Working Plugin Architecture

After fixing the signature, the plugin now works correctly:

### Custom Tool (`worktree-prepare.ts`)
- Creates git worktrees from GitHub issue URLs
- Returns WORKTREE trigger pattern in bash output

### Plugin (`auto-session.js`)
- Hooks into `tool.execute.after` events
- Detects WORKTREE pattern from bash output
- Uses `context.serverUrl` to make REST API calls
- Updates session with new worktree directory

### The Flow
1. User runs: `/work-on-issue https://github.com/owner/repo/issues/42`
2. Tool creates worktree: `/.worktrees/issue-42-fix-bug/`
3. Tool outputs: `WORKTREE:/path:42:Fix Bug`
4. Plugin hook fires on bash command
5. Plugin detects WORKTREE pattern
6. Plugin uses `context.serverUrl` + env password to update session
7. Session switches to worktree automatically

## Key Implementation Details

### Plugin Context Properties (Now Working!)
- ✅ `context.serverUrl` - URL for REST API calls
- ✅ `context.sessionID` - Current session identifier
- ✅ `context.directory` - Current working directory
- ✅ `context.client` - SDK client (for GraphQL/WebSocket)
- ✅ `context.$` - BunShell for running commands

### REST API Authentication
```javascript
const password = process.env.OPENCODE_SERVER_PASSWORD;
const auth = Buffer.from(`opencode:${password}`).toString("base64");
// Use in Authorization: Basic header
```

### Session Update Endpoint
```javascript
PUT /session/${sessionID}
Headers: Authorization: Basic <auth>
Body: { directory: worktreePath, title: "Issue #N: Title" }
```

## Files Changed

- `.opencode/plugins/auto-session.js` - Fixed function signature
- `.opencode/tools/worktree-prepare.ts` - Creates worktrees
- `.opencode/tools/worktree-session.ts` - One-shot worktree + switch
- `.opencode/commands/work-on-issue.md` - User command

## Status

**RESOLVED**: The plugin architecture works as documented. The issue was incorrect function signature in my implementation.

Now the worktree auto-switching workflow should work perfectly!
