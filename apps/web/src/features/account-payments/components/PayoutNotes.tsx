'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import styles from './PayoutNotes.module.css';

const strong = (chunks: ReactNode) => <strong>{chunks}</strong>;

/**
 * "Lưu ý khi thêm tài khoản nhận tiền" — khối nền xám dưới thẻ tài khoản (Figma `19879:74829`).
 *
 * Bản vẽ có bốn dòng; ở đây chỉ giữ những điều ĐÚNG với sản phẩm hôm nay:
 *  · tên thụ hưởng phải khớp tên ở NGÂN HÀNG (ngân hàng đối chiếu tên — sai thì lệnh bị trả về).
 *    Bản vẽ nói "khớp CMND/CCCD đã xác minh trên XePrime" — hệ thống không đối chiếu điều đó;
 *  · thời gian chuyển lấy từ server (`maxBusinessDays`), không chép cứng "1 – 2 ngày";
 *  · chỉ tài khoản ngân hàng trong nước (danh mục chọn là ngân hàng VN; lệnh chi là chuyển khoản);
 *  · đổi tài khoản không đổi đích lệnh rút đang chờ.
 * Dòng "Phí giao dịch" của bản vẽ là dòng CÓ ĐIỀU KIỆN ("chỉ thêm nếu XePrime có thu phí") —
 * XePrime không thu phí rút, nên không có dòng đó.
 *
 * `maxBusinessDays` chưa có (số dư chưa tải xong) ⇒ bỏ hẳn dòng thời gian, không đoán một con số.
 */
export function PayoutNotes({ maxBusinessDays }: { maxBusinessDays?: number }) {
  const t = useTranslations('AccountPayments.balance.notes');

  return (
    <div className={styles.notes}>
      <p className={styles.title}>{t('title')}</p>
      <ul className={styles.list}>
        <li>{t.rich('holder', { strong })}</li>
        {maxBusinessDays !== undefined ? (
          <li>{t.rich('timing', { strong, days: maxBusinessDays })}</li>
        ) : null}
        <li>{t.rich('accountType', { strong })}</li>
        <li>{t.rich('change', { strong })}</li>
      </ul>
    </div>
  );
}
