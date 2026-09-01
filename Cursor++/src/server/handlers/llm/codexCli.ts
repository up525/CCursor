import { spawn } from 'node:child_process'
import { constants, existsSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, extname, join } from 'node:path'
import { createInterface } from 'node:readline'

const DEFAULT_TIMEOUT_MS = 10_000
const MODEL_LIST_TIMEOUT_MS = 20_000

export interface CodexCommandResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export interface CodexAuthProbe {
  available: boolean
  authenticated: boolean
  executable?: string
  version?: string
  detail: string
}

export interface CodexReasoningEffort {
  reasoningEffort: string
  description?: string
}

export interface CodexCatalogModel {
  id: string
  model: string
  displayName: string
  description?: string
  hidden: boolean
  supportedReasoningEfforts: CodexReasoningEffort[]
  defaultReasoningEffort?: string
  inputModalities: string[]
  supportsPersonality: boolean
  isDefault: boolean
  upgrade?: string
}

interface JsonRpcMessage {
  id?: number
  result?: {
    data?: unknown
    nextCursor?: string | null
  }
  error?: {
    code?: number
    message?: string
  }
}

function executableNames(): string[] {
  return process.platform === 'win32'
    ? ['codex.exe', 'codex.cmd', 'codex.bat', 'codex']
    : ['codex']
}

function standardCandidates(): string[] {
  const home = homedir()
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    return [
      ...(appData ? executableNames().map(name => join(appData, 'npm', name)) : []),
      ...executableNames().map(name => join(home, 'AppData', 'Roaming', 'npm', name)),
    ]
  }
  return [
    join(home, '.local', 'bin', 'codex'),
    join(home, 'bin', 'codex'),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    '/usr/bin/codex',
  ]
}

function pathCandidates(): string[] {
  const pathEntries = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  return pathEntries.flatMap(entry => executableNames().map(name => join(entry, name)))
}

/**
 * Resolve the official Codex CLI without invoking a shell.
 *
 * Cursor launched from Finder often has a reduced PATH on macOS, so the
 * well-known ~/.local/bin and Homebrew locations are checked explicitly.
 */
export async function resolveCodexExecutable(override?: string): Promise<string | null> {
  const expandHome = (candidate: string | undefined) => candidate?.startsWith('~/')
    ? join(homedir(), candidate.slice(2))
    : candidate
  const candidates = [
    expandHome(override?.trim()),
    expandHome(process.env.CCURSOR_CODEX_PATH?.trim()),
    ...pathCandidates(),
    ...standardCandidates(),
  ].filter((candidate): candidate is string => !!candidate)

  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (seen.has(candidate) || !existsSync(candidate))
      continue
    seen.add(candidate)
    try {
      await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
      return candidate
    }
    catch {}
  }
  return null
}

function spawnSpec(executable: string, args: string[]): { command: string, args: string[] } {
  if (process.platform === 'win32' && ['.cmd', '.bat'].includes(extname(executable).toLowerCase())) {
    const commandInterpreter = process.env.ComSpec || 'cmd.exe'
    // Each argument is passed through cmd.exe only because Windows cannot execute
    // npm's .cmd shim directly. Embedded quotes are doubled for cmd parsing.
    const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
    return {
      command: commandInterpreter,
      args: ['/d', '/s', '/c', [quote(executable), ...args.map(quote)].join(' ')],
    }
  }
  return { command: executable, args }
}

export function spawnCodex(executable: string, args: string[]) {
  const spec = spawnSpec(executable, args)
  return spawn(spec.command, spec.args, {
    cwd: undefined,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

export async function runCodexCommand(
  executable: string,
  args: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<CodexCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawnCodex(executable, args)
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (code: number | null) => {
      if (settled)
        return
      settled = true
      if (timer)
        clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    }

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', chunk => stdout += String(chunk))
    child.stderr?.on('data', chunk => stderr += String(chunk))
    child.once('error', (error) => {
      if (settled)
        return
      settled = true
      if (timer)
        clearTimeout(timer)
      reject(error)
    })
    child.once('close', finish)
    child.stdin?.end()

    timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
  })
}

/** Normalize the stable model/list surface and discard malformed catalog rows. */
export function normalizeCodexModels(value: unknown): CodexCatalogModel[] {
  if (!Array.isArray(value))
    return []

  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object')
      return []
    const row = raw as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const model = typeof row.model === 'string' ? row.model.trim() : id
    if (!id || !model)
      return []

    const supportedReasoningEfforts = Array.isArray(row.supportedReasoningEfforts)
      ? row.supportedReasoningEfforts.flatMap((effort) => {
          if (!effort || typeof effort !== 'object')
            return []
          const item = effort as Record<string, unknown>
          const reasoningEffort = typeof item.reasoningEffort === 'string' ? item.reasoningEffort.trim() : ''
          if (!reasoningEffort)
            return []
          return [{
            reasoningEffort,
            ...(typeof item.description === 'string' && item.description.trim()
              ? { description: item.description.trim() }
              : {}),
          }]
        })
      : []

    return [{
      id,
      model,
      displayName: typeof row.displayName === 'string' && row.displayName.trim()
        ? row.displayName.trim()
        : id,
      ...(typeof row.description === 'string' && row.description.trim()
        ? { description: row.description.trim() }
        : {}),
      hidden: row.hidden === true,
      supportedReasoningEfforts,
      ...(typeof row.defaultReasoningEffort === 'string' && row.defaultReasoningEffort.trim()
        ? { defaultReasoningEffort: row.defaultReasoningEffort.trim() }
        : {}),
      inputModalities: Array.isArray(row.inputModalities)
        ? row.inputModalities.filter((item): item is string => typeof item === 'string')
        : ['text', 'image'],
      supportsPersonality: row.supportsPersonality === true,
      isDefault: row.isDefault === true,
      ...(typeof row.upgrade === 'string' && row.upgrade.trim()
        ? { upgrade: row.upgrade.trim() }
        : {}),
    }]
  })
}

