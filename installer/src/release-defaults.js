/**
 * Install 时释放默认资源到 ~/.ccursor/
 *
 * 释放内容:
 *   - routes.json         ← DEFAULT_ROUTES (强制覆盖:白名单由开发者编排,非用户数据)
 *   - providers.json      ← DEFAULT_PROVIDERS (keep-if-exists:用户 API Key 不能丢)
 *   - models-catalog.json ← 从 installer 自带的 assets 复制 (models.dev 快照,强制覆盖)
 *
 * routes.json 强制覆盖的理由:
 *   redirect 数组由我们主动编排,用户不应手改;每次 install 都会拿到最新白名单,
 *   保证新版扩展增删的方法/REST 路径能立即生效。用户的 byokMode / host / port 偏好
 *   由运行时切换 (toggleByokMode / 设置面板) 维护,install 是显式动作,重置回默认可接受。
 *
 * byokMode 固定开启:
 *   Cursor++ 的本地 BYOK 路由不依赖 Cursor 账号。安装后始终以 byokMode: 1
 *   启动并释放完整重定向白名单，用户无需先完成 Cursor 登录或 onboarding。
 */
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  MODELS_CATALOG_FILE_NAME,
  PROVIDERS_FILE_NAME,
  ROUTES_FILE_NAME,
  WEB_TOOLS_FILE_NAME,
  DEFAULT_PROVIDERS,
  DEFAULT_ROUTES,
  DEFAULT_WEB_TOOLS,
  DEFAULT_REDIRECT,
} from './defaults.js';
import { CCURSOR_DIR } from './routes.js';

function release(filename, content, log, { force = false } = {}) {
  const dest = join(CCURSOR_DIR, filename);
  if (!force && existsSync(dest)) {
    log?.(`  ${filename} already exists, keep`);
    return false;
  }
  const existed = existsSync(dest);
  writeFileSync(dest, JSON.stringify(content, null, 2) + '\n', 'utf-8');
  log?.(`  ${filename} ${existed ? 'overwritten' : 'released'}`);
  return true;
}

// 打包后 __dirname 指向 cli.cjs 所在目录 (installer/dist/),
// 与之同级存放 models-catalog.json (esbuild.js 构建时复制)。
// 开发模式从 src/ 直接跑时 fallback 到 src/../assets/
function resolveAssetPath(filename) {
  const candidates = [
    join(__dirname, filename),                  // bundled: dist/<file>
    join(__dirname, '..', 'assets', filename),  // dev: src/../assets/<file>
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function copyAsset(filename, log, { force = false } = {}) {
  const dest = join(CCURSOR_DIR, filename);
  if (!force && existsSync(dest)) {
    log?.(`  ${filename} already exists, keep`);
    return false;
  }
  const src = resolveAssetPath(filename);
  if (!src) {
    log?.(`  ${filename} asset not bundled, skip`);
    return false;
  }
  const existed = existsSync(dest);
  copyFileSync(src, dest);
  const size = (readFileSync(dest).length / 1024).toFixed(1);
  log?.(`  ${filename} ${existed ? 'updated' : 'released'} (${size} KB)`);
  return true;
}

export function releaseDefaults(log) {
  log?.('[defaults] Releasing to ~/.ccursor/...');
  mkdirSync(CCURSOR_DIR, { recursive: true });

  const routes = {
    ...DEFAULT_ROUTES,
    byokMode: 1,
    redirect: [...DEFAULT_REDIRECT],
  };
  release(ROUTES_FILE_NAME, routes, log, { force: true });
  release(PROVIDERS_FILE_NAME, DEFAULT_PROVIDERS, log);
  release(WEB_TOOLS_FILE_NAME, DEFAULT_WEB_TOOLS, log);
  copyAsset(MODELS_CATALOG_FILE_NAME, log, { force: true });

  log?.('[defaults] Done');
}
