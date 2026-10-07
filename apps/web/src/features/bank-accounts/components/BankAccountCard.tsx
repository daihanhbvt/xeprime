'use client';

import { Tag } from 'antd';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { bankInitials } from '@xeprime/domain';
import { cx } from '@/lib/cx';
import { bankAccountTitle } from '../current-account';
import type { BankAccount } from '../types';
import styles from './BankAccountCard.module.css';

/**
 * Thẻ MỘT tài khoản nhận tiền — cùng một hình ở mọi nơi tài khoản hiện ra: khối "Tài khoản nhận
 * tiền", hộp thoại rút tiền, hộp thoại khai tài khoản nhận hoàn. Người dùng nhận ra tài khoản của
 * mình bằng hình dạng của nó; ba bản vẽ lệch nhau là ba lần phải đọc lại.
 *
 * `emphasis` cho nơi thẻ là ĐÍCH của một lệnh chi sắp gửi (hộp thoại rút): viền màu chính, nhìn ra
 * ngay tiền sẽ về đâu trước khi bấm. `action` là một lối rẽ phụ đặt cuối thẻ (nút "Đổi tài khoản").
 */
export function BankAccountCard({
  account,
  action,
  emphasis = false,
}: {
  account: BankAccount;
  action?: ReactNode;
  emphasis?: boolean;
}) {
  const t = useTranslations('BankAccounts');
  return (
    <div className={cx(styles.card, emphasis && styles.emphasis)}>
      {/*
        Biểu trưng dựng từ chính MÃ ngân hàng, không tải logo: logo là tài sản có bản quyền, và
        một ô chữ đọc ra ngay ("VCB") thì không phải chờ tải ảnh.
      */}
      <span aria-hidden="true" className={styles.badge}>
        {bankInitials(account.bankCode)}
      </span>
      <span className={styles.text}>
        <span className={styles.title}>
          <span className={styles.titleText}>{bankAccountTitle(account)}</span>
          {account.verifiedAt ? <Tag color="green">{t('verifiedTag')}</Tag> : null}
        </span>
        <span className={styles.number}>
          {t('accountNumberLine', { number: account.accountNumberMasked })}
        </span>
        <span className={styles.holder}>{account.accountName}</span>
      </span>
      {action ? <span className={styles.action}>{action}</span> : null}
    </div>
  );
}
