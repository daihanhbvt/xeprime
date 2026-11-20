/**
 * Gốc SITE PARTNER (`partner.xeprime.vn`, chế độ host - URL không mang tiền tố `/manage`). Đọc
 * `EXPO_PUBLIC_PARTNER_WEB_URL` (nhúng lúc bundle). Vắng hoặc không phải http(s) thì trả `null` -
 * KHÔNG suy từ máy dev như `resolveWebBaseUrl`: một URL đoán sai gửi qua Zalo cho nhân viên, hay mở
 * nhầm site khi mua gói, còn tệ hơn không có lối.
 */
export function resolvePartnerWebBaseUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_PARTNER_WEB_URL?.trim().replace(/\/+$/, '');
  if (!configured || !/^https?:\/\//i.test(configured)) return null;
  return configured;
}

/**
 * Địa chỉ trang đăng nhập của site partner (web `ROUTES.MANAGE.LOGIN` ở chế độ host - `/login`), để
 * khối thông tin đăng nhập cấp cho nhân viên (ADR 0087) ghi đúng URL như web `StaffCredentials`.
 * Nhân viên đăng nhập được ở cả app XePrime Partner lẫn site này. `null` ⇒ nơi gọi lùi về tên app.
 */
export function resolvePartnerLoginUrl(): string | null {
  const base = resolvePartnerWebBaseUrl();
  return base ? `${base}/login` : null;
}

// Lối mở trang mua gói / onboarding thanh toán trên web ĐÃ GỠ (19/11/2026): app không dẫn ra
// ngoài để mua gói (Apple 3.1.1/3.1.3, chính sách Thanh toán Google Play).
