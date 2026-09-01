import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearMacOSQuarantine,
  findMacAppBundle,
  repairMacOSSignature,
} from './macos-quarantine.js';

test('findMacAppBundle resolves the nearest application ancestor', () => {
  assert.equal(
    findMacAppBundle('/Applications/Cursor.app/Contents/Resources/app'),
    '/Applications/Cursor.app',
  );
  assert.equal(findMacAppBundle('/tmp/not-an-app'), null);
});

test('clearMacOSQuarantine checks then removes only the quarantine attribute', () => {
  const calls = [];
  const logs = [];
  const changed = clearMacOSQuarantine(
    '/Applications/Cursor.app/Contents/Resources/app',
    message => logs.push(message),
    {
      platform: 'darwin',
      run: (executable, args) => {
        calls.push([executable, args]);
        return '0381;download;Chrome;';
      },
    },
  );

  assert.equal(changed, true);
  assert.deepEqual(calls, [
    ['/usr/bin/xattr', ['-p', 'com.apple.quarantine', '/Applications/Cursor.app']],
    ['/usr/bin/xattr', ['-dr', 'com.apple.quarantine', '/Applications/Cursor.app']],
  ]);
  assert.match(logs[0], /Removed quarantine marker/);
});

test('repairMacOSSignature re-seals an invalid outer bundle and verifies it', () => {
  const calls = [];
  let verifyCount = 0;
  const changed = repairMacOSSignature(
    '/Applications/Cursor.app/Contents/Resources/app',
    null,
    {
      platform: 'darwin',
      run: (executable, args) => {
        calls.push([executable, args]);
        if (args[0] === '--verify' && verifyCount++ === 0) {
          throw new Error('sealed resource is invalid');
        }
      },
    },
  );

  assert.equal(changed, true);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1], [
    '/usr/bin/codesign',
    [
      '--force',
      '--deep',
      '--sign', '-',
      '--preserve-metadata=identifier,entitlements',
      '/Applications/Cursor.app',
    ],
  ]);
  assert.equal(calls[2][1][0], '--verify');
});

test('repairMacOSSignature leaves an already valid bundle unchanged', () => {
  let calls = 0;
  assert.equal(repairMacOSSignature('/Applications/Cursor.app/x', null, {
    platform: 'darwin',
    run: () => { calls += 1; },
  }), false);
  assert.equal(calls, 1);
});

test('clearMacOSQuarantine is a no-op outside macOS or without the attribute', () => {
  let calls = 0;
  const run = () => {
    calls += 1;
    throw new Error('attribute missing');
  };

  assert.equal(clearMacOSQuarantine('/Applications/Cursor.app/x', null, { platform: 'linux', run }), false);
  assert.equal(calls, 0);
  assert.equal(clearMacOSQuarantine('/Applications/Cursor.app/x', null, { platform: 'darwin', run }), false);
  assert.equal(calls, 1);
});
