# OpenCode Desktop Worktree Session PoC Plan

## Goal
Prove that we can programmatically create a new session in a specific directory (worktree) using the OpenCode SDK from within a Desktop plugin.

## Background
From [JOURNEY.md](./JOURNEY.md), we know:
- ✅ Session creation via SDK works in `opencode serve` mode
- ❌ Desktop plugin loading is "inconsistent" and "intermittent"
- ❌ No clear debugging visibility when Desktop plugins fail

**Critical Question**: Does `client.session.create({ query: { directory: path } })` work reliably in OpenCode Desktop?

## PoC Scope
**Minimal viable test** - nothing more, nothing less:
1. Tool accepts a target directory path
2. Creates a child session with that directory
3. Verifies the session was created
4. Returns full results

## Implementation

### Files Created

```
/Users/sven1103/git/opencode-worktree-ui/
├── .opencode/
│   └── plugins/
│       ├── index.js              # Original plugin entry
│       └── test-session.js       # NEW - Minimal test plugin
├── opencode.json                  # UPDATED - Plugin registration
└── pocs/
    └── PLAN.md                    # NEW - This file
```

### Test Plugin: `.opencode/plugins/test-session.js`

**Features:**
- Single tool: `create_test_session`
- Takes `targetDirectory` parameter
- Comprehensive file logging to `/tmp/opencode-session-test.log`
- Step-by-step execution reporting
- Session verification via `client.session.get()`
- Returns formatted results to chat UI

**Usage:**
```
/test_create_session /Users/sven1103/test-worktree-xyz
```

**Expected Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Child Session Created

📍 Session ID: ses_xxxxxxxx
📂 Directory: /Users/sven1103/test-worktree-xyz
📋 Title: Test Session 2026-04-17T12:00:00.000Z
🔍 Verified: ✅ Yes
⏱️  Duration: 123ms

Log file: /tmp/opencode-session-test.log
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Plugin Registration

Updated `opencode.json`:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [".opencode/plugins/test-session.js"],
  ...
}
```

## Test Procedure

### Step 1: Prepare Test Directory
```bash
mkdir -p /tmp/test-opencode-session
```

### Step 2: Clear Previous Logs
```bash
rm -f /tmp/opencode-session-test.log
```

### Step 3: Launch OpenCode Desktop
Open the app fresh (fully quit and restart if needed).

### Step 4: Run the Test
In the OpenCode Desktop chat:
```
/create_test_session /tmp/test-opencode-session
```

### Step 5: Check Results

**Immediate check - chat output:**
- Did the tool return success or error?
- Is there a session ID?
- Is it marked as "Verified: ✅ Yes"?

**File log check:**
```bash
cat /tmp/opencode-session-test.log
```

**Desktop log check:**
```bash
ls -la ~/.local/share/opencode/log/
cat ~/.local/share/opencode/log/$(ls -t ~/.local/share/opencode/log/ | head -1)
```

**Session list check:**
```bash
opencode session list
```

## Success Criteria

The PoC is **SUCCESSFUL** if:
1. ✅ Tool executes without error in chat
2. ✅ Returns a valid session ID
3. ✅ Shows "Verified: ✅ Yes"
4. ✅ Log file shows complete execution flow
5. ✅ Child session appears in `opencode session list`

The PoC is **INCONCLUSIVE** if:
- Desktop shows no tool at all (plugin not loaded)
- Tool returns but with no clear error
- Logs don't show expected entries

The PoC is **FAILED** if:
- Tool errors with SDK/Client related message
- Session created but in wrong directory
- Verification consistently fails

## Fallback Plan

If the Desktop PoC fails or is inconclusive:

### Option A: Test in `opencode serve` mode
This isolates whether it's a Desktop-specific issue or fundamental SDK problem.

```bash
# Terminal 1
opencode serve --print-logs

# Terminal 2  
cd /Users/sven1103/git/opencode-worktree-ui
opencode http://localhost:9090

# Then run the same test command
```

### Option B: Check plugin registration variations
Try different plugin registration approaches:
- Global config: `~/.config/opencode/opencode.json`
- Different path formats in `plugin` array
- Symlink vs direct file reference

### Option C: Reconsider architecture
If Desktop plugin loading is fundamentally unreliable for session creation, we may need to reconsider the approach (see JOURNEY.md Options 2-4).

## Debugging Reference

### Known Issues (from research)
- `client.app.log()` has a bug where logs don't appear with `--print-logs`
- Desktop plugin loading can be affected by cache
- Console.log may not appear in Desktop

### Why File Logging?
We're using direct file writes to `/tmp/opencode-session-test.log` because:
1. ✅ Survives crashes
2. ✅ Works regardless of Desktop's log handling
3. ✅ Can be `tail -f`'d during testing
4. ✅ No dependency on `client.app.log()` bug

## Next Steps After PoC

### If SUCCESSFUL:
1. Add worktree creation logic to the test
2. Add GitHub issue integration
3. Build full workflow tool
4. Document reliable plugin loading pattern

### If FAILED:
1. Analyze logs to determine root cause
2. Test in `opencode serve` mode to isolate Desktop vs SDK
3. Decide: debug further vs. change architecture

## Timeline

This PoC should be completable in **one focused session** (~30-60 minutes):
- 5 min: Review this plan
- 10 min: Prepare test directory and environment
- 5 min: Run test in Desktop
- 10 min: Analyze results and logs
- 10 min: Run fallback test in `serve` mode if needed
- 10 min: Document findings

---

**Created**: 2026-04-17
**Status**: Ready for execution
**Priority**: Critical - blocks all worktree session work
