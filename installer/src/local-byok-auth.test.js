import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLocalByokJwt,
  clearLocalByokAuth,
  getCursorStateDbPath,
  seedLocalByokAuth,
} from './local-byok-auth.js';

test('local BYOK JWT has Cursor-compatible claims and a long expiry', () => {
  const token = buildLocalByokJwt(1234);
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'));
  assert.equal(payload.iss, 'ccursor-byok');
  assert.equal(payload.sub, 'fake-user');
  assert.equal(payload.iat, 1234);
  assert.equal(payload.exp, 4102444800);
});

test('state database paths follow each Cursor platform convention', () => {
  assert.equal(
    getCursorStateDbPath('darwin', '/Users/test', {}),
    '/Users/test/Library/Application Support/Cursor/User/globalStorage/state.vscdb',
  );
  assert.equal(
    getCursorStateDbPath('linux', '/home/test', {}),
    '/home/test/.config/Cursor/User/globalStorage/state.vscdb',
  );
  assert.equal(
    getCursorStateDbPath('win32', 'C:\\Users\\test', { APPDATA: 'D:\\Profile' }),
    'D:\\Profile/Cursor/User/globalStorage/state.vscdb',
  );
});

test('seedLocalByokAuth never overwrites an existing Cursor login', () => {
  let writes = 0;
  const run = (_executable, args) => {
    const sql = args.at(-1);
    if (sql.includes("key='ccursor/byokAuthSeeded'")) return '0\n';
    if (sql.includes("key='cursorAuth/refreshToken'") && sql.includes("value='ccursor-local-refresh-token'")) return '0\n';
    if (sql.includes("key='cursorAuth/accessToken'") && sql.includes('length(value)>0')) return '1\n';
    if (sql.includes("key='cursorAuth/refreshToken'") && sql.includes('length(value)>0')) return '1\n';
    writes += 1;
    return '';
  };
  assert.equal(seedLocalByokAuth(null, {
    platform: 'darwin', stateDb: '/tmp/state.vscdb', fileExists: () => true, run,
  }), false);
  assert.equal(writes, 0);
});

test('seedLocalByokAuth writes a complete local identity when signed out', () => {
  const calls = [];
  const run = (_executable, args) => {
    calls.push(args);
    const sql = args.at(-1);
    if (sql.startsWith('SELECT')) return '0\n';
    return '';
  };
  assert.equal(seedLocalByokAuth(null, {
    platform: 'darwin', stateDb: '/tmp/state.vscdb', fileExists: () => true, run, nowSeconds: 1234,
  }), true);
  const sql = calls.at(-1).at(-1);
  assert.match(sql, /cursorAuth\/accessToken/);
  assert.match(sql, /cursorAuth\/refreshToken/);
  assert.match(sql, /stripeMembershipType','ultra/);
  assert.match(sql, /ccursor\/byokAuthSeeded/);
});

test('clearLocalByokAuth removes only a marked local identity', () => {
  const calls = [];
  const run = (_executable, args) => {
    calls.push(args);
    const sql = args.at(-1);
    if (sql.startsWith('SELECT')) return '1\n';
    return '';
  };
  assert.equal(clearLocalByokAuth(null, {
    platform: 'darwin', stateDb: '/tmp/state.vscdb', fileExists: () => true, run,
  }), true);
  const sql = calls.at(-1).at(-1);
  assert.match(sql, /DELETE FROM ItemTable/);
  assert.match(sql, /stripeMembershipType','free/);
});
