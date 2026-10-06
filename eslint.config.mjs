import base from './packages/config/eslint/base.mjs';
import { noDirectDayjsImport } from './packages/config/eslint/datetime.mjs';
import { reactOverlays } from './packages/config/eslint/react.mjs';

const REACT_FILES = [
  'apps/web/**/*.{ts,tsx}',
  'apps/mobile/**/*.{ts,tsx}',
  'packages/ui/**/*.{ts,tsx}',
];

/**
 * Site khách và site partner KHÔNG import màn của site quản trị (ADR 0051). Mở rộng bộ tuỳ chọn
 * `no-restricted-imports` của `reactOverlays` — flat config ghi đè cả rule khi khai lại.
 */
function webZoneBoundary() {
  const base =
    reactOverlays
      .map((overlay) => overlay.rules?.['no-restricted-imports'])
      .filter(Array.isArray)
      .at(-1)?.[1] ?? {};
  return {
    files: [
      'apps/web/src/app/(public)/**/*.{ts,tsx}',
      'apps/web/src/app/(auth)/**/*.{ts,tsx}',
      'apps/web/src/app/(manage)/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          ...base,
          patterns: [
            ...(base.patterns ?? []),
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
}

/**
 * Root flat config. ESLint walks up from each file, so running `eslint .` inside
 * any workspace package picks this up — no per-package config duplication.
 */
export default [
  ...base,

  // Code React (web + mobile): react-hooks + các thư viện bị cấm theo ADR.
  ...reactOverlays.map((overlay) => ({ files: REACT_FILES, ...overlay })),

  // Ranh giới ba site của apps/web (ADR 0051) — cùng luật với `apps/web/eslint.config.mjs`, để
  // lint-staged (chạy từ gốc) chặn đúng như `pnpm --filter @xeprime/web lint`.
  webZoneBoundary(),

  /*
   * CLAUDE.md §9 — ngày giờ đi qua MỘT cửa (định nghĩa: packages/config/eslint/datetime.mjs).
   *
   * apps/web + apps/mobile + packages/ui đã nhận rule này qua `reactOverlays`; ở đây chỉ thêm
   * `packages/domain` (không phải code React nên không nằm trong REACT_FILES), trừ đúng file
   * định nghĩa cái cửa đó.
   */
  {
    files: ['packages/domain/src/**/*.ts'],
    ...noDirectDayjsImport,
    ignores: [...noDirectDayjsImport.ignores, 'packages/domain/src/datetime.ts'],
  },

  // Seed và script CLI được phép in tiến trình ra stdout.
  {
    files: [
      'prisma/src/seed.ts',
      'prisma/src/cleanup-test-data.ts',
      // Kiểm bất biến realm (ADR 0053) — báo cáo ĐẠT/KHÔNG ĐẠT ngay trên terminal.
      'prisma/src/check-realm-invariants.ts',
      'scripts/**/*.ts',
      // Script CLI của từng app (vd `apps/worker/src/scripts/sync-holidays.ts`) — người vận
      // hành gõ tay và đọc kết quả ngay trên terminal, nên stdout LÀ giao diện của chúng.
      'apps/*/src/scripts/**/*.ts',
      // Script sinh mã/tài nguyên chạy bằng Node thuần (`node scripts/*.mjs`).
      '**/scripts/**/*.mjs',
      'apps/*/src/main.ts',
      'apps/*/src/openapi.ts',
    ],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
    rules: { 'no-console': 'off' },
  },

  // File cấu hình `.js`/`.cjs` chạy trong Node dạng CommonJS: khai báo sourceType để
  // `module`/`exports`/`require`/`__dirname` được coi là global hợp lệ.
  {
    files: ['**/*.{js,cjs}'],
    languageOptions: { sourceType: 'commonjs' },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
    },
  },
];
