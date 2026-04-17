# /issue-workflow

Start an interactive workflow to work on a GitHub issue in an isolated worktree.

## Usage

```
/issue-workflow <github-issue-url>
```

## Description

This command starts an interactive workflow that:

1. **Parses the GitHub issue URL** and fetches issue details (title, labels, description)
2. **Generates a branch name** based on issue title and labels
3. **Shows a confirmation prompt** with the suggested branch and worktree path
4. **Creates a worktree** when confirmed
5. **Spawns a child session** in the worktree
6. **Starts an agent** to work on the issue (if autoStart is enabled)

## Examples

```bash
/issue-workflow https://github.com/owner/repo/issues/123
/issue-workflow https://github.com/myorg/myproject/issues/456
```

## Configuration

Create `.opencode/issue-workflow.json` in your project:

```json
{
  "branchPrefix": {
    "bug": "fix/",
    "fix": "fix/",
    "documentation": "docs/",
    "feature": "feat/",
    "chore": "chore/"
  },
  "baseBranch": "main",
  "worktreeRoot": ".worktrees/$REPO",
  "autoStart": false
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `branchPrefix` | object | see below | Map of labels to branch prefixes |
| `baseBranch` | string | "main" | Base branch for worktree |
| `worktreeRoot` | string | ".worktrees/$REPO" | Where to create worktrees |
| `autoStart` | boolean | false | Start agent automatically after confirmation |

### Default branch prefixes

- `bug` → `fix/`
- `fix` → `fix/`
- `documentation` → `docs/`
- `feature` → `feat/`
- `chore` → `chore/`

## Workflow

1. User runs `/issue-workflow <url>`
2. Plugin fetches issue details from GitHub
3. Plugin suggests branch name based on labels
4. User confirms with "yes" or provides alternative branch name
5. Worktree is created
6. Child session is spawned
7. Agent starts working (if autoStart is true)

## Requirements

- Git repository with configured remote
- GitHub CLI (`gh`) authenticated for fetching issue details
- Git worktree support
