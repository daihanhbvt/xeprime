import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Polyfill hạ tầng cho jsdom (matchMedia của AntD) — xem vitest.setup.ts.
    setupFiles: ['./vitest.setup.ts'],
    restoreMocks: true,
    /**
     * Mặc định 5s quá chặt cho test trang: mỗi lần render dựng cả một bảng AntD thật, và
     * `getByRole(..., { name })` phải tính accessible name trên toàn cây con. Khi chạy cả bộ
     * song song, vài test chạm 5–7s và fail vì TIMEOUT chứ không phải vì sai — chúng vẫn xanh
     * khi chạy riêng. Nới một lần ở đây thay vì bẻ cong từng test cho vừa đồng hồ.
     */
    testTimeout: 20_000,
  },
});
