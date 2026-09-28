import type { Href, Router } from 'expo-router';

/**
 * Lui một bước, hoặc đi tới `fallback` khi không có gì để lui về.
 *
 * Nhánh `fallback` KHÔNG phải phòng xa: deep link (`xeprime://register`) và thông báo đẩy mở
 * thẳng một màn với stack rỗng, và `router.back()` lúc đó không làm gì cả — người dùng kẹt lại
 * màn đó, bấm lui bao nhiêu lần cũng vậy.
 */
export function goBackOr(router: Router, fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
