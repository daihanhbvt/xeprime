/**
 * `@xeprime/ui` — hệ thiết kế dùng chung của XePrime.
 *
 * Hôm nay package này chứa DESIGN TOKEN (`src/tokens/`) + bản CSS custom property của chúng
 * (`src/styles/tokens.css`, export `@xeprime/ui/styles.css`). Nguồn giá trị: Figma section 01
 * "XePrime Foundations" — hợp đồng ở `docs/design-token-map.md`.
 *
 * ── Luật ranh giới nền tảng ─────────────────────────────────────────────────────────────
 * Export GỐC (`@xeprime/ui`) phải chạy được trên CẢ web lẫn React Native: chỉ TypeScript
 * thuần, không `antd`, không `react`, không DOM. App native import token từ đây; một dòng
 * import trình duyệt lọt vào là vỡ bundle Metro.
 *
 * Component web dùng chung (dự định gốc của package, Phase 0) khi xuất hiện sẽ đi qua một
 * SUBPATH riêng (`@xeprime/ui/react`) với peerDeps khai ở đó — không bao giờ qua export gốc.
 * Quy ước cũ vẫn giữ: component chỉ nhận props thuần, không gọi API, không đọc Redux.
 */
export * from './tokens';
