const fs = require('node:fs');
const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const { createStgProxyMiddleware } = require('../shared/scripts/stg-proxy-middleware');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../shared');
const workspaceRoot = path.resolve(projectRoot, '../../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  sharedRoot,
  path.resolve(workspaceRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'packages'),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// KHÔNG bật `resolver.disableHierarchicalLookup`. Tài liệu monorepo của Expo đề xuất nó
// cho layout hoisted (yarn/npm); với pnpm nó phá resolve vì dep của mỗi package nằm ở
// `node_modules/.pnpm/<pkg>@<ver>/node_modules/*` — Metro phải đi lên thư mục cha từ
// đường dẫn thật của module mới thấy. Tắt là MODULE_NOT_FOUND hàng loạt.

/**
 * OVERLAY alias `@/` (tách app 25/09/2026): thử `<app>/src/<x>` trước (bản riêng — routes.ts,
 * app-profile.ts), không có thì rơi về `<shared>/src/<x>`. Cùng phép với `paths` trong
 * tsconfig.json — hai bên phải nói MỘT thứ tiếng, nếu không typecheck xanh mà bundle đỏ.
 */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json'];
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@/')) {
    const rest = moduleName.slice(2);
    for (const root of [projectRoot, sharedRoot]) {
      const base = path.join(root, 'src', rest);
      const candidates = [
        ...SOURCE_EXTENSIONS.map((ext) => base + ext),
        ...SOURCE_EXTENSIONS.map((ext) => path.join(base, 'index' + ext)),
      ];
      const hit = candidates.find((candidate) => fs.existsSync(candidate));
      if (hit) return { type: 'sourceFile', filePath: hit };
    }
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

/**
 * Proxy `/api/stg/*` → staging, CHỈ tồn tại ở dev server. Lý do đầy đủ ở
 * `../shared/scripts/stg-proxy-middleware.js`.
 */
config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware) => createStgProxyMiddleware(metroMiddleware),
};

module.exports = config;