/**
 * Ask the official Codex App Server for the models visible to the current
 * ChatGPT login. This keeps model availability and effort presets account-aware
 * instead of hard-coding a release-specific default model.
 */
export async function listCodexModels(override?: string): Promise<CodexCatalogModel[]> {
  const probe = await probeCodexAuth(override)
  if (!probe.available)
    throw new Error(probe.detail)
  if (!probe.authenticated)
    throw new Error(`OpenAI Codex is not signed in. ${probe.detail}`)

  const executable = probe.executable ?? await resolveCodexExecutable(override)
  if (!executable)
    throw new Error('Official Codex CLI executable disappeared after the authentication check.')

  return new Promise((resolve, reject) => {
    const child = spawnCodex(executable, ['app-server'])
    const stdout = createInterface({ input: child.stdout, crlfDelay: Infinity })
    const models: CodexCatalogModel[] = []
    let stderr = ''
    let settled = false
    let pageRequestId = 1
    let activePageRequestId = 1

    const cleanup = () => {
      clearTimeout(timer)
      stdout.close()
      child.stdin.end()
      if (child.exitCode === null)
        child.kill()
    }
    const fail = (error: Error) => {
      if (settled)
        return
      settled = true
      cleanup()
      reject(error)
    }
    const succeed = () => {
      if (settled)
        return
      settled = true
      const deduped = [...new Map(models.map(model => [model.id, model])).values()]
      cleanup()
      resolve(deduped)
    }
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`)
    const requestPage = (cursor?: string) => {
      activePageRequestId = ++pageRequestId
      send({
        method: 'model/list',
        id: activePageRequestId,
        params: {
          limit: 100,
          includeHidden: false,
          ...(cursor ? { cursor } : {}),
        },
      })
    }

    const timer = setTimeout(() => {
      const detail = stderr.trim() ? ` ${stderr.trim()}` : ''
      fail(new Error(`Timed out while loading models from the official Codex App Server.${detail}`))
    }, MODEL_LIST_TIMEOUT_MS)

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => stderr = `${stderr}${String(chunk)}`.slice(-16_384))
    child.once('error', error => fail(error))
    child.once('close', (code) => {
      if (!settled) {
        const detail = stderr.trim() || `exit code ${code ?? 'unknown'}`
        fail(new Error(`Codex App Server exited before returning models: ${detail}`))
      }
    })

    stdout.on('line', (line) => {
      if (settled || !line.trim())
        return
      let message: JsonRpcMessage
      try {
        message = JSON.parse(line) as JsonRpcMessage
      }
      catch {
        return
      }

      if (message.id === 0) {
        if (message.error) {
          fail(new Error(message.error.message || 'Codex App Server initialization failed.'))
          return
        }
        send({ method: 'initialized', params: {} })
        requestPage()
        return
      }
      if (message.id !== activePageRequestId)
        return
      if (message.error) {
        fail(new Error(message.error.message || `Codex model/list failed (${message.error.code ?? 'unknown'}).`))
        return
      }

      models.push(...normalizeCodexModels(message.result?.data))
      const nextCursor = message.result?.nextCursor
      if (typeof nextCursor === 'string' && nextCursor)
        requestPage(nextCursor)
      else
        succeed()
    })

    send({
      method: 'initialize',
      id: 0,
      params: {
        clientInfo: {
          name: 'ccursor',
          title: 'Cursor++',
          version: '0.0.17',
        },
      },
    })
  })
}

export async function probeCodexAuth(override?: string): Promise<CodexAuthProbe> {
  const executable = await resolveCodexExecutable(override)
  if (!executable) {
    return {
      available: false,
      authenticated: false,
      detail: 'Official Codex CLI not found. Install it with: npm install -g @openai/codex',
    }
  }

  try {
    const [versionResult, authResult] = await Promise.all([
      runCodexCommand(executable, ['--version']),
      runCodexCommand(executable, ['login', 'status']),
    ])
    const version = (versionResult.stdout || versionResult.stderr).trim().split(/\r?\n/)[0]
    const authOutput = `${authResult.stdout}\n${authResult.stderr}`.trim()
    const authenticated = authResult.code === 0 && /logged in/i.test(authOutput)
    return {
      available: true,
      authenticated,
      executable,
      ...(version ? { version } : {}),
      detail: authenticated
        ? authOutput || 'Logged in with the official Codex CLI.'
        : authOutput || 'Codex CLI is installed but is not logged in. Run: codex login',
    }
  }
  catch (error) {
    return {
      available: true,
      authenticated: false,
      executable,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}
