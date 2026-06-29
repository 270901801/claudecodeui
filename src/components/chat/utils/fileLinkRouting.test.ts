import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveProjectFileLinkHref } from './fileLinkRouting';

const projectRoot = '/Users/hongsucao/Documents/temp/claudecodeui';

test('resolves a same-origin URL whose path is a file inside the current project', () => {
  const href = 'http://192.168.8.104:3001/Users/hongsucao/Documents/temp/claudecodeui/doc/2026-06-30-network-proxy-diagnosis.md';

  assert.equal(
    resolveProjectFileLinkHref(href, {
      projectRoot,
      currentOrigin: 'http://192.168.8.104:3001',
    }),
    '/Users/hongsucao/Documents/temp/claudecodeui/doc/2026-06-30-network-proxy-diagnosis.md',
  );
});

test('resolves an absolute path inside the current project', () => {
  assert.equal(
    resolveProjectFileLinkHref('/Users/hongsucao/Documents/temp/claudecodeui/doc/a.md', {
      projectRoot,
      currentOrigin: 'http://192.168.8.104:3001',
    }),
    '/Users/hongsucao/Documents/temp/claudecodeui/doc/a.md',
  );
});

test('does not resolve links outside the current project root', () => {
  assert.equal(
    resolveProjectFileLinkHref('/Users/hongsucao/Documents/temp/other/doc/a.md', {
      projectRoot,
      currentOrigin: 'http://192.168.8.104:3001',
    }),
    null,
  );
});

test('does not resolve external HTTP links even when their pathname looks local', () => {
  assert.equal(
    resolveProjectFileLinkHref('https://example.com/Users/hongsucao/Documents/temp/claudecodeui/doc/a.md', {
      projectRoot,
      currentOrigin: 'http://192.168.8.104:3001',
    }),
    null,
  );
});

test('keeps sibling paths with the same prefix outside the project boundary', () => {
  assert.equal(
    resolveProjectFileLinkHref('/Users/hongsucao/Documents/temp/claudecodeui-other/doc/a.md', {
      projectRoot,
      currentOrigin: 'http://192.168.8.104:3001',
    }),
    null,
  );
});

