import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveOpenCodeCliPath } from '../opencode-cli-path.js';

test('resolveOpenCodeCliPath falls back to the default command when no path is configured', () => {
  assert.equal(resolveOpenCodeCliPath(undefined), 'opencode');
});

test('resolveOpenCodeCliPath strips wrapping quotes from an explicit path', () => {
  assert.equal(
    resolveOpenCodeCliPath('"/opt/homebrew/bin/opencode"'),
    '/opt/homebrew/bin/opencode',
  );
});

test('resolveOpenCodeCliPath preserves a bare configured command', () => {
  assert.equal(resolveOpenCodeCliPath('opencode-beta'), 'opencode-beta');
});
