import type { ReactNode } from 'react';

/**
 * Marketplace công khai.
 *
 * Route group này cố ý KHÔNG bọc AppShell và không 'use client': đây là phần cần SEO
 * (screen_spec §6.1 — chuyển sang Next.js chính là để index được xe/gian hàng), nên phải
 * giữ được Server Component. `(manage)` thì ngược lại, là SPA sau đăng nhập.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <main>{children}</main>;
}
