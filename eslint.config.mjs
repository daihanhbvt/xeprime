import base from './packages/config/eslint/base.mjs';
import { reactOverlays } from './packages/config/eslint/react.mjs';

const REACT_FILES = [
  'apps/web/**/*.{ts,tsx}',
  'apps/mobile/**/*.{ts,tsx}',
  'packages/ui/**/*.{ts,tsx}',
];

/**
 * Root flat config. ESLint walks up from each file, so running `eslint .` inside
 * any workspace package picks this up — no per-package config duplication.
 */
export default [
  ...base,

  // Code React (web + mobile): react-hooks + các thư viện bị cấm theo ADR.
  ...reactOverlays.map((overlay) => ({ files: REACT_FILES, ...overlay })),

  // Seed và script CLI được phép in tiến trình ra stdout.
  {
    files: [
      'prisma/src/seed.ts',
      'prisma/src/cleanup-test-data.ts',
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
