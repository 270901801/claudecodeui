import type { LLMProvider, ProviderModelsDefinition } from '../../../../types/app';

export type ProviderSelectionGroup = {
  id: LLMProvider;
  name: string;
  models: ProviderModelsDefinition['OPTIONS'];
};

const PROVIDER_META: readonly { id: LLMProvider; name: string }[] = [
  { id: 'claude', name: 'Anthropic' },
  { id: 'codex', name: 'OpenAI' },
  { id: 'gemini', name: 'Google' },
  { id: 'cursor', name: 'Cursor' },
  { id: 'opencode', name: 'OpenCode' },
];

const DEFAULT_COLLAPSED_PROVIDER_IDS: readonly LLMProvider[] = ['gemini', 'cursor'];

export function buildProviderSelectionGroups(
  catalog: Partial<Record<LLMProvider, ProviderModelsDefinition>>,
): ProviderSelectionGroup[] {
  return PROVIDER_META.map((provider) => ({
    id: provider.id,
    name: provider.name,
    models: catalog[provider.id]?.OPTIONS ?? [],
  }));
}

export function createInitialCollapsedProviderSet(
  groups: ProviderSelectionGroup[],
  activeProvider: LLMProvider,
): Set<LLMProvider> {
  const availableProviders = new Set(groups.map((group) => group.id));
  const collapsedProviders = new Set<LLMProvider>();

  for (const providerId of DEFAULT_COLLAPSED_PROVIDER_IDS) {
    if (providerId !== activeProvider && availableProviders.has(providerId)) {
      collapsedProviders.add(providerId);
    }
  }

  return collapsedProviders;
}

export function shouldProviderGroupRenderExpanded(
  providerId: LLMProvider,
  collapsedProviders: ReadonlySet<LLMProvider>,
  searchQuery: string,
): boolean {
  return searchQuery.trim().length > 0 || !collapsedProviders.has(providerId);
}
