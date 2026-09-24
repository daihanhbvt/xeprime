import type { ReactNode } from 'react';
import Link from 'next/link';
import { cx } from '@/lib/cx';
import styles from './PageHero.module.css';

export interface PageHeroCrumb {
  readonly label: string;
  /** Bỏ trống ở mẩu CUỐI — mẩu đang đứng không phải một liên kết. */
  readonly href?: string;
}

export interface PageHeroProps {
  /** Nhãn dẫn phía trên tiêu đề (chữ nhỏ, in hoa, màu vàng). */
  readonly eyebrow?: string;
  readonly title: string;
  /** Một đến hai câu nói trang này trả lời chuyện gì. */
  readonly lead?: string;
  /** Viên thuốc dữ kiện bên dưới phần chữ — ví dụ ngày hiệu lực của một văn bản. */
  readonly meta?: string;
  readonly breadcrumb?: readonly PageHeroCrumb[];
  /** Khối tuỳ ý bám mép phải trên desktop (nút, bộ chọn…). */
  readonly aside?: ReactNode;
  /** `narrow` cho trang văn bản dài, `wide` cho trang có lưới thẻ. */
  readonly width?: 'narrow' | 'wide';
  readonly className?: string;
}

/**
 * Đầu trang dùng chung cho MỌI trang nội dung công khai — giới thiệu, ứng dụng, pháp lý, hỗ trợ.
 *
 * **Vì sao phải dùng chung.** Bốn khu này người dùng đi qua lại liên tục (chân trang → pháp lý
 * → "văn bản liên quan" → hỗ trợ → pháp lý). Trước 23/09/2026 mỗi trang tự dựng `<header>` của
 * nó với cỡ chữ và khoảng cách riêng, nên đi từ trang này sang trang kia là một cú giật — cảm
 * giác "đã sang website khác". Một component nghĩa là đổi một chỗ thì cả bốn khu đi theo.
 *
 * **Server Component.** Không state, không sự kiện; nhận chữ ĐÃ DỊCH từ trang gọi nó thay vì
 * tự đọc message. Nhờ vậy nó không bị buộc vào một namespace nào và dùng được ở cả bốn khu.
 *
 * Nền là dải cát chuyển dần xuống nền trang — cùng ngôn ngữ nền với dải CTA chủ xe ở trang chủ
 * (`OwnerCta`), và là đối trọng SÁNG của chân trang tối.
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  meta,
  breadcrumb,
  aside,
  width = 'narrow',
  className,
}: PageHeroProps) {
  return (
    <header className={cx(styles.hero, className)}>
      <div className={cx(styles.inner, width === 'wide' && styles.innerWide)}>
        <div className={styles.main}>
          {breadcrumb && breadcrumb.length > 0 && (
            <nav className={styles.crumbs} aria-label={breadcrumb[0]?.label}>
              {breadcrumb.map((crumb, i) => (
                <span key={crumb.label} className={styles.crumbItem}>
                  {i > 0 && (
                    <span className={styles.crumbSep} aria-hidden="true">
                      /
                    </span>
                  )}
                  {crumb.href ? (
                    <Link href={crumb.href} className={styles.crumbLink}>
                      {crumb.label}
                    </Link>
                  ) : (
                    /* Mẩu cuối là VỊ TRÍ HIỆN TẠI, không phải liên kết — `aria-current` nói
                       điều đó với trình đọc màn hình thay vì chỉ đổi màu chữ. */
                    <span className={styles.crumbCurrent} aria-current="page">
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          )}

          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h1 className={styles.title}>{title}</h1>
          {lead && <p className={styles.lead}>{lead}</p>}
          {meta && <p className={styles.meta}>{meta}</p>}
        </div>

        {aside && <div className={styles.aside}>{aside}</div>}
      </div>
    </header>
  );
}
