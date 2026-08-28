const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const { createStgProxyMiddleware } = require('./scripts/stg-proxy-middleware');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
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
 * Proxy `/api/stg/*` → staging, CHỈ tồn tại ở dev server (file này không đi vào bản build native
 * hay bản web đã export). Lý do đầy đủ ở `scripts/stg-proxy-middleware.js`; tóm tắt: bản web của
 * app chạy trong TRÌNH DUYỆT nên vướng CORS của staging, còn iOS/Android thì không.
 *
 * `enhanceMiddleware` đã bị Metro đánh dấu deprecated nhưng Expo CLI vẫn gọi nó rồi bọc stack
 * của mình lên trên (`instantiateMetro.js` của @expo/cli 54). Vị trí đó là thứ ta cần: middleware
 * này chạy TRƯỚC `HistoryFallbackMiddleware`, nếu không `/api/stg/...` sẽ trả về `index.html`
 * của bản web thay vì JSON.
 */
config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware) => createStgProxyMiddleware(metroMiddleware),
};

module.exports = config;
