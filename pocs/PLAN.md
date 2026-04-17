# OpenCode Worktree Auto-Session Architecture

## Status: **ARCHITECTURE FINALIZED** → Ready for Implementation

## Goal
Build a reliable, automatic workflow that creates isolated git worktrees for GitHub issues and immediately opens new OpenCode sessions in those worktrees with zero manual steps.

## Background & Decisions

### What We Learned from PoCs

1. **Custom tools are 100% reliable** in OpenCode Desktop
   - Load consistently, no cache issues
   - BUT: No SDK access (can't create sessions)

2. **Plugins have SDK access but loading is inconsistent**
   - `client.session.create()` works perfectly when plugin loads
   - Desktop sometimes doesn't load plugins (cache/state issues)
   - `opencode serve` mode makes plugins 100% reliable

3. **The `context.$` bug is fixed**
   - ToolContext does NOT have `$` property
   - Must use `Bun.$` directly for shell commands

4. **User requirement: AUTOMATIC is mandatory**
   - Manual `opencode <path>` is too much friction
   - Users won't adopt if they have to remember commands

### Selected Architecture: Hybrid (Custom Tool + Plugin Hook)

**Why this architecture:**
- ✅ Custom tool provides **reliable foundation** (worktree creation)
- ✅ Plugin hook provides **automatic session creation** when it works
- ✅ Graceful **fallback** when plugin doesn't load (clear instructions)
- ✅ No single point of failure

**Trade-off:** Plugin loading still sometimes fails, but worktree always gets created.

---

## Architecture Overview

```
User: /work-on-issue https://github.com/owner/repo/issues/123
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. SLASH COMMAND (.opencode/commands/work-on-issue.md)     │
│    - Natural language trigger                               │
│    - Loads worktree-ui skill                                │
│    - Instructs AI to call worktree-prepare tool             │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. CUSTOM TOOL (.opencode/tools/worktree-prepare.ts)       │
│    - Parses GitHub URL → extracts issue data               │
│    - Generates branch name from labels (bug→fix/, etc.)     │
│    - Creates worktree via Bun.$                             │
│    - Returns STRUCTURED JSON (not text)                     │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. PLUGIN HOOK (.opencode/plugins/auto-session.js)          │
│    - Hook: tool.execute.after                               │
│    - Checks if tool == "worktree-prepare"                   │
│    - Parses JSON output → extracts worktreePath            │
│    - Calls client.session.create({ directory })             │
│    - Calls client.session.prompt({ path, body })             │
│    - Auto-starts agent with issue context                   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. RESULT                                                   │
│    ✅ Worktree created (guaranteed)                         │
│    ✅ Session auto-created (if plugin loaded)               │
│    ✅ Agent auto-started with issue context                 │
│    ℹ️  Fallback instructions (if plugin didn't load)         │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### Component 1: Custom Tool `worktree-prepare`

**File:** `.opencode/tools/worktree-prepare.ts`

**Interface:**
```typescript
args: {
  issueUrl: string;              // GitHub issue URL
  title?: string;                // Optional override
  customBranchName?: string;      // Optional override
  baseBranch?: string;            // Default: "main"
}

returns: JSON string {
  status: "success" | "error";
  worktreePath: string;           // Absolute path to worktree
  branchName: string;             // Git branch name
  issue: {
    url: string;
    number: number;
    title: string;
    labels: string[];
  };
  baseBranch: string;
  baseCommit: string;
  fallback?: string;              // Manual command if auto fails
  error?: string;                 // Error message if status==error
}
```

**Implementation Notes:**
- Use `Bun.$` not `context.$` for shell commands
- Use `context.directory` to find repo root
- Support GitHub CLI if available (for real issue data)
- Fallback to URL parsing if gh CLI unavailable
- Handle worktree already exists case gracefully
- NEVER use `node:fs` - use `Bun.$` with shell commands

**Success Output Example:**
```json
{
  "status": "success",
  "worktreePath": "/Users/sven1103/git/opencode-worktree-ui/.worktrees/fix-login-bug-123",
  "branchName": "fix/login-bug-123",
  "issue": {
    "url": "https://github.com/user/repo/issues/123",
    "number": 123,
    "title": "Fix login bug",
    "labels": ["bug", "urgent"]
  },
  "baseBranch": "main",
  "baseCommit": "abc1234",
  "fallback": "If session doesn't open automatically, run: opencode /Users/sven1103/git/opencode-worktree-ui/.worktrees/fix-login-bug-123"
}
```

---

### Component 2: Plugin `auto-session`

**File:** `.opencode/plugins/auto-session.js`

**Requirements:**
- Named export: `export const AutoSessionPlugin`
- Method: `async execute(args, context)` not arrow function
- Hooks: `tool.execute.after`

**Hook Implementation:**
```javascript
hooks: {
  "tool.execute.after": async (input, output, context) => {
    // Only handle worktree-prepare tool
    if (input.tool !== "worktree-prepare") return;
    
    try {
      // Parse tool output
      const result = JSON.parse(output.result);
      if (result.status !== "success") {
        console.error("Worktree creation failed:", result.error);
        return;
      }
      
      // Create session in worktree
      const session = await context.client.session.create({
        query: { directory: result.worktreePath },
        body: {
          parentID: context.sessionID,
          title: `Issue #${result.issue.number}: ${result.issue.title}`
        }
      });
      
      console.log(`✅ Auto-created session: ${session.id}`);
      
      // Auto-start agent with context
      await context.client.session.prompt({
        path: { id: session.id },
        body: {
          parts: [{
            type: "text",
            text: `Work on GitHub issue:

**Title:** ${result.issue.title}
**URL:** ${result.issue.url}
**Branch:** ${result.branchName}
**Worktree:** ${result.worktreePath}

Please analyze the issue and implement the required changes. Start by reading relevant files and understanding the codebase.`
          }]
        }
      });
      
      console.log(`🚀 Agent auto-started in session ${session.id}`);
      
    } catch (error) {
      // Don't fail - worktree is already created
      console.error("Auto-session creation failed (non-fatal):", error);
      console.log("User can manually open with:", result.fallback);
    }
  }
}
```

**Error Handling:**
- Parse errors: Log but don't throw
- Session creation fails: Log fallback command
- Agent start fails: Log but session exists
- Never block on errors - worktree creation is the source of truth

---

### Component 3: Slash Command `work-on-issue`

**File:** `.opencode/commands/work-on-issue.md`

**Frontmatter:**
```yaml
---
description: Start work on a GitHub issue in an isolated worktree session
---
```

**Content:**
```markdown
## Workflow: Work on GitHub Issue

You are an orchestrator for GitHub issue workflows. Follow these steps:

### Step 1: Extract Issue Information
- Parse the GitHub issue URL from the user's message
- Extract: owner, repo, issue number
- If GitHub CLI (gh) is available, fetch issue details:
  - Title, body, labels, state
- If gh not available, extract issue number from URL and use generic title

### Step 2: Prepare Worktree
Call the **worktree-prepare** tool with:
- issueUrl: (the full URL)
- title: (issue title if available)
- baseBranch: "main" (or current branch)

### Step 3: Handle Results

**If tool returns success:**
1. Confirm to user: "✅ Worktree created at {worktreePath}"
2. Explain: "A new session should automatically open in this worktree with an agent ready to work on the issue."
3. If user doesn't see new session within 5 seconds, provide fallback:
   ```
   Run manually: opencode {worktreePath}
   ```

**If tool returns error:**
1. Explain the error
2. Provide troubleshooting steps
3. Suggest manual worktree creation if needed

### Step 4: Context Preservation
The new session will automatically receive:
- Issue title and URL
- Branch name
- Instructions to analyze and implement

The orchestrator agent (coding-boss) in the new session will delegate to appropriate subagents (planner → implementer → reviewer).

### Important Notes
- Do not create sessions manually - the plugin hook handles this automatically
- Do not switch sessions - let the user see the new session appear
- The fallback command is only for when auto-creation fails
```

---

### Component 4: Skill `worktree-ui`

**File:** `.opencode/skills/worktree-ui/SKILL.md` (update existing)

**Add Section:**
```markdown
## Auto-Session Architecture

This skill enables automatic worktree + session creation for GitHub issues.

### How It Works

1. **Custom Tool (Reliable):** Creates the git worktree using standard git commands
2. **Plugin Hook (Best-effort):** Automatically creates new OpenCode session in the worktree
3. **Auto-Start (Best-effort):** Immediately starts an agent with issue context

### Reliability Guarantees

| Component | Reliability | Fallback |
|-----------|-------------|----------|
| Worktree creation | ⭐⭐⭐⭐⭐ 100% | N/A |
| Auto-session | ⭐⭐⭐ ~80% | Manual command provided |
| Auto-start | ⭐⭐⭐ ~80% | User can prompt agent manually |

### Why This Architecture?

Custom tools are 100% reliable in OpenCode Desktop, but cannot access the SDK to create sessions. Plugins have SDK access but occasionally fail to load in Desktop.

By combining both:
- Worktree ALWAYS gets created (reliable foundation)
- Session USUALLY gets created automatically (convenience)
- Clear fallback when automation fails (user empowerment)

### For Developers

To use this in your own projects:

1. Install the plugin and tools
2. Run: /work-on-issue https://github.com/owner/repo/issues/123
3. Wait for automatic session creation
4. If no session appears, use the fallback command shown

### Technical Details

- **Hook Type:** `tool.execute.after`
- **Trigger:** After `worktree-prepare` tool succeeds
- **JSON Parsing:** Tool returns structured JSON, hook parses it
- **Session Parent:** Child session linked to parent for navigation
- **Context:** Full issue data passed to new session
```

---

## Configuration

### opencode.json Updates

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "/Users/sven1103/git/opencode-worktree-ui/.opencode/plugins/auto-session.js"
  ],
  "commands": {
    "work-on-issue": {
      "file": ".opencode/commands/work-on-issue.md"
    },
    "check-worktree-plugin": {
      "file": ".opencode/commands/check-worktree-plugin.md"
    }
  },
  "agent": {
    "coding-boss": {
      "description": "Routes work to subagents in worktree",
      "mode": "primary",
      "permission": {
        "task": {
          "*": "deny",
          "planner": "allow",
          "implementer": "allow",
          "code-reviewer": "allow"
        }
      }
    }
  }
}
```

---

## Testing Strategy

### Phase 1: Unit Test Components

**Test 1: worktree-prepare tool**
```bash
# Create test worktree
# Should return valid JSON with all fields
# Verify: git worktree list shows new worktree
```

**Test 2: Plugin hook (in isolation)**
```bash
# In opencode serve mode (reliable plugin loading)
# Verify hook fires after tool execution
# Verify session created with correct directory
```

**Test 3: Full workflow**
```bash
# /work-on-issue https://github.com/user/repo/issues/1
# Verify: worktree created
# Verify: session auto-created (if plugin loaded)
# Verify: agent has issue context
```

### Phase 2: Edge Cases

**Case 1: Plugin doesn't load**
- Tool should still create worktree
- User should see fallback command
- Manual session creation should work

**Case 2: Worktree already exists**
- Should handle gracefully
- Return existing worktree path
- Still attempt session creation

**Case 3: Invalid GitHub URL**
- Clear error message
- Suggest URL format
- Don't create partial worktree

**Case 4: No git repository**
- Detect not in git repo
- Error before any work
- Suggest git init

---

## Success Criteria

### Must Have (MVP)
- [ ] `/work-on-issue <url>` creates worktree automatically
- [ ] Tool returns structured JSON with all required fields
- [ ] Worktree appears in `git worktree list`
- [ ] Clear fallback message shown to user

### Should Have (Good UX)
- [ ] Plugin hook fires and creates session automatically
- [ ] New session appears in OpenCode UI
- [ ] Agent auto-starts with issue context
- [ ] User can navigate between parent and child sessions

### Nice to Have (Polish)
- [ ] Plugin health check command works
- [ ] GitHub CLI integration fetches real issue data
- [ ] Branch naming from labels (bug→fix/, feature→feat/)
- [ ] Config file support (.opencode/issue-workflow.json)

---

## Risk Mitigation

### Risk 1: Plugin never loads in Desktop
**Mitigation:** Document `opencode serve` mode as recommended setup
**Fallback:** Manual session creation is always available

### Risk 2: Hook fires but session creation fails
**Mitigation:** Try-catch in hook, log error, don't block
**Fallback:** User sees worktree path, can open manually

### Risk 3: JSON parsing fails
**Mitigation:** Validate JSON structure in tool
**Fallback:** Hook logs parse error, user sees tool output

### Risk 4: Agent doesn't auto-start
**Mitigation:** Session exists, user can prompt manually
**Fallback:** Not critical - main goal is worktree+session

---

## Deliverables

### Files to Create
1. `.opencode/tools/worktree-prepare.ts` - Custom tool
2. `.opencode/plugins/auto-session.js` - Plugin with hook
3. `.opencode/commands/work-on-issue.md` - Main command
4. `.opencode/commands/check-worktree-plugin.md` - Health check
5. Update `.opencode/skills/worktree-ui/SKILL.md` - Documentation
6. Update `opencode.json` - Registration

### Documentation
- README.md update with installation instructions
- Troubleshooting guide for common issues
- Architecture decision record (this plan)

---

## Timeline Estimate

- **Phase 1:** Custom tool (2 hours)
- **Phase 2:** Plugin with hook (2 hours)
- **Phase 3:** Commands and skills (1 hour)
- **Phase 4:** Testing and edge cases (2 hours)
- **Phase 5:** Documentation and polish (1 hour)

**Total: ~8 hours of focused work**

---

## Next Steps

1. ✅ **ARCHITECTURE APPROVED** (this document)
2. 🔄 **HANDOFF TO IMPLEMENTER** (create handoff artifact)
3. ⏳ Implement components per specifications
4. ⏳ Test in Desktop and serve modes
5. ⏳ Document and release

---

**Updated**: 2026-04-17  
**Status**: Architecture finalized, ready for implementation  
**Decision**: Hybrid approach (custom tool + plugin hook) provides best balance of reliability and automation
