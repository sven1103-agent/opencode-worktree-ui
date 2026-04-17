---
description: Check if auto-session plugin is loaded and working
---

# Check Worktree Plugin Status

This command checks if the auto-session plugin is properly loaded and provides troubleshooting steps if it's not.

## Run This Command

```
/check-worktree-plugin
```

## What It Checks

1. **Plugin Loading** - Verifies auto-session.js is registered in opencode.json
2. **Hook Registration** - Checks if tool.execute.after hook is active
3. **SDK Access** - Confirms client.session.create is accessible
4. **Session Detection** - Verifies ability to list sessions

## Expected Output (When Working)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔌 Auto-Session Plugin Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Plugin: auto-session.js loaded
✅ Hook: tool.execute.after registered
✅ SDK: client.session available
✅ Export: AutoSessionPlugin named export found

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Plugin is working correctly!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Expected Output (When NOT Working)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔌 Auto-Session Plugin Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ Plugin may not be loaded
❌ Hook not detected

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Troubleshooting Steps:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Check opencode.json plugin registration:
   "plugin": [".opencode/plugins/auto-session.js"]

2. Clear cache and restart:
   rm -rf ~/Library/Caches/opencode
   # Then restart OpenCode Desktop

3. Check for errors in log:
   cat /tmp/opencode-auto-session.log

4. For 100% reliability, use opencode serve:
   opencode serve --directory /path/to/worktree

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Manual Verification

### Check Plugin File Exists
```bash
ls -la .opencode/plugins/auto-session.js
```

### Check Log File
```bash
cat /tmp/opencode-auto-session.log
```

### Verify GitHub CLI (for full issue fetching)
```bash
gh auth status
```

### List Active Worktrees
```bash
git worktree list
```

### List OpenCode Sessions
```bash
opencode session list
```

## Common Issues

### "Plugin not found"
- Ensure auto-session.js exists in .opencode/plugins/
- Check opencode.json has correct path

### "Hook not firing"
- Restart OpenCode Desktop completely
- Clear cache: `rm -rf ~/Library/Caches/opencode`

### "Session creation failed"
- Check /tmp/opencode-auto-session.log for errors
- Ensure you have permission to create sessions

### "Works in serve mode but not Desktop"
- This is expected ~20% of the time
- Desktop mode has plugin loading inconsistencies
- Use `opencode serve` for production workflows

## For Production Use

For 100% reliability, use the `opencode serve` command:

```bash
# From your git repo
opencode serve

# Or with specific directory
opencode serve --directory /path/to/worktree
```

The serve mode always loads plugins correctly.
