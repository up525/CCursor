import { execFileSync } from 'child_process';
import { basename, dirname, resolve } from 'path';

/** Find the nearest .app ancestor without assuming Cursor's internal layout. */
export function findMacAppBundle(appRoot) {
  let current = resolve(appRoot);
  while (true) {
    if (basename(current).endsWith('.app')) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Re-seal modified resources while retaining the main bundle's metadata. */
export function repairMacOSSignature(
  appRoot,
  log,
  { platform = process.platform, run = execFileSync } = {},
) {
  if (platform !== 'darwin') return false;

  const appBundle = findMacAppBundle(appRoot);
  if (!appBundle) {
    log?.('  [macOS] Cursor .app bundle not found; signature repair skipped');
    return false;
  }

  const verifyArgs = ['--verify', '--deep', '--strict', appBundle];
  try {
    run('/usr/bin/codesign', verifyArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    return false;
  } catch {
    // Expected after the installer changes resources covered by CodeResources.
  }

  // A hardened outer process cannot load nested code signed by a different
  // Team ID. Re-sign the complete hierarchy consistently, preserving component
  // identifiers and entitlements while dropping the old runtime/team binding.
  run('/usr/bin/codesign', [
    '--force',
    '--deep',
    '--sign', '-',
    '--preserve-metadata=identifier,entitlements',
    appBundle,
  ], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
  run('/usr/bin/codesign', verifyArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  log?.(`  [macOS] Re-sealed modified resources in ${appBundle}`);
  return true;
}

/** Remove the download marker after signature repair so Gatekeeper will launch it. */
export function clearMacOSQuarantine(
  appRoot,
  log,
  { platform = process.platform, run = execFileSync } = {},
) {
  if (platform !== 'darwin') return false;

  const appBundle = findMacAppBundle(appRoot);
  if (!appBundle) {
    log?.('  [macOS] Cursor .app bundle not found; quarantine check skipped');
    return false;
  }

  try {
    run('/usr/bin/xattr', ['-p', 'com.apple.quarantine', appBundle], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return false;
  }

  run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', appBundle], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  log?.(`  [macOS] Removed quarantine marker from ${appBundle}`);
  return true;
}
