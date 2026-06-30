import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProviderModelsDefinition } from '../../../../types/app';

import {
  buildProviderSelectionGroups,
  createInitialCollapsedProviderSet,
  shouldProviderGroupRenderExpanded,
} from './providerSelectionGroups';

const buildModels = (...values: string[]): ProviderModelsDefinition => ({
  OPTIONS: values.map((value) => ({
    value,
    label: value,
  })),
  DEFAULT: values[0] ?? '',
});

test('provider selection defaults to collapsing Gemini and Cursor groups', () => {
  const groups = buildProviderSelectionGroups({
    claude: buildModels('claude-sonnet'),
    cursor: buildModels('cursor-gpt'),
    gemini: buildModels('gemini-pro'),
    opencode: buildModels('glm/glm-5.1'),
  });

  const collapsed = createInitialCollapsedProviderSet(groups, 'claude');

  assert.equal(collapsed.has('cursor'), true);
  assert.equal(collapsed.has('gemini'), true);
  assert.equal(collapsed.has('claude'), false);
  assert.equal(collapsed.has('opencode'), false);
});

test('provider selection keeps the active provider expanded even when it is collapsed by default', () => {
  const groups = buildProviderSelectionGroups({
    cursor: buildModels('cursor-gpt'),
    gemini: buildModels('gemini-pro'),
  });

  const collapsed = createInitialCollapsedProviderSet(groups, 'gemini');

  assert.equal(collapsed.has('cursor'), true);
  assert.equal(collapsed.has('gemini'), false);
});

test('provider selection expands collapsed groups while searching', () => {
  const groups = buildProviderSelectionGroups({
    cursor: buildModels('cursor-gpt'),
  });
  const collapsed = createInitialCollapsedProviderSet(groups, 'claude');

  assert.equal(
    shouldProviderGroupRenderExpanded('cursor', collapsed, ''),
    false,
  );
  assert.equal(
    shouldProviderGroupRenderExpanded('cursor', collapsed, 'gpt'),
    true,
  );
});
