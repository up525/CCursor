import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const LOCAL_ISSUER = 'ccursor-byok';
const LOCAL_SUBJECT = 'fake-user';
const LOCAL_REFRESH_TOKEN = 'ccursor-local-refresh-token';
const SEED_MARKER_KEY = 'ccursor/byokAuthSeeded';

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function buildLocalByokJwt(nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = encodeJson({ alg: 'none', typ: 'JWT' });
  const payload = encodeJson({
    iss: LOCAL_ISSUER,
    sub: LOCAL_SUBJECT,
    aud: ['cursor'],
    iat: nowSeconds,
    exp: 4102444800,
    azp: LOCAL_ISSUER,
    scope: 'byok',
  });
  return `${header}.${payload}.`;
}

export function getCursorStateDbPath(
  platform = process.platform,
  home = homedir(),
  env = process.env,
) {
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  if (platform === 'win32') {
    return join(env.APPDATA || join(home, 'AppData', 'Roaming'), 'Cursor', 'User', 'globalStorage', 'state.vscdb');
  }
  return join(env.XDG_CONFIG_HOME || join(home, '.config'), 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

function sqliteExecutable(platform, fileExists) {
  return platform === 'darwin' && fileExists('/usr/bin/sqlite3') ? '/usr/bin/sqlite3' : 'sqlite3';
}

function readFlag(run, executable, stateDb, sql) {
  return run(executable, ['-readonly', '-cmd', '.timeout 5000', stateDb, sql], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim() === '1';
}

function hasStoredValue(run, executable, stateDb, key) {
  return readFlag(
    run,
    executable,
    stateDb,
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ItemTable WHERE key='${key}' AND length(value)>0) THEN 1 ELSE 0 END`,
  );
}

function hasExactValue(run, executable, stateDb, key, expected) {
  return readFlag(
    run,
    executable,
    stateDb,
    `SELECT CASE WHEN EXISTS(SELECT 1 FROM ItemTable WHERE key='${key}' AND value='${expected}') THEN 1 ELSE 0 END`,
  );
}

function executeSql(run, executable, stateDb, sql) {
  run(executable, ['-cmd', '.timeout 5000', stateDb, sql], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Seed Cursor's own smoke-test token shape only when no Cursor login exists.
 * This removes the renderer's login gate while redirected AI calls stay local.
 * No OpenAI or Cursor credential is read or copied.
 */
export function seedLocalByokAuth(log, {
  platform = process.platform,
  stateDb = getCursorStateDbPath(),
  fileExists = existsSync,
  run = execFileSync,
  nowSeconds,
} = {}) {
  if (!fileExists(stateDb)) {
    log?.('  [auth] Cursor state database not found; local BYOK identity will be seeded after first launch');
    return false;
  }

  const executable = sqliteExecutable(platform, fileExists);
  try {
    const markedLocal = hasExactValue(run, executable, stateDb, SEED_MARKER_KEY, '1');
    const hasLocalRefresh = hasExactValue(
      run, executable, stateDb, 'cursorAuth/refreshToken', LOCAL_REFRESH_TOKEN,
    );
    const hasAccess = hasStoredValue(run, executable, stateDb, 'cursorAuth/accessToken');
    const hasRefresh = hasStoredValue(run, executable, stateDb, 'cursorAuth/refreshToken');
    if (!(markedLocal && hasLocalRefresh) && (hasAccess || hasRefresh)) {
      if (markedLocal)
        executeSql(run, executable, stateDb, `DELETE FROM ItemTable WHERE key='${SEED_MARKER_KEY}';`);
      log?.('  [auth] Existing Cursor account session found, keep');
      return false;
    }

    const jwt = buildLocalByokJwt(nowSeconds);
    const sql = `
BEGIN IMMEDIATE;
INSERT INTO ItemTable(key,value) VALUES('cursorAuth/accessToken','${jwt}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO ItemTable(key,value) VALUES('cursorAuth/refreshToken','${LOCAL_REFRESH_TOKEN}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO ItemTable(key,value) VALUES('cursorAuth/stripeMembershipType','ultra') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO ItemTable(key,value) VALUES('cursorAuth/stripeMembershipAuthId','${LOCAL_SUBJECT}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO ItemTable(key,value) VALUES('cursorAuth/stripeSubscriptionStatus','active') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO ItemTable(key,value) VALUES('cursorAuth/cachedEmail','byok@local.invalid') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO ItemTable(key,value) VALUES('glass.lastSignedInAuthId','${LOCAL_SUBJECT}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO ItemTable(key,value) VALUES('${SEED_MARKER_KEY}','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
COMMIT;`;
    executeSql(run, executable, stateDb, sql);
    log?.('  [auth] Local BYOK identity ready (no Cursor login required)');
    return true;
  } catch (error) {
    log?.(`  [auth] Unable to seed local BYOK identity: ${error.message}`);
    return false;
  }
}

/** Remove only credentials that are still recognisably ours. */
export function clearLocalByokAuth(log, {
  platform = process.platform,
  stateDb = getCursorStateDbPath(),
  fileExists = existsSync,
  run = execFileSync,
} = {}) {
  if (!fileExists(stateDb)) return false;
  const executable = sqliteExecutable(platform, fileExists);

  try {
    const markedLocal = hasExactValue(run, executable, stateDb, SEED_MARKER_KEY, '1');
    if (!markedLocal) return false;
    const hasLocalRefresh = hasExactValue(
      run, executable, stateDb, 'cursorAuth/refreshToken', LOCAL_REFRESH_TOKEN,
    );
    if (!hasLocalRefresh) {
      executeSql(run, executable, stateDb, `DELETE FROM ItemTable WHERE key='${SEED_MARKER_KEY}';`);
      log?.('  [auth] Real Cursor account session detected, keep');
      return false;
    }

    const sql = `
BEGIN IMMEDIATE;
DELETE FROM ItemTable WHERE key IN ('cursorAuth/accessToken','cursorAuth/refreshToken','cursorAuth/stripeMembershipAuthId','cursorAuth/stripeSubscriptionStatus','${SEED_MARKER_KEY}');
INSERT INTO ItemTable(key,value) VALUES('cursorAuth/stripeMembershipType','free') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO ItemTable(key,value) VALUES('cursorAuth/cachedEmail','') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
INSERT INTO ItemTable(key,value) VALUES('glass.lastSignedInAuthId','signed-out') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
COMMIT;`;
    executeSql(run, executable, stateDb, sql);
    log?.('  [auth] Removed local BYOK identity');
    return true;
  } catch (error) {
    log?.(`  [auth] Unable to remove local BYOK identity: ${error.message}`);
    return false;
  }
}
