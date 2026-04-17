# Skill: Issue Worktree Workflow

## Description

This skill provides guidance for using the issue-workflow plugin to work on GitHub issues in isolated git worktrees.

## When to Use

Use this skill when:
- A user wants to work on a specific GitHub issue
- The user prefers UI-driven workflow over manual commands
- Isolation from the main repository is desired

## Workflow Steps

### 1. Start Workflow
When the user provides a GitHub issue URL, use the `issue_workflow_start` tool:

```
Tool: issue_workflow_start
Arguments:
  url: <github-issue-url>
```

### 2. Present Confirmation
After receiving the workflow details:
- Display the suggested branch name
- Show the worktree path
- Ask user to confirm with "yes" or provide alternative branch name

### 3. Execute Confirmation
When user confirms, use:

```
Tool: issue_workflow_confirm
Arguments:
  branchName: <user-provided-branch-or-empty-for-suggested>
```

### 4. Monitor Progress
After worktree creation:
- The child session will operate in the isolated worktree
- All file operations are automatically redirected to the worktree
- Results can be retrieved from the child session

## Configuration

The plugin supports customization via `.opencode/issue-workflow.json`:

| Setting | Description | Default |
|---------|-------------|---------|
| branchPrefix | Label-to-prefix mapping | bug→fix/, feature→feat/, etc. |
| baseBranch | Branch to create worktree from | main |
| worktreeRoot | Worktree directory | .worktrees/$REPO |
| autoStart | Auto-start agent after confirmation | false |

## Branch Name Inference

The plugin automatically infers branch prefix from issue labels:
- `bug`, `fix` → `fix/`
- `feature` → `feat/`
- `documentation` → `docs/`
- `chore` → `chore/`
- default → `fix/`

## Error Handling

If worktree creation fails:
- Check if worktree already exists
- Verify git repository has a remote
- Ensure base branch exists

## Best Practices

1. **Always confirm before executing** - Show user the branch name and worktree path
2. **Use descriptive branch names** - Based on issue title
3. **Clean up after completion** - Use the worktree-workflow plugin to clean up merged worktrees
4. **Respect user preferences** - Honor the autoStart configuration
