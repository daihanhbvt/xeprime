'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { CopyButton } from '@/components/data-display/CopyButton';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import styles from './BookingResult.module.css';

/**
 * Hình thái của hộp kết quả:
 *
 *  - `default` — popup 600: huy hiệu 120, tiêu đề 24, tổng tiền 30, hàng nút giữa ("Thanh toán thành
 *    công" — Figma `19759:38196`; hộp đặt hộ của gian hàng).
 *  - `sent` — popup 750 của "Đã gửi yêu cầu" (Figma `19759:22026`, bản 27/10/2026): biểu tượng phong
 *    bì 64, tiêu đề 18, lời dẫn 14, tổng tiền 18 nằm trong thẻ chuyến, hàng nút dồn phải.
 */
export type BookingResultVariant = 'default' | 'sent';

const BADGES: Record<BookingResultVariant, { src: string; width: number; height: number }> = {
  default: { src: '/booking/request-sent.webp', width: 120, height: 120 },
  sent: { src: '/booking/request-sent-envelope.webp', width: 64, height: 63 },
};

/**
 * Khung của các hộp KẾT QUẢ trong hành trình đặt xe:
 *
 *  - "Đã gửi yêu cầu" — Figma `19759:22026` (`BookingSuccessStep`, biến thể `sent`);
 *  - "Thanh toán thành công" — Figma `19759:38196` (`TripPaymentSuccessDialog`).
 *
 * Các hộp cùng một khuôn: huy hiệu · tiêu đề · lời dẫn · ô mã chép được · thẻ chuyến · hàng nút
 * dính đáy sau một đường kẻ. Khuôn sống ở đây một lần; KÍCH CỠ theo `variant`, NỘI DUNG (câu chữ,
 * nút) là của từng hộp.
 *
 * Hộp tự lo việc cuộn (vỏ overlay bỏ đệm và trần chiều cao — `bookingResultDialogClassNames`): thân
 * cuộn, hàng nút đứng yên. Màn laptop 768px cao không chứa hết 900px của bản vẽ, và hàng nút trôi
 * xuống dưới mép là hàng nút không ai thấy.
 */
export function BookingResult({
  variant = 'default',
  title,
  lead,
  code,
  children,
  footer,
}: {
  variant?: BookingResultVariant;
  title: string;
  lead: string;
  /** Mã khách đọc cho tổng đài — một Ô giá trị chép được. */
  code: { label: string; value: string; copyLabel: string };
  /** Thẻ chuyến (`BookingTripCard` bố cục `receipt`) và lời nhắc dưới nó. */
  children: ReactNode;
  /** Hàng nút. */
  footer: ReactNode;
}) {
  const badge = BADGES[variant];
  return (
    <div className={cx(styles.result, variant === 'sent' && styles.sent)}>
      <div className={styles.content}>
        <div className={styles.status}>
          {/* Huy hiệu là TRANG TRÍ — tiêu đề ngay dưới đã nói đúng điều nó nói. */}
          <Image
            src={badge.src}
            alt=""
            width={badge.width}
            height={badge.height}
            className={styles.badge}
          />
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.lead}>{lead}</p>
          <div className={styles.code}>
            <p className={styles.codeText}>
              <span className={styles.codeLabel}>{code.label}</span>{' '}
              <span className={styles.codeValue}>{code.value}</span>
            </p>
            <CopyButton value={code.value} label={code.copyLabel} />
          </div>
        </div>

        {children}
      </div>

      <footer className={styles.footer}>{footer}</footer>
    </div>
  );
}

/**
 * Dòng tổng trong thẻ chuyến của hộp kết quả (Figma `19759:22246` · `19759:38232`): nhãn (và một
 * câu giải thích nhỏ nếu có) bên trái, số tiền `30px/Semibold` vàng sẫm bên phải. Biến thể `sent`
 * (Figma `21621:53769`): nhãn `14px`, số tiền `18px`.
 */
export function BookingResultTotal({
  variant = 'default',
  label,
  note,
  amount,
}: {
  variant?: BookingResultVariant;
  label: string;
  note?: string;
  amount: string;
}) {
  const fmt = useAppFormat();
  return (
    <div className={cx(styles.total, variant === 'sent' && styles.totalSent)}>
      <div className={styles.totalText}>
        <span className={styles.totalLabel}>{label}</span>
        {note ? <span className={styles.totalNote}>{note}</span> : null}
      </div>
      <strong className={styles.totalAmount}>{fmt.money(amount)}</strong>
    </div>
  );
}

/**
 * Lớp vỏ `ResponsiveDialog` cho hộp kết quả trên desktop: bỏ đệm + thanh tiêu đề của modal, bo 16 và
 * bóng `Shadow/xl` như bản vẽ — hộp tự đặt bề rộng (600 / 750), tự cuộn thân và tự dựng hàng nút.
 */
export const bookingResultDialogClassNames = {
  className: styles.dialog,
  bodyClassName: styles.dialogBody,
} as const;
