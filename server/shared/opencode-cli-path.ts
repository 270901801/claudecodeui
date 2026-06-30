const DEFAULT_OPENCODE_COMMAND = 'opencode';

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function resolveOpenCodeCliPath(
  configuredPath: string | undefined = process.env.OPENCODE_CLI_PATH,
): string {
  return stripWrappingQuotes(configuredPath || DEFAULT_OPENCODE_COMMAND);
}
