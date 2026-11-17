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

/**
 * Bước "Chọn gói và thanh toán" của onboarding tuyến GÓI trên site partner (web `/onboarding` ở chế
 * độ host). Gian hàng `package_pending` chỉ vào được đúng trang này ở web (ADR 0040 điều 3), nên lối
 * "mua gói" của màn chờ kích hoạt trong app mở đây chứ không mở trang Cửa hàng.
 */
export function resolvePartnerOnboardingUrl(): string | null {
  const base = resolvePartnerWebBaseUrl();
  return base ? `${base}/onboarding?track=package` : null;
}

/**
 * Trang "Gói & hạn mức" trên site partner - app Partner KHÔNG bán gói (quy định store), mọi lối mua
 * / gia hạn / nâng cấp mở trang này. `lane` + `purchase=1` là đúng hai tham số web đọc để cuộn tới
 * làn và mở sẵn hộp mua (`ShopPlanSection`).
 */
export function resolvePartnerPlanUrl(lane?: string | null): string | null {
  const base = resolvePartnerWebBaseUrl();
  if (!base) return null;
  const params = new URLSearchParams({ section: 'plan', purchase: '1' });
  if (lane) params.set('lane', lane);
  return `${base}/shop?${params.toString()}`;
}
