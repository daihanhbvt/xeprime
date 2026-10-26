import type { ReactNode } from 'react';
import { enterClass } from '@/components/motion/motion-classes';
import { Reveal } from '@/components/motion/Reveal';
import { SplitText } from '@/components/motion/SplitText';
import { cx } from '@/lib/cx';
import styles from './SectionHeading.module.css';

/**
 * Tiêu đề khối của trang chủ v2 (ADR 0062) — dòng nhỏ in hoa màu vàng, tiêu đề lớn, và (tuỳ khối)
 * một gạch vàng ngắn bên dưới. Cùng MỘT component cho mọi khối để bảy tiêu đề trên trang không
 * thể lệch nhau về cỡ chữ hay khoảng cách.
 *
 * `kicker` viết thường trong bản dịch, CSS mới đổi sang in hoa: trình đọc màn hình đọc chữ in
 * hoa thành từng chữ cái, còn bản dịch tiếng Anh cần được viết hoa theo quy tắc của nó.
 */
export function SectionHeading({
  id,
  kicker,
  title,
  align = 'start',
  divider = false,
  action,
  className,
}: {
  /** Gắn vào thẻ tiêu đề — section bọc ngoài dùng nó cho `aria-labelledby`. */
  id: string;
  kicker: string;
  title: ReactNode;
  align?: 'start' | 'center';
  divider?: boolean;
  /**
   * Nút phụ bên phải ("Xem tất cả"), chỉ dùng khi canh trái. Mobile ẩn nó đi — khối tự đặt nút
   * tương ứng DƯỚI nội dung (bản vẽ mobile v2).
   */
  action?: ReactNode;
  className?: string;
}) {
  /*
   * Hiện ra khi cuộn tới, như tiêu đề khối của trang mẫu: dòng nhỏ trượt lên (0.1s), tiêu đề hiện
   * từng ký tự (chuỗi) hoặc trượt nguyên dòng (node có định dạng), gạch vàng + nút phụ theo sau.
   * Khung ngoài chỉ làm CỔNG chờ cuộn (`effect="none"`), bản thân nó đứng yên.
   */
  const heading = (
    <div className={cx(styles.heading, align === 'center' && styles.center)}>
      <p className={cx(styles.kicker, enterClass(100))}>{kicker}</p>
      {typeof title === 'string' ? (
        <h2 id={id} className={styles.title}>
          <SplitText text={title} delay={200} />
        </h2>
      ) : (
        <h2 id={id} className={cx(styles.title, enterClass(200))}>
          {title}
        </h2>
      )}
      {/* Mobile: MỌI tiêu đề khối canh giữa và có gạch vàng (bản vẽ mobile v2) — kể cả khi desktop không có. */}
      <span
        className={cx(styles.divider, !divider && styles.dividerMobileOnly, enterClass(400))}
        aria-hidden="true"
      />
    </div>
  );

  if (!action) {
    return (
      <Reveal effect="none" className={className}>
        {heading}
      </Reveal>
    );
  }

  return (
    <Reveal effect="none" className={cx(styles.row, className)}>
      {heading}
      <div className={cx(styles.action, enterClass(400))}>{action}</div>
    </Reveal>
  );
}
