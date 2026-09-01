import { describe, expect, it } from 'vitest'
import { mergeCodexCatalogModel, remoteCodexModelLabel } from '../../ui/codex-models'

describe('codex model catalog mapping', () => {
  const remote = {
    id: 'gpt-5.6-sol',
    model: 'gpt-5.6-sol',
    displayName: 'GPT-5.6-Sol',
    description: 'Latest frontier agentic coding model.',
    defaultReasoningEffort: 'low',
    supportedReasoningEfforts: [
      { reasoningEffort: 'low' },
      { reasoningEffort: 'medium' },
      { reasoningEffort: 'ultra' },
      { reasoningEffort: 'future-unsupported-value' },
    ],
  }

  it('creates a selectable model with only the efforts advertised and understood', () => {
    const model = mergeCodexCatalogModel(remote)
    expect(model).toMatchObject({
      id: 'openai-codex-gpt-5.6-sol',
      apiModel: 'gpt-5.6-sol',
      displayName: 'GPT-5.6-Sol',
      thinking: true,
      thinkingLevel: 'low',
      supportsAgent: true,
      supportsImages: false,
      supportsSandboxing: true,
      defaultOn: true,
      parameters: { reasoning: ['low', 'medium', 'ultra'] },
    })
    expect(remoteCodexModelLabel(remote)).toContain('low / medium / ultra')
  })

  it('preserves an existing user-selected effort when the model still supports it', () => {
    const model = mergeCodexCatalogModel(remote, {
      id: 'stable-id',
      apiModel: 'gpt-5.6-sol',
      displayName: 'Old name',
      thinking: true,
      thinkingLevel: 'ultra',
      contextTokenLimit: 300000,
      maxOutputTokens: 16000,
      defaultOn: false,
    })
    expect(model).toMatchObject({
      id: 'stable-id',
      thinkingLevel: 'ultra',
      contextTokenLimit: 300000,
      maxOutputTokens: 16000,
      defaultOn: false,
    })
  })
})
