import { describe, expect, it } from 'vitest'
import { normalizeCodexModels, resolveCodexExecutable } from '../handlers/llm/codexCli'
import { buildCodexExecArgs, serializeCodexPrompt } from '../handlers/llm/openai-codex'

describe('openAI Codex provider', () => {
  it('resolves an explicit executable without using a shell', async () => {
    await expect(resolveCodexExecutable(process.execPath)).resolves.toBe(process.execPath)
  })

  it('serializes text and tool history without embedding image bytes', () => {
    const prompt = serializeCodexPrompt([
      { role: 'system', content: 'Follow the host rules.' },
      { role: 'user', content: [{ type: 'text', text: 'Inspect this.' }, { type: 'image', mimeType: 'image/png', data: 'SECRET_BASE64' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'call-1', name: 'Read', input: { path: 'README.md' } }] },
      { role: 'tool', toolCallId: 'call-1', toolName: 'Read', content: 'file contents' },
    ])

    expect(prompt).toContain('<message role="system">')
    expect(prompt).toContain('[Prior host tool call: Read]')
    expect(prompt).toContain('[Prior host tool result: Read]')
    expect(prompt).toContain('An image (image/png) was attached')
    expect(prompt).not.toContain('SECRET_BASE64')
  })

  it('normalizes account-aware model metadata and reasoning choices', () => {
    expect(normalizeCodexModels([
      {
        id: 'gpt-5.6-sol',
        model: 'gpt-5.6-sol',
        displayName: 'GPT-5.6-Sol',
        description: 'Latest frontier agentic coding model.',
        supportedReasoningEfforts: [
          { reasoningEffort: 'low', description: 'Fast' },
          { reasoningEffort: 'ultra', description: 'Delegated' },
        ],
        defaultReasoningEffort: 'low',
        inputModalities: ['text', 'image'],
        isDefault: true,
      },
      { id: '', model: '' },
      null,
    ])).toEqual([{
      id: 'gpt-5.6-sol',
      model: 'gpt-5.6-sol',
      displayName: 'GPT-5.6-Sol',
      description: 'Latest frontier agentic coding model.',
      hidden: false,
      supportedReasoningEfforts: [
        { reasoningEffort: 'low', description: 'Fast' },
        { reasoningEffort: 'ultra', description: 'Delegated' },
      ],
      defaultReasoningEffort: 'low',
      inputModalities: ['text', 'image'],
      supportsPersonality: false,
      isDefault: true,
    }])
  })

  it('uses a non-interactive read-only sandbox outside Agent mode', () => {
    const args = buildCodexExecArgs({
      model: 'gpt-5.6-terra',
      messages: [],
      thinking: true,
      thinkingLevel: 'medium',
      workingDirectory: '/tmp/example-workspace',
      agentMode: 'AGENT_MODE_ASK',
    })

    expect(args).toEqual(expect.arrayContaining([
      '--json',
      '--ephemeral',
      '--sandbox',
      'read-only',
      '--cd',
      '/tmp/example-workspace',
      'approval_policy="never"',
      'model_reasoning_effort="medium"',
    ]))
    expect(args.at(-1)).toBe('-')
  })

  it('allows workspace writes only in Agent mode', () => {
    const args = buildCodexExecArgs({
      model: 'gpt-5.6-terra',
      messages: [],
      workingDirectory: '/tmp/example-workspace',
      agentMode: 'AGENT_MODE_AGENT',
    })
    expect(args).toEqual(expect.arrayContaining(['--sandbox', 'workspace-write']))
  })

  it('maps disabled host reasoning to the CLI minimal effort', () => {
    const args = buildCodexExecArgs({
      model: 'gpt-5.6-terra',
      messages: [],
      thinking: false,
      workingDirectory: '/tmp/example-workspace',
      agentMode: 'AGENT_MODE_ASK',
    })
    expect(args).toContain('model_reasoning_effort="minimal"')
  })

  it('passes Ultra through when the selected model advertises it', () => {
    const args = buildCodexExecArgs({
      model: 'gpt-5.6-sol',
      messages: [],
      thinking: true,
      thinkingLevel: 'ultra',
      workingDirectory: '/tmp/example-workspace',
      agentMode: 'AGENT_MODE_ASK',
    })
    expect(args).toContain('model_reasoning_effort="ultra"')
  })
})
