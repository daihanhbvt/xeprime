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

export default [
  { ignores: ['.next/**', 'next-env.d.ts', 'coverage/**'] },
  ...react,
  ...nextConfigs,
  {
    files: ['*.config.{ts,mts,mjs}'],
    rules: { 'no-console': 'off' },
  },
];
