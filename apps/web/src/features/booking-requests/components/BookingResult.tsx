'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { CopyButton } from '@/components/data-display/CopyButton';
import { useAppFormat } from '@/i18n/use-app-format';
import styles from './BookingResult.module.css';

/**
 * Khung của các hộp KẾT QUẢ trong hành trình đặt xe — popup 600 rộng của thiết kế:
 *
 *  - "Đã gửi yêu cầu" — Figma `19759:22026` (`BookingSuccessStep`);
 *  - "Thanh toán thành công" — Figma `19759:38196` (`TripPaymentSuccessDialog`).
 *
 * Hai hộp cùng một khuôn: huy hiệu 120 · tiêu đề · lời dẫn · ô mã chép được · thẻ chuyến · hàng nút
 * dính đáy sau một đường kẻ. Khuôn sống ở đây một lần; NỘI DUNG (câu chữ, nút) là của từng hộp.
 *
 * Hộp tự lo việc cuộn (vỏ overlay bỏ đệm và trần chiều cao — `bookingResultDialogClassNames`): thân
 * cuộn, hàng nút đứng yên. Màn laptop 768px cao không chứa hết 900px của bản vẽ, và hàng nút trôi
 * xuống dưới mép là hàng nút không ai thấy.
 */
export function BookingResult({
  title,
  lead,
  code,
  children,
  footer,
}: {
  title: string;
  lead: string;
  /** Mã khách đọc cho tổng đài — một Ô giá trị chép được. */
  code: { label: string; value: string; copyLabel: string };
  /** Thẻ chuyến (`BookingTripCard` bố cục `receipt`) và lời nhắc dưới nó. */
  children: ReactNode;
  /** Hàng nút. */
  footer: ReactNode;
}) {
  return (
    <div className={styles.result}>
      <div className={styles.content}>
        <div className={styles.status}>
          {/*
            Huy hiệu là TRANG TRÍ — tiêu đề ngay dưới đã nói đúng điều nó nói. Hai hộp dùng CÙNG một
            ảnh (Figma `6b95c.png` ở `19759:22159` và `19759:38199`).
          */}
          <Image
            src="/booking/request-sent.webp"
            alt=""
            width={120}
            height={120}
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
 * câu giải thích nhỏ nếu có) bên trái, số tiền `30px/Semibold` vàng sẫm bên phải.
 */
export function BookingResultTotal({
  label,
  note,
  amount,
}: {
  label: string;
  note?: string;
  amount: string;
}) {
  const fmt = useAppFormat();
  return (
    <div className={styles.total}>
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
 * bóng `Shadow/xl` như bản vẽ — hộp tự đặt bề rộng 600, tự cuộn thân và tự dựng hàng nút.
 */
export const bookingResultDialogClassNames = {
  className: styles.dialog,
  bodyClassName: styles.dialogBody,
} as const;
