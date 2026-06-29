type ResolveProjectFileLinkHrefOptions = {
  projectRoot?: string | null;
  currentOrigin?: string | null;
};

const decodePathname = (value: string): string | null => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

const normalizeFilePath = (value: string): string => value.replace(/\\/g, '/').replace(/\/+$/g, '');

const isInsideProjectRoot = (filePath: string, projectRoot: string): boolean => (
  filePath === projectRoot || filePath.startsWith(`${projectRoot}/`)
);

export function resolveProjectFileLinkHref(
  href: string | undefined,
  { projectRoot, currentOrigin }: ResolveProjectFileLinkHrefOptions,
): string | null {
  if (!href || !projectRoot) {
    return null;
  }

  const normalizedProjectRoot = normalizeFilePath(projectRoot.trim());
  if (!normalizedProjectRoot.startsWith('/')) {
    return null;
  }

  const trimmedHref = href.trim();
  if (!trimmedHref) {
    return null;
  }

  let candidatePath: string | null = null;

  if (/^https?:\/\//i.test(trimmedHref)) {
    if (!currentOrigin) {
      return null;
    }

    try {
      const url = new URL(trimmedHref);
      if (url.origin !== currentOrigin) {
        return null;
      }
      candidatePath = decodePathname(url.pathname);
    } catch {
      return null;
    }
  } else if (/^file:\/\//i.test(trimmedHref)) {
    try {
      candidatePath = decodePathname(new URL(trimmedHref).pathname);
    } catch {
      return null;
    }
  } else if (trimmedHref.startsWith('/')) {
    candidatePath = decodePathname(trimmedHref);
  }

  if (!candidatePath) {
    return null;
  }

  const normalizedCandidatePath = normalizeFilePath(candidatePath);
  return isInsideProjectRoot(normalizedCandidatePath, normalizedProjectRoot)
    ? normalizedCandidatePath
    : null;
}
