import type { ProviderEntry } from '../data/defaults'
import { describe, expect, it } from 'vitest'
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
    let response = ''

    for await (const event of provider.stream({
      model: process.env.CCURSOR_LIVE_CODEX_MODEL || 'gpt-5.4',
      messages: [{ role: 'user', content: 'Reply with exactly CCURSOR_OPENAI_AUTH_OK and nothing else.' }],
      workingDirectory: process.cwd(),
      agentMode: 'AGENT_MODE_ASK',
      thinking: true,
      thinkingLevel: 'medium',
    })) {
      if (event.type === 'text_delta')
        response += event.text
    }

    expect(response.trim()).toBe('CCURSOR_OPENAI_AUTH_OK')
  })
})
