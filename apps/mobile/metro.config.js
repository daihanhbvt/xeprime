const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

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

module.exports = config;
