# opencode-worktree-ui

OpenCode plugin for interactive, UI-friendly worktree-based issue workflows.

## Features

- **GitHub Issue Integration**: Parse and fetch issue details from GitHub URLs
- **Smart Branch Naming**: Automatically infer branch prefixes from issue labels
- **Interactive Confirmation**: User-friendly workflow with confirmation prompts
- **Isolated Sessions**: Create child sessions in dedicated worktrees
- **Auto-start Option**: Automatically spawn agents to work on issues
- **Configurable**: Fully customizable via JSON configuration

## Installation

```bash
npm install -sven1103/opencode-worktree-ui
```

Add to your `opencode.json`:

```json
{
  "plugin": ["@sven1103/opencode-worktree-ui"]
}
```

## Usage

### Slash Command

```
/issue-workflow https://github.com/owner/repo/issues/123
```

### Custom Tools

- `issue_workflow_start` - Start workflow with GitHub issue URL
- `issue_workflow_confirm` - Confirm and execute worktree creation
- `issue_workflow_status` - Check current workflow status

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

### Default Branch Prefixes

- `bug`, `fix` → `fix/`
- `feature` → `feat/`
- `documentation` → `docs/`
- `chore` → `chore/`

## Workflow

1. User runs `/issue-workflow <url>`
2. Plugin fetches issue details via GitHub CLI
3. Plugin generates branch name from title + labels
4. User confirms with "yes" or alternative branch name
5. Worktree is created with `git worktree add`
6. Child session is spawned in worktree directory
7. Agent starts working (if `autoStart: true`)

## Requirements

- Git repository with configured remote
- GitHub CLI (`gh`) authenticated for fetching issue details
- Git version with worktree support

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm test
```

## License

MIT
