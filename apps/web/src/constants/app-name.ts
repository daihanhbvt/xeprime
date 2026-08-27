/**
 * Tên thương hiệu hiện ra giao diện.
 *
 * KHÔNG đi qua i18n: nó giống nhau ở mọi ngôn ngữ, đúng lý do `AUTH_PROVIDER_LABEL` giữ
 * "Google"/"Facebook" ở dạng hằng (ADR 0012 — chỉ NHÃN mới dịch, tên riêng thì không).
 *
 * Đọc từ env chứ không gõ thẳng vào component: đổi tên sản phẩm là sửa một dòng `.env`, không
 * phải đi tìm từng chỗ. Phải là `NEXT_PUBLIC_*` vì phần lớn nơi dùng nó là Client Component —
 * Next chỉ nhúng biến có tiền tố đó vào bundle trình duyệt, và nhúng LÚC BUILD (xem `proxy.ts`
 * để biết cái bẫy ngược lại).
 *
 * App native đọc `EXPO_PUBLIC_APP_NAME` ở `apps/mobile/src/lib/app-name.ts` — hai nền tảng hai
 * biến vì hai bundler chỉ nhúng tiền tố của riêng mình, giống hệt cặp
 * `NEXT_PUBLIC_API_URL` / `EXPO_PUBLIC_API_URL`.
 */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'XePrime';
