import { spawn } from 'node:child_process'
import { constants, existsSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, extname, join } from 'node:path'

const DEFAULT_TIMEOUT_MS = 10_000

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
