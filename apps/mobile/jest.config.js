const path = require('node:path');

const expoPreset = require('jest-expo/jest-preset');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const scriptTransform = Object.entries(expoPreset.transform).find(([pattern]) =>
  pattern.includes('[jt]sx?'),
);

if (!scriptTransform) {
  throw new Error(
    'jest-expo không còn transform cho .ts/.tsx — cập nhật apps/mobile/jest.config.js',
  );
}

const [scriptPattern, [transformerPath, transformerOptions]] = scriptTransform;

/**
 * Preset khai TƯỜNG MINH thay vì để babel tự dò `babel.config.js`.
 *
 * Babel chỉ áp config gốc cho file NẰM TRONG `root`, mà pnpm đặt dependency ở `node_modules`
 * của workspace root — ngoài `apps/mobile`. Để mặc định thì file của thư viện đi qua babel mà
 * KHÔNG có preset nào và ESM còn nguyên. Gọi thẳng `babel.config.js` để chỉ có một nguồn.
 */
const babelConfig = require('./babel.config.js')({ cache: () => undefined });

module.exports = {
  ...expoPreset,
  // jest-expo tự đọc `paths` của tsconfig cho moduleNameMapper — đừng khai lại, sẽ mất alias.
  restoreMocks: true,
  setupFilesAfterEnv: [...(expoPreset.setupFilesAfterEnv ?? []), '<rootDir>/jest.setup.js'],

  /**
   * Transform MỌI thứ, kể cả node_modules.
   *
   * Whitelist theo TÊN package của jest-expo không dùng được với pnpm: đường dẫn thật là
   * `node_modules/.pnpm/<tên>@<ver>/node_modules/<tên>/…`, và kể cả khi thêm tên vào danh
   * sách thì package chỉ phát hành ESM (use-intl) vẫn không được transform — triệu chứng là
   * `SyntaxError: Unexpected token 'export'` ném ra từ trong lòng thư viện.
   *
   * Đổi lại là thời gian transform của lần chạy đầu; babel-jest có cache nên các lần sau
   * không đổi. Muốn siết danh sách này thì phải thử lại với một package ESM-only.
   */
  transformIgnorePatterns: [],

  transform: {
    ...expoPreset.transform,
    [scriptPattern]: [
      transformerPath,
      {
        ...transformerOptions,
        ...babelConfig,
        root: workspaceRoot,
        configFile: false,
        babelrc: false,
      },
    ],
  },
};
