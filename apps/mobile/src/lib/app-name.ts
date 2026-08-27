/**
 * Tên thương hiệu hiện ra giao diện — bản native của `apps/web/src/constants/app-name.ts`.
 *
 * KHÔNG đi qua i18n: giống nhau ở mọi ngôn ngữ, đúng lý do `AUTH_PROVIDER_LABEL` giữ
 * "Google"/"Facebook" ở dạng hằng (ADR 0012 — chỉ NHÃN mới dịch, tên riêng thì không).
 *
 * Hai nền tảng hai biến (`NEXT_PUBLIC_APP_NAME` / `EXPO_PUBLIC_APP_NAME`) vì mỗi bundler chỉ
 * nhúng tiền tố của riêng nó — cùng cách cặp `NEXT_PUBLIC_API_URL` / `EXPO_PUBLIC_API_URL` đang
 * làm. Expo nhúng LÚC BUILD BUNDLE: sửa `.env` xong phải khởi động lại Metro, bấm `r` reload là
 * vẫn giá trị cũ.
 *
 * ⚠️ Đây là tên hiện TRONG app. Tên dưới biểu tượng trên màn hình điện thoại là
 * `expo.name` ở `app.json` — file JSON tĩnh, không đọc được env; đổi tên sản phẩm phải sửa cả
 * hai chỗ cho tới khi có `app.config.ts`.
 */
export const APP_NAME = process.env.EXPO_PUBLIC_APP_NAME?.trim() || 'XePrime';
