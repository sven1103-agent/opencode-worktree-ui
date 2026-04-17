function slugifyTitle(title) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function inferPrefixFromLabels(labels, branchPrefixConfig) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return branchPrefixConfig.fix || "fix/";
  }

  const labelNames = labels.map((l) =>
    typeof l === "string" ? l.toLowerCase() : l.name?.toLowerCase()
  );

  for (const [labelKey, prefix] of Object.entries(branchPrefixConfig)) {
    if (labelNames.some((name) => name.includes(labelKey))) {
      return prefix;
    }
  }

  return branchPrefixConfig.fix || "fix/";
}

export function generateBranchName(issueTitle, issueNum, prefix) {
  const slug = slugifyTitle(issueTitle);
  const sanitized = slug.slice(0, 50);
  return `${prefix}${sanitized}-${issueNum}`;
}

export function generateBranchNameFromUrl(githubUrl, branchPrefixConfig) {
  const parsed = parseGitHubUrl(githubUrl);
  if (!parsed || !parsed.issueNum) {
    return {
      owner: parsed?.owner,
      repo: parsed?.repo,
      issueNum: parsed?.issueNum,
      branchName: null,
    };
  }

  const prefix = branchPrefixConfig.fix || "fix/";
  const branchName = `${prefix}issue-${parsed.issueNum}`;

  return {
    owner: parsed.owner,
    repo: parsed.repo,
    issueNum: parsed.issueNum,
    branchName,
  };
}

export function parseGitHubUrl(url) {
  const GITHUB_URL_PATTERN =
    /github\.com[\/:]([^\/]+)\/([^\/]+)(?:\/issues|\/pull|\/pull\/)?(\d+)?/;
  const match = url.match(GITHUB_URL_PATTERN);
  if (!match) {
    return null;
  }
  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, ""),
    issueNum: match[3] ? parseInt(match[3], 10) : null,
  };
}

export function validateBranchName(branchName) {
  const invalidChars = /[~\^:?*\[]/;
  const startsWithSlash = branchName.startsWith("/");
  const endsWithDot = branchName.endsWith(".");
  const hasDoubleDots = branchName.includes("..");

  if (invalidChars.test(branchName)) {
    return { valid: false, reason: "contains invalid characters (~^:?*[])" };
  }
  if (startsWithSlash) {
    return { valid: false, reason: "starts with /" };
  }
  if (endsWithDot) {
    return { valid: false, reason: "ends with ." };
  }
  if (hasDoubleDots) {
    return { valid: false, reason: "contains .." };
  }
  if (branchName.length > 100) {
    return { valid: false, reason: "exceeds 100 characters" };
  }

  return { valid: true };
}
