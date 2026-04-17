import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "jsonc-parser";

const DEFAULT_CONFIG = {
  branchPrefix: {
    bug: "fix/",
    fix: "fix/",
    documentation: "docs/",
    feature: "feat/",
    chore: "chore/",
  },
  baseBranch: "main",
  worktreeRoot: ".worktrees/$REPO",
  autoStart: false,
};

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath) {
  if (!(await pathExists(filePath))) {
    return null;
  }
  const source = await fs.readFile(filePath, "utf8");
  const data = parse(source);
  return data && typeof data === "object" ? data : null;
}

export async function loadWorkflowConfig(repoRoot) {
  const projectConfig = await readJsonFile(path.join(repoRoot, "opencode.json"));
  const projectConfigC = await readJsonFile(path.join(repoRoot, "opencode.jsonc"));
  const sidecarConfig = await readJsonFile(
    path.join(repoRoot, ".opencode", "issue-workflow.json")
  );

  const merged = {
    ...DEFAULT_CONFIG,
    ...(projectConfig?.issueWorkflow ?? {}),
    ...(projectConfigC?.issueWorkflow ?? {}),
    ...(sidecarConfig ?? {}),
  };

  return {
    branchPrefix:
      typeof merged.branchPrefix === "object" && merged.branchPrefix !== null
        ? merged.branchPrefix
        : DEFAULT_CONFIG.branchPrefix,
    baseBranch: merged.baseBranch || DEFAULT_CONFIG.baseBranch,
    worktreeRoot: path.resolve(
      repoRoot,
      merged.worktreeRoot?.replace("$REPO", path.basename(repoRoot)) ||
        DEFAULT_CONFIG.worktreeRoot.replace("$REPO", path.basename(repoRoot))
    ),
    autoStart: merged.autoStart ?? DEFAULT_CONFIG.autoStart,
  };
}

export function formatRootTemplate(template, repoRoot) {
  const repoName = path.basename(repoRoot);
  return template
    .replaceAll("$REPO", repoName)
    .replaceAll("$ROOT", repoRoot)
    .replaceAll("$ROOT_PARENT", path.dirname(repoRoot));
}

export { DEFAULT_CONFIG };
