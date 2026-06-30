import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildOpenCodeDefinitionFromIds,
  OpenCodeProviderModels,
  parseOpenCodeModelsStdout,
} from '@/modules/providers/list/opencode/opencode-models.provider.js';

test('OpenCode models provider parses plain CLI output and removes duplicates', () => {
  const ids = parseOpenCodeModelsStdout(`
opencode/big-pickle
not a model
anthropic/claude-opus-4-7-fast
anthropic/claude-opus-4-7-fast
openai/gpt-5.5-pro
`);

  assert.deepEqual(ids, [
    'opencode/big-pickle',
    'anthropic/claude-opus-4-7-fast',
    'openai/gpt-5.5-pro',
  ]);
});

test('OpenCode models provider keeps local configured models when full discovery fails', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'opencode-models-provider-'));
  const fakeOpenCodePath = path.join(tempRoot, 'opencode');
  const originalOpenCodeCliPath = process.env.OPENCODE_CLI_PATH;

  await writeFile(fakeOpenCodePath, `#!/bin/sh
if [ "$1" = "models" ] && [ "$2" = "--pure" ]; then
  printf '%s\\n' 'glm/glm-5.1' 'test111/glm5.1'
  exit 0
fi
if [ "$1" = "models" ]; then
  echo 'models.dev unavailable' >&2
  exit 1
fi
exit 0
`, 'utf8');
  await chmod(fakeOpenCodePath, 0o755);

  try {
    process.env.OPENCODE_CLI_PATH = fakeOpenCodePath;
    const models = await new OpenCodeProviderModels().getSupportedModels();

    assert.deepEqual(models.OPTIONS.map((option) => option.value), [
      'glm/glm-5.1',
      'test111/glm5.1',
    ]);
    assert.equal(models.DEFAULT, 'glm/glm-5.1');
  } finally {
    if (originalOpenCodeCliPath === undefined) {
      delete process.env.OPENCODE_CLI_PATH;
    } else {
      process.env.OPENCODE_CLI_PATH = originalOpenCodeCliPath;
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('OpenCode models provider formats frontend labels from provider-prefixed ids', () => {
  const definition = buildOpenCodeDefinitionFromIds([
    'opencode/deepseek-v4-flash-free',
    'opencode/nemotron-3-super-free',
    'anthropic/claude-3-5-sonnet-20241022',
    'anthropic/claude-opus-4-7-fast',
    'openai/gpt-5.4-mini-fast',
    'openai/gpt-5.5-pro',
    'newprovider/alpha-v12-special-20261231',
  ]);

  assert.deepEqual(definition.OPTIONS, [
    {
      value: 'opencode/deepseek-v4-flash-free',
      label: 'Deepseek V4 Flash Free',
      description: 'opencode - opencode/deepseek-v4-flash-free',
    },
    {
      value: 'opencode/nemotron-3-super-free',
      label: 'Nemotron 3 Super Free',
      description: 'opencode - opencode/nemotron-3-super-free',
    },
    {
      value: 'anthropic/claude-3-5-sonnet-20241022',
      label: 'Claude 3.5 Sonnet (2024-10-22)',
      description: 'anthropic - anthropic/claude-3-5-sonnet-20241022',
    },
    {
      value: 'anthropic/claude-opus-4-7-fast',
      label: 'Claude Opus 4.7 Fast',
      description: 'anthropic - anthropic/claude-opus-4-7-fast',
    },
    {
      value: 'openai/gpt-5.4-mini-fast',
      label: 'GPT-5.4 Mini Fast',
      description: 'openai - openai/gpt-5.4-mini-fast',
    },
    {
      value: 'openai/gpt-5.5-pro',
      label: 'GPT-5.5 Pro',
      description: 'openai - openai/gpt-5.5-pro',
    },
    {
      value: 'newprovider/alpha-v12-special-20261231',
      label: 'Alpha V12 Special (2026-12-31)',
      description: 'newprovider - newprovider/alpha-v12-special-20261231',
    },
  ]);
});
