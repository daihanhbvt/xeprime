import type { AuthProvider } from '@xeprime/types';
import { isSafeNextPath } from '@xeprime/domain';
import type { AppLocale } from '@/i18n/config';
import { getApiBaseUrl } from '@/services/api-client';

/**
 * URL bắt đầu đăng nhập mạng xã hội — ADR 0019.
 *
 * Web KHÔNG chạy vòng OAuth nào: nó chỉ điều hướng trình duyệt tới backend, và backend lo phần
 * còn lại (state, PKCE, client secret, đổi token). Vì thế ở đây không có SDK, không có popup,
 * và không có gì để hỏng ngoài việc dựng sai URL.
 *
 * Điều hướng CẢ TAB (`location.assign`) chứ không popup: popup bị chặn mặc định ở khá nhiều
 * trình duyệt, và hoàn toàn không dùng được trong webview trong-ứng-dụng của Facebook/Zalo —
 * nguồn truy cập lớn của khách thuê xe.
 */
export function socialAuthUrl(
  provider: AuthProvider,
  params: { next: string | null; locale: AppLocale },
): string {
  const url = new URL(`${getApiBaseUrl().replace(/\/+$/, '')}/auth/social/${provider}`);
  // Backend kiểm lại `next` bằng CHÍNH hàm này (`@xeprime/domain`) trước khi lưu — lọc ở đây chỉ
  // để không gửi đi một tham số chắc chắn bị bỏ.
  if (isSafeNextPath(params.next)) url.searchParams.set('next', params.next);
  // Màn đồng ý do Google/Facebook render, không phải XePrime. Không nói ngôn ngữ ra thì khách
  // đang đọc tiếng Anh sẽ nhảy sang một trang tiếng Việt ngay giữa luồng đăng nhập (ADR 0012).
  url.searchParams.set('locale', params.locale);
  return url.toString();
}

/**
 * Đường dẫn hiện tại, ĐÃ BỎ các tham số điều khiển hộp đăng nhập, để làm `next`.
 *
 * Đây là cái bẫy của việc đổi từ popup sang chuyển trang: lúc bấm nút Google, URL đang là
 * `/xe/01H?auth=login&next=…`. Lấy nguyên nó làm `next` thì đăng nhập xong backend đưa về đúng
 * URL đó — và hộp đăng nhập mở lại ngay trước mặt người vừa đăng nhập thành công.
 */
export function nextWithoutAuthParams(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  for (const key of ['auth', 'next', 'authError']) params.delete(key);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Rời trang sang provider. Đây là chỗ DUY NHẤT trong web thực hiện bước đó.
 *
 * Tách khỏi component vì nó là một hành động điều hướng thật, không phải render: gom nó vào một
 * hàm nghĩa là `AuthPanel` chỉ còn quyết định "đi đâu", còn "đi bằng cách nào" nằm cạnh chính
 * logic dựng URL — và cả hai kiểm được mà không phải giả lập `window.location`.
 */
export function startSocialLogin(
  provider: AuthProvider,
  params: { pathname: string; search: string; locale: AppLocale },
): void {
  window.location.assign(
    socialAuthUrl(provider, {
      next: nextWithoutAuthParams(params.pathname, params.search),
      locale: params.locale,
    }),
  );
}
