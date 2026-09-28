const path = require('node:path');

const expoPreset = require('jest-expo/jest-preset');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../../..');

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

// `intl-messageformat` (qua `use-intl`) có `static { … }` trong class: Babel 7 phải được BẢO mới
// parse được, nếu không cả suite chết lúc parse. Chỉ ở đây — Metro đi đường transform riêng.
const nodeModulesSyntaxPlugins = [require.resolve('@babel/plugin-transform-class-static-block')];


module.exports = {
  ...expoPreset,
  // Test của phần DÙNG CHUNG chạy trong ngữ cảnh của TỪNG app: shared/src không có jest
  // runner riêng, và overlay @/ làm cùng một test có thể ra hai kết quả ở hai app.
  roots: ['<rootDir>', '<rootDir>/../shared/src'],
  /**
   * Suite của các MÀN THUỘC APP CUSTOMER — menu tài khoản khách + tab Tài khoản render thật.
   * App Partner không đăng ký khu `/account/**` (mọi `ROUTES.account.*` ngoài nhóm auth là
   * fallback `/not-available`), nên chạy chúng ở đây chỉ kiểm một bối cảnh không tồn tại;
   * nhà của chúng là `apps/mobile/customer`.
   */
  testPathIgnorePatterns: [
    '/shared/src/features/account/account-nav\\.test\\.ts$',
    '/shared/src/features/account/AccountScreen\\.test\\.tsx$',
  ],
  // jest-expo tự đọc `paths` của tsconfig cho moduleNameMapper — đừng khai lại, sẽ mất alias.
  restoreMocks: true,
  setupFilesAfterEnv: [...(expoPreset.setupFilesAfterEnv ?? []), '<rootDir>/../shared/jest.setup.js'],

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
    /*
     * `.mjs` KHÔNG nằm trong pattern của jest-expo (chỉ `.ts/.tsx/.js/.jsx`) — phải khai riêng.
     *
     * `transformIgnorePatterns: []` ở trên chỉ quyết định cái gì được PHÉP transform; cái gì
     * THẬT SỰ được transform lại do `transform` quyết. File không khớp pattern nào thì Jest nạp
     * thô, và một package ESM-only ném `SyntaxError: Unexpected token export` từ trong lòng
     * thư viện.
     *
     * Gặp thật khi mobile chuyển sang `firebase@12`: `@firebase/util` ship thêm
     * `dist/postinstall.mjs`. Metro không dính vì nó đi đường transform riêng — chỉ Jest.
     */
    ['\\.mjs$']: [
      transformerPath,
      {
        ...transformerOptions,
        ...babelConfig,
        plugins: [...(babelConfig.plugins ?? []), ...nodeModulesSyntaxPlugins],
        root: workspaceRoot,
        configFile: false,
        babelrc: false,
      },
    ],
    [scriptPattern]: [
      transformerPath,
      {
        ...transformerOptions,
        ...babelConfig,
        plugins: [...(babelConfig.plugins ?? []), ...nodeModulesSyntaxPlugins],
        root: workspaceRoot,
        configFile: false,
        babelrc: false,
      },
    ],
  },
};
