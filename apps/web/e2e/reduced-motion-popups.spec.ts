import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Popup AntD phải hiện và nằm trong khung nhìn ở CẢ HAI chế độ chuyển động.
 *
 * Hồi quy: `globals.css` từng ép `animation-duration: 0.01ms !important` cho mọi phần tử khi
 * `prefers-reduced-motion: reduce`; `@rc-component/motion` lỡ pha căn vị trí và popup kẹt ở toạ
 * độ tạm ngoài màn hình (`inset: -6752px auto auto -4496px`) — bấm chỉ thấy nháy thanh cuộn.
 */

/** Popup đã căn xong: hiện, có kích thước, góc trên-trái nằm trong khung nhìn. */
async function expectInViewport(page: Page, popup: Locator) {
  await expect(popup).toBeVisible();
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('viewport chưa được cấu hình');
  // Căn vị trí chạy bất đồng bộ sau khi popup gắn vào DOM — đợi tới khi nó yên vị.
  await expect
    .poll(async () => {
      const box = await popup.boundingBox();
      return (
        box !== null &&
        box.width > 0 &&
        box.height > 0 &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.x < viewport.width &&
        box.y < viewport.height
      );
    })
    .toBe(true);
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test.describe(`/search — prefers-reduced-motion: ${reducedMotion}`, () => {
    test.use({ reducedMotion });

    test.beforeEach(async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: 'XP_LOCALE', value: 'vi', url: baseURL ?? '' }]);
      // Đợi hydrate xong: bấm vào HTML của server thì nút chưa có handler, popup không bao giờ mở.
      await page.goto('/search', { waitUntil: 'networkidle' });
    });

    /** Thanh lọc đang hiện — bản thu gọn trên hero là `aria-hidden` nên getByRole tự bỏ qua. */
    const filterBar = (page: Page) => page.getByRole('region', { name: 'Lựa chọn xe & nhu cầu' });

    test('popover "Hãng xe" và "Kiểu dáng" hiện trong khung nhìn', async ({ page }) => {
      const openPopover = page.locator('.ant-popover:not(.ant-popover-hidden)');

      for (const label of ['Hãng xe', 'Kiểu dáng']) {
        // Tên accessible gồm cả nhãn icon ("appstore Hãng xe down").
        await filterBar(page).getByRole('button', { name: label }).click();
        await expectInViewport(page, openPopover.last());
        await page.keyboard.press('Escape');
        await page.mouse.click(1, 1);
        await expect(openPopover).toHaveCount(0);
      }
    });

    test('Select "Sắp xếp" mở danh sách trong khung nhìn', async ({ page }) => {
      await page.getByRole('combobox', { name: 'Sắp xếp kết quả' }).click();
      await expectInViewport(
        page,
        page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)'),
      );
    });

    test('hộp "Bộ lọc" hiện trong khung nhìn', async ({ page }) => {
      await filterBar(page).getByRole('button', { name: 'Bộ lọc' }).click();
      // `FilterModal` là dialog tự dựng (không phải `.ant-modal`).
      await expectInViewport(page, page.getByRole('dialog', { name: 'Bộ lọc' }));
    });
  });
}
