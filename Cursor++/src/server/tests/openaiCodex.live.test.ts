import type { ProviderEntry, ThinkingLevel } from '../data/defaults'
import { describe, expect, it } from 'vitest'
import { listCodexModels } from '../handlers/llm/codexCli'
import { OpenAICodexProvider } from '../handlers/llm/openai-codex'

const liveTest = process.env.CCURSOR_LIVE_CODEX === '1' ? it : it.skip

describe('openAI Codex provider live authentication', () => {
  liveTest('returns a real model response through the official logged-in CLI', { timeout: 120_000 }, async () => {
    const entry: ProviderEntry = {
      id: 'openai-codex-live',
      name: 'OpenAI Codex Live',
      type: 'openai-codex',
      baseUrl: '',
      auth: { kind: 'codex', value: '' },
      models: [],
    }
    const provider = new OpenAICodexProvider(entry)
    const models = await listCodexModels()
    const selectedModel = process.env.CCURSOR_LIVE_CODEX_MODEL
      || models.find(model => model.isDefault)?.model
      || models[0]?.model
    expect(selectedModel).toBeTruthy()
    const reasoning = (process.env.CCURSOR_LIVE_CODEX_REASONING || 'medium') as ThinkingLevel
    const catalogModel = models.find(model => model.model === selectedModel)
    expect(catalogModel?.supportedReasoningEfforts.some(item => item.reasoningEffort === reasoning)).toBe(true)
    let response = ''

    for await (const event of provider.stream({
      model: selectedModel!,
      messages: [{ role: 'user', content: 'Reply with exactly CCURSOR_OPENAI_AUTH_OK and nothing else.' }],
      workingDirectory: process.cwd(),
      agentMode: 'AGENT_MODE_ASK',
      thinking: true,
      thinkingLevel: reasoning,
    })) {
      if (event.type === 'text_delta')
        response += event.text
    }

    expect(response.trim()).toBe('CCURSOR_OPENAI_AUTH_OK')
  })
})
