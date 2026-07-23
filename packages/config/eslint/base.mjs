import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Shared flat-config for every XePrime package.
 *
 * Deliberately NOT type-aware (no `projectService`): type errors are already caught
 * by `pnpm typecheck` running tsc across the workspace, and type-aware linting in a
 * pnpm monorepo is slow and brittle. Revisit once the codebase stabilises.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.generated.ts',
      'prisma/generated/**',
      'prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // CLAUDE.md mục 5: `any` phải có comment lý do. eslint-disable với lý do là
      // cách duy nhất được chấp nhận — quy tắc này làm việc đó thành bắt buộc.
      '@typescript-eslint/no-explicit-any': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'no-restricted-syntax': [
        'error',
        {
          // ADR 0002: nhét quyền vào token làm việc thu hồi quyền mất hiệu lực.
          selector: "Property[key.name=/^(permissions|roles|tenantId|tenant_id)$/][parent.parent.callee.name='sign']",
          message:
            'ADR 0002: session JWT chỉ chứa userId + sessionId. Quyền/tenant đọc từ DB mỗi request.',
        },
      ],
    },
  },
  prettier,
);
