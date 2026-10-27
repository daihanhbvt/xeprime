'use client';

import { SafetyCertificateOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { findBank } from '@xeprime/domain';
import { cx } from '@/lib/cx';
import { bankAccountTitle } from '../current-account';
import type { BankAccount } from '../types';
import styles from './BankAccountCard.module.css';
import { BankLogo } from './BankLogo';

/**
 * Thẻ MỘT tài khoản nhận tiền — cùng một hình ở mọi nơi tài khoản hiện ra: khối "Tài khoản nhận
 * tiền", hộp thoại rút tiền, hộp thoại khai tài khoản nhận hoàn. Người dùng nhận ra tài khoản của
 * mình bằng hình dạng của nó; ba bản vẽ lệch nhau là ba lần phải đọc lại.
 *
 * `emphasis` cho nơi thẻ là ĐÍCH của một lệnh chi sắp gửi (hộp thoại rút): viền màu chính, nhìn ra
 * ngay tiền sẽ về đâu trước khi bấm. `action` là một lối rẽ phụ đặt cuối thẻ (nút "Đổi tài khoản").
 *
 * `variant="detail"` là hình của tab "Tài khoản thanh toán" khu tài khoản khách (Figma
 * `19879:74829`): ô biểu trưng lớn bên trái, bên phải là nhãn đối chiếu và bảng bốn dòng ngân
 * hàng · số tài khoản · người thụ hưởng · tên gợi nhớ. Cùng dữ liệu với hình một dòng.
 *
 * Bản vẽ có nút SAO CHÉP số tài khoản — bỏ: số ở đây là số ĐÃ CHE (server không trả số đầy đủ ra
 * bề mặt này), chép "••••4567" không giúp được ai.
 */
export function BankAccountCard({
  account,
  action,
  emphasis = false,
  variant = 'row',
}: {
  account: BankAccount;
  action?: ReactNode;
  emphasis?: boolean;
  variant?: 'row' | 'detail';
}) {
  const t = useTranslations('BankAccounts');

  if (variant === 'detail') {
    const bank = findBank(account.bankCode);
    return (
      <div className={styles.detail}>
        <BankLogo code={account.bankCode} size="lg" className={styles.detailLogo} />
        <div className={styles.detailBody}>
          {account.verifiedAt ? (
            <span className={styles.verified}>
              <SafetyCertificateOutlined aria-hidden="true" />
              {t('verifiedTag')}
            </span>
          ) : null}
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>{t('detail.bank')}</dt>
              {/* Tên ngân hàng là tên riêng — không dịch (ADR 0012). */}
              <dd>{bank ? `${bank.fullName} (${bank.shortName})` : bankAccountTitle(account)}</dd>
            </div>
            <div className={styles.fact}>
              <dt>{t('detail.number')}</dt>
              <dd className={styles.factNumber}>{account.accountNumberMasked}</dd>
            </div>
            <div className={styles.fact}>
              <dt>{t('detail.holder')}</dt>
              <dd className={styles.factHolder}>{account.accountName}</dd>
            </div>
            <div className={styles.fact}>
              <dt>{t('detail.label')}</dt>
              <dd>{account.label || t('detail.noLabel')}</dd>
            </div>
          </dl>
        </div>
        {action ? <span className={styles.action}>{action}</span> : null}
      </div>
    );
  }

  return (
    <div className={cx(styles.card, emphasis && styles.emphasis)}>
      <BankLogo code={account.bankCode} />
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
