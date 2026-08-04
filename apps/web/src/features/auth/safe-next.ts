/**
 * Kiểm tra `?next=` trước khi điều hướng — chống open redirect.
 *
 * `next` đến từ URL nên là dữ liệu của kẻ tấn công: một link
 * `xeprime.vn/login?next=https://evil.example` mà được redirect thẳng sẽ biến chính domain của
 * mình thành bàn đạp phishing (người dùng thấy link xeprime.vn, click, và hạ cánh ở trang giả).
 *
 * Chỉ chấp nhận đường dẫn NỘI BỘ tuyệt đối. Các dạng bị từ chối:
 *  - `https://evil.example` — có scheme;
 *  - `//evil.example` — protocol-relative, trình duyệt hiểu là host khác;
 *  - `/\evil.example` và `\\evil.example` — một số trình duyệt coi `\` như `/`;
 *  - `trips` — tương đối, không xác định được đích;
 *  - chuỗi có ký tự điều khiển/khoảng trắng, dùng để lách kiểm tra tiền tố.
 */

/**
 * Có ký tự điều khiển (C0 + DEL) hoặc khoảng trắng không.
 *
 * Duyệt theo mã ký tự thay vì regex: regex chứa ký tự điều khiển bị `no-control-regex` chặn,
 * còn viết bằng escape thì khó đọc và dễ sót khoảng.
 */
function hasControlOrSpace(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function isSafeNextPath(value: string | null | undefined): value is string {
  if (!value) return false;
  if (hasControlOrSpace(value)) return false;
  // Phải bắt đầu bằng ĐÚNG MỘT dấu `/` và ký tự kế tiếp không phải `/` hay `\`.
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//') || value.startsWith('/\\')) return false;
  return true;
}

/**
 * Trả về `next` nếu an toàn, ngược lại trả `fallback`.
 * Luôn dùng hàm này thay vì tự viết `next.startsWith('/')` tại chỗ gọi.
 */
export function safeNextPath(value: string | null | undefined, fallback: string): string {
  return isSafeNextPath(value) ? value : fallback;
}

/** Ghép `?next=` vào một route, bỏ qua nếu `next` không an toàn. */
export function withNext(route: string, next: string | null | undefined): string {
  if (!isSafeNextPath(next)) return route;
  const separator = route.includes('?') ? '&' : '?';
  return `${route}${separator}next=${encodeURIComponent(next)}`;
}

/** Đường dẫn hiện tại (pathname + query) để làm `next` khi mở auth. */
export function currentPathWithQuery(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}
