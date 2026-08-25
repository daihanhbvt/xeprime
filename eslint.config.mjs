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
      'apps/*/src/main.ts',
      'apps/*/src/openapi.ts',
    ],
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
