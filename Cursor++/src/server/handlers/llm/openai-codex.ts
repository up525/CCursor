/**
 * OpenAI Codex provider backed by the official Codex CLI.
 *
 * Authentication remains entirely inside the official client. Cursor++ never
 * reads, copies, or persists ChatGPT OAuth tokens; it only starts `codex exec`
 * after `codex login status` confirms that the user is signed in.
 */
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { ProviderEntry } from '../../data/defaults'
import { logger } from '../../logger'
import { probeCodexAuth, resolveCodexExecutable, spawnCodex } from './codexCli'
import type { LLMContentBlock, LLMMessage, LLMProvider, LLMStreamEvent, LLMStreamRequest, LLMUsage } from './types'

interface CodexJsonEvent {
  type?: string
  item?: {
    type?: string
    text?: string
  }
  message?: string
  error?: { message?: string }
  usage?: {
    input_tokens?: number
    cached_input_tokens?: number
    cache_write_input_tokens?: number
    output_tokens?: number
    reasoning_output_tokens?: number
  }
}

function stringifyContentBlock(block: LLMContentBlock): string {
  switch (block.type) {
    case 'text':
      return block.text
    case 'thinking':
      return block.text ? `[Prior assistant reasoning summary]\n${block.text}` : ''
    case 'tool_use':
      return `[Prior host tool call: ${block.name}]\n${JSON.stringify(block.input)}`
    case 'tool_result':
      return `[Prior host tool result: ${block.toolName ?? block.toolUseId}]\n${block.content}`
    case 'image':
      return `[An image (${block.mimeType}) was attached in the host conversation but cannot be forwarded by this provider version.]`
  }
}

function stringifyMessage(message: LLMMessage): string {
  let content = typeof message.content === 'string'
    ? message.content
    : message.content.map(stringifyContentBlock).filter(Boolean).join('\n\n')
  if (message.role === 'tool')
    content = `[Prior host tool result: ${message.toolName ?? message.toolCallId ?? 'unknown'}]\n${content}`
  return `<message role="${message.role}">\n${content}\n</message>`
}

/** Serialize the host transcript into one official Codex turn. */
export function serializeCodexPrompt(messages: LLMMessage[]): string {
  return [
    'You are responding to a conversation initiated in Cursor IDE through Cursor++.',
    'Use the latest user request as the task. Earlier messages are context and may include host-generated instructions or prior tool results.',
    'When you edit files, operate in the working directory supplied by the host. Return a concise final answer for the user.',
    '',
    '<ccursor_conversation>',
    ...messages.map(stringifyMessage),
    '</ccursor_conversation>',
  ].join('\n')
}

function normalizeAgentMode(mode?: string): string {
  return (mode ?? '').replace('AGENT_MODE_', '').toLowerCase()
}

/** Exported for deterministic unit coverage of CLI safety flags. */
export function buildCodexExecArgs(request: LLMStreamRequest): string[] {
  const workingDirectory = request.workingDirectory || process.cwd()
  const mode = normalizeAgentMode(request.agentMode)
  const sandbox = mode === 'agent' || mode === 'debug' ? 'workspace-write' : 'read-only'
  const args = [
    'exec',
    '--json',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox', sandbox,
    '--cd', workingDirectory,
    '--config', 'approval_policy="never"',
  ]
  if (request.model.trim())
    args.push('--model', request.model.trim())
  if (request.thinkingLevel)
    args.push('--config', `model_reasoning_effort="${request.thinkingLevel}"`)
  else if (request.thinking === false)
    // Codex reasoning models do not expose a literal "off" mode; minimal is
    // the official CLI's closest safe equivalent when the host disables it.
    args.push('--config', 'model_reasoning_effort="minimal"')
  args.push('-')
  return args
}

function asUsage(event: CodexJsonEvent): LLMUsage {
  return {
    inputTokens: event.usage?.input_tokens ?? 0,
    outputTokens: event.usage?.output_tokens ?? 0,
    ...(event.usage?.cached_input_tokens ? { cacheReadTokens: event.usage.cached_input_tokens } : {}),
    ...(event.usage?.cache_write_input_tokens ? { cacheWriteTokens: event.usage.cache_write_input_tokens } : {}),
  }
}

function errorText(event: CodexJsonEvent): string {
  return event.error?.message || event.message || 'OpenAI Codex turn failed.'
}

export class OpenAICodexProvider implements LLMProvider {
  readonly name = 'openai-codex'
  private readonly executableOverride?: string

  constructor(entry: ProviderEntry) {
    this.executableOverride = entry.codexPath?.trim() || undefined
  }

  async *stream(request: LLMStreamRequest): AsyncIterable<LLMStreamEvent> {
    const probe = await probeCodexAuth(this.executableOverride)
    if (!probe.available) {
      throw new Error(`404 OpenAI Codex CLI not found. ${probe.detail}`)
    }
    if (!probe.authenticated) {
      throw new Error(`401 OpenAI Codex CLI is not logged in. ${probe.detail} Open Cursor++ and choose “Sign in with ChatGPT”.`)
    }

    const executable = probe.executable ?? await resolveCodexExecutable(this.executableOverride)
    if (!executable)
      throw new Error('404 OpenAI Codex CLI executable disappeared after the authentication check.')

    const child = spawnCodex(executable, buildCodexExecArgs(request)) as ChildProcessWithoutNullStreams
    const stdout = createInterface({ input: child.stdout, crlfDelay: Infinity })
    let stderr = ''
    let completed = false
    let failure: Error | null = null
    let usage: LLMUsage = { inputTokens: 0, outputTokens: 0 }

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-16_384)
    })

    const exitResult = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })

    child.stdin.end(serializeCodexPrompt(request.messages))

    try {
      for await (const line of stdout) {
        const trimmed = line.trim()
        if (!trimmed)
          continue
        let event: CodexJsonEvent
        try {
          event = JSON.parse(trimmed) as CodexJsonEvent
        }
        catch {
          logger.debug({ line: trimmed.slice(0, 500) }, '[OPENAI_CODEX] ignored non-JSON stdout')
          continue
        }

        if (event.type === 'item.completed' && event.item?.type === 'reasoning' && event.item.text) {
          yield { type: 'thinking_delta', text: event.item.text }
          yield { type: 'thinking_done' }
        }
        else if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
          yield { type: 'text_delta', text: event.item.text }
        }
        else if (event.type === 'turn.completed') {
          usage = asUsage(event)
          completed = true
        }
        else if (event.type === 'turn.failed' || event.type === 'error') {
          failure = new Error(errorText(event))
        }
      }

      const exitCode = await exitResult
      if (failure)
        throw failure
      if (exitCode !== 0 || !completed) {
        const detail = stderr.trim() || `Codex CLI exited with code ${exitCode ?? 'unknown'} before turn completion.`
        throw new Error(detail)
      }
      yield { type: 'done', usage, stopReason: 'end_turn' }
    }
    finally {
      stdout.close()
      if (child.exitCode === null)
        child.kill()
    }
  }
}
