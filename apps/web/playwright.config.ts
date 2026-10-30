import { defineConfig, devices } from '@playwright/test';

/**
 * E2E chạy trên dev server đang mở (`pnpm dev`, cần cả API để có dữ liệu chợ) — không tự dựng
 * server: một lần `next dev` nguội mất vài phút và đè lên server người dùng đang chạy.
 *
 * Trình duyệt mặc định là Edge cài sẵn trên máy dev Windows (khỏi `playwright install`); đổi bằng
 * `E2E_BROWSER_CHANNEL` (vd. `chrome`), hoặc để rỗng để dùng Chromium của Playwright.
 */
const channel = process.env.E2E_BROWSER_CHANNEL ?? 'msedge';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    channel: channel || undefined,
    trace: 'retain-on-failure',
  },
});
