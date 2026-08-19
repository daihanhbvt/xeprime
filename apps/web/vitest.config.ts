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
    // Polyfill hạ tầng cho jsdom (matchMedia của AntD) — xem vitest.setup.tsx.
    setupFiles: ['./vitest.setup.tsx'],
    restoreMocks: true,
    /**
     * Giới hạn số worker thay vì để vitest lấy gần hết số nhân.
     *
     * Mỗi file test dựng một jsdom riêng và render cả cây Ant Design thật; chạy 15 file như
     * vậy cùng lúc thì các worker giành CPU của nhau và vài test chạm `testTimeout` vì MÁY BẬN
     * chứ không vì sai — đúng những test đó xanh khi chạy riêng. Đây là nguyên nhân gốc của
     * chuyện "chạy lại thì hết đỏ"; nới thêm đồng hồ chỉ giấu nó đi.
     *
     * Bốn worker là con số ĐO ĐƯỢC trên máy 16 nhân: nửa số nhân vẫn còn chập chờn khi vài file
     * nặng (bốn file `search-experience*` mỗi file dựng cả hero + thanh thu gọn) rơi vào cùng
     * một đợt. Chậm hơn vài chục giây nhưng KHÔNG bao giờ đỏ vì máy bận — đổi đúng thứ nên đổi.
     */
    maxWorkers: 4,
    /**
     * Mặc định 5s quá chặt cho test trang: mỗi lần render dựng cả một bảng AntD thật, và
     * `getByRole(..., { name })` phải tính accessible name trên toàn cây con. Khi chạy cả bộ
     * song song, vài test chạm 5–7s và fail vì TIMEOUT chứ không phải vì sai — chúng vẫn xanh
     * khi chạy riêng. Nới một lần ở đây thay vì bẻ cong từng test cho vừa đồng hồ.
     */
    testTimeout: 20_000,
  },
});
