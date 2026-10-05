import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import styles from './PortalLoginLayout.module.css';

/**
 * Khung trang đăng nhập/đăng ký của site PARTNER và site QUẢN TRỊ — trang đầy đủ, không phải popup:
 * người dùng cần thấy rõ mình đang ở không gian tài khoản nào (ADR 0053 — mỗi site một tài khoản).
 *
 * Cột trái nhận diện site (ẩn ở màn hẹp), cột phải là thẻ form. Nội dung form và chân thẻ do từng
 * trang truyền vào — khung không biết site nào đang dùng nó.
 */
export function PortalLoginLayout({
  asideText,
  title,
  subtitle,
  note,
  footer,
  children,
}: {
  asideText: string;
  title: string;
  subtitle: string;
  /** Ghi chú ngữ cảnh ngay dưới tiêu đề (vd đang tiếp tục đăng ký tuyến gói). */
  note?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <section className={styles.aside} aria-hidden="true">
        <Logo size="lg" />
        <p className={styles.asideText}>{asideText}</p>
      </section>

      <section className={styles.formSide}>
        <div className={styles.card}>
          <div className={styles.head}>
            <Logo size="md" />
            <div>
              <h1 className={styles.title}>{title}</h1>
              <p className={styles.sub}>{subtitle}</p>
            </div>
          </div>

          {note ? <div className={styles.intentNote}>{note}</div> : null}

          {children}

          {footer ? <div className={styles.foot}>{footer}</div> : null}
        </div>
      </section>
    </div>
  );
}

/** Class của link/nút ở chân thẻ — trang gọi dùng để chân thẻ đồng bộ một kiểu. */
export const PORTAL_FOOT_LINK_CLASS = styles.backLink;
export const PORTAL_FOOT_CTA_CLASS = styles.ownerCta;
