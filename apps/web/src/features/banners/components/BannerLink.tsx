import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Bọc ảnh banner bằng ĐÚNG loại liên kết theo đích admin nhập (`linkUrl`, đã qua `SAFE_URL_PATTERN`
 * ở API): đường dẫn nội bộ `/…` → `next/link` (điều hướng trong app); URL tuyệt đối → `<a>` mở tab
 * mới; không có đích → trả nguyên nội dung, banner không bấm được.
 *
 * Dùng chung cho dải banner đầu trang và banner khuyến mãi — một nơi quyết định, hai vị trí không
 * thể đối xử khác nhau với cùng một đích.
 */
export function BannerLink({
  href,
  className,
  tabIndex,
  children,
}: {
  href: string | null;
  className?: string;
  tabIndex?: number;
  children: ReactNode;
}) {
  if (!href) return <>{children}</>;
  if (href.startsWith('/')) {
    return (
      <Link href={href} className={className} tabIndex={tabIndex}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
      tabIndex={tabIndex}
    >
      {children}
    </a>
  );
}
