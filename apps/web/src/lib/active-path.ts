/**
 * "Người dùng đang ở trang nào" — phép so dùng chung cho thanh điều hướng và chân trang.
 *
 * Hàm THUẦN, tách khỏi component để test được và để hai nơi đánh dấu mục đang xem không trôi
 * khỏi nhau. Trước 23/09/2026 chân trang không đánh dấu gì cả, còn thanh trên cùng hard-code
 * `i === 0` — tức "Khám phá" sáng vàng ở MỌI trang, kể cả trang điều khoản sử dụng.
 *
 * ── Vì sao link mang query luôn trả `false` ─────────────────────────────────
 *
 * Ba mục dịch vụ ở chân trang là `/search?serviceType=…` — cùng một `pathname`. Muốn biết mục
 * nào đang xem thì phải đọc `useSearchParams`, và đúng một lời gọi đó buộc Next bọc component
 * trong `<Suspense>` rồi HUỶ prerender tĩnh của nó (`missing-suspense-with-csr-bailout`). Với
 * chân trang, cái giá là mười liên kết biến mất khỏi HTML tĩnh — thứ mà bot đọc.
 *
 * Đánh dấu một bộ lọc cũng không đáng giá: trên `/search` người dùng đổi chip dịch vụ liên tục,
 * và chính hàng chip ở đầu trang đã nói rõ đang lọc theo gì.
 */
export function isActivePath(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;

  const queryAt = href.indexOf('?');
  if (queryAt >= 0) return false;

  const path = href.replace(/#.*$/, '');
  if (path === '/') return pathname === '/';

  /*
   * Khớp cả trang CON: đang đọc `/legal/terms` thì một mục trỏ `/legal` cũng là "đang xem".
   * Dấu `/` ở cuối là bắt buộc — thiếu nó thì `/app` sẽ khớp luôn `/application` nếu sau này có.
   */
  return pathname === path || pathname.startsWith(`${path}/`);
}
