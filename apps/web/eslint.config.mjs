import react from '../../packages/config/eslint/react.mjs';

/**
 * Config của apps/web.
 *
 * Không re-export thẳng `eslint.config.mjs` ở root: flat config lấy basePath theo thư mục
 * chứa file config, nên pattern `apps/web/**` trong root sẽ không khớp gì khi chạy
 * `eslint .` tại đây. `react.mjs` chính là (base + rule frontend) mà root áp cho apps/web.
 */
let nextConfigs = [];
try {
  const mod = await import('eslint-config-next');
  const candidate = mod.default ?? mod;
  if (Array.isArray(candidate)) {
    nextConfigs = candidate;
  }
} catch {
  // eslint-config-next chưa export flat config -> bỏ qua, rule core vẫn chạy đủ.
}

/**
 * Tuỳ chọn `no-restricted-imports` chung của frontend (`react.mjs`). Flat config GHI ĐÈ cả rule khi
 * một khối sau khai lại nó, nên khối ranh giới dưới MỞ RỘNG đúng bộ tuỳ chọn này thay vì viết lại.
 */
const baseRestricted =
  react
    .map((config) => config.rules?.['no-restricted-imports'])
    .filter(Array.isArray)
    .at(-1)?.[1] ?? {};

/**
 * Ranh giới BA SITE (ADR 0051): site khách và site partner KHÔNG import màn của site quản trị. Chiều
 * ngược lại được phép — site quản trị dùng lại view partner trong phiên hỗ trợ gian hàng (ADR 0050).
 * `features/tenant-support` là hạ tầng phiên dùng chung (view partner đọc nó), không nằm trong rào.
 */
const zoneBoundary = {
  files: ['src/app/(public)/**', 'src/app/(auth)/**', 'src/app/(manage)/**'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        ...baseRestricted,
        patterns: [
          ...(baseRestricted.patterns ?? []),
          {
            group: [
              '@/features/admin-*',
              '@/features/admin-*/**',
              '@/features/platform-*',
              '@/features/platform-*/**',
            ],
            message:
              'ADR 0051: site khách và site partner không import màn của site quản trị (features/admin-*, features/platform-*).',
          },
        ],
      },
    ],
  },
};

const config = [
  { ignores: ['.next/**', 'next-env.d.ts', 'coverage/**'] },
  ...react,
  ...nextConfigs,
  zoneBoundary,
  {
    files: ['*.config.{ts,mts,mjs}'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
