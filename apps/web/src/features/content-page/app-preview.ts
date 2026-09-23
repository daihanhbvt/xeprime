/**
 * Ba ảnh minh hoạ màn hình app ở trang `/app`.
 *
 * **Ảnh TẠM.** File ở `public/app/` là phác thảo khối, không phải ảnh chụp màn hình thật — app
 * chưa phát hành nên chưa có gì để chụp. Chúng cố ý không chứa chữ nào: khỏi phải dịch, và khỏi
 * giả vờ là giao diện thật. Câu `AppPromo.preview.note` nói điều đó ngay dưới lưới ảnh.
 *
 * **Thay bằng ảnh thật:** ghi đè đúng ba file, giữ tỉ lệ 390 × 844 (9:19.5 — khung iPhone). Cả
 * trang không phải sửa một dòng nào, vì kích thước khai ở đây và khung máy là CSS.
 *
 * `key` vừa là khoá React vừa là nhánh message (`AppPromo.preview.<key>`), nên thêm một màn
 * hình thứ tư là thêm một mục ở đây + hai khoá dịch, không có chỗ thứ ba phải nhớ.
 */
export const APP_PREVIEW_SCREENS = [
  { key: 'search', src: '/app/screen-search.svg' },
  { key: 'trip', src: '/app/screen-trip.svg' },
  { key: 'chat', src: '/app/screen-chat.svg' },
] as const satisfies ReadonlyArray<{ key: string; src: string }>;

/** Tỉ lệ khung máy — dùng chung giữa `next/image` và CSS để ảnh không bao giờ bị bóp méo. */
export const APP_PREVIEW_SIZE = { width: 390, height: 844 } as const;
