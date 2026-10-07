'use client';

import { Alert, Button, Empty, Skeleton } from 'antd';
import { PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/cx';
import { currentBankAccount } from '../current-account';
import { useBankAccounts } from '../hooks/use-bank-accounts';
import type { BankAccountScope } from '../types';
import { BankAccountCard } from './BankAccountCard';
import { BankAccountForm } from './BankAccountForm';
import styles from './BankAccountList.module.css';

/**
 * TÀI KHOẢN NHẬN TIỀN — dùng chung cho khu cá nhân và khu gian hàng, khác nhau đúng ở `scope`
 * (ADR 0023 điều 7: một bộ cho cả hai phía).
 *
 * ## Một tài khoản, không phải một sổ (07/10/2026)
 *
 * Mỗi chủ có đúng MỘT tài khoản nhận tiền (database bảo đảm). Nên khối này không còn danh sách,
 * nhãn "Mặc định", nút "Đặt làm mặc định" hay "Bỏ dùng" — chỉ một thẻ và một nút: **Thêm tài
 * khoản** khi chưa có, **Đổi tài khoản** khi đã có. Đổi là khai cái mới; server lưu trữ cái cũ trong
 * cùng transaction, nên không có lúc nào tiền "không biết về đâu".
 *
 * Số tài khoản hiện dạng CHE: người dùng chỉ cần nhận ra tài khoản nào là của mình. Muốn đọc lại
 * số đầy đủ thì mở app ngân hàng — không phải mở trang này.
 *
 * Nút chỉ hiện khi đã biết câu trả lời: lúc đang tải hay tải lỗi thì không biết mình đang THÊM hay
 * ĐỔI, và bấm "Thêm" trong lúc đó là âm thầm thay một tài khoản người dùng không thấy.
 *
 * `id`/`className`/`title`/`subtitle` để phần tử cha NHÚNG được panel này vào bố cục của nó
 * (trang "Số dư & rút tiền" của site partner đặt nó ngay dưới nút Rút, có khung thẻ và có anchor
 * `?section=payout`) mà không phải dựng một khối thứ hai. Bỏ trống thì panel tự xưng như cũ —
 * `/account/bank-accounts` và `AccountMoneyPanel` không phải đổi gì.
 */
export function BankAccountList({
  scope,
  id,
  className,
  title,
  subtitle,
}: {
  scope: BankAccountScope;
  id?: string;
  className?: string;
  title?: string;
  subtitle?: string;
}) {
  const t = useTranslations('BankAccounts');
  const [formOpen, setFormOpen] = useState(false);

  const { data, isPending, isError } = useBankAccounts(scope);
  const account = currentBankAccount(data);
  const settled = !isPending && !isError;

  const headingId = id ? `${id}-title` : undefined;

  return (
    <section
      id={id}
      className={cx(styles.panel, className)}
      aria-labelledby={headingId}
      aria-label={headingId ? undefined : t('title')}
      // Đích của `?section=` khi panel này được nhúng — xem `SectionCard`.
      tabIndex={id ? -1 : undefined}
    >
      <header className={styles.head}>
        <div>
          <h2 className={styles.title} id={headingId}>
            {title ?? t('title')}
          </h2>
          <p className={styles.subtitle}>{subtitle ?? t('subtitle')}</p>
        </div>
        {settled ? (
          account ? (
            <Button icon={<SwapOutlined />} onClick={() => setFormOpen(true)}>
              {t('actions.change')}
            </Button>
          ) : (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
              {t('actions.add')}
            </Button>
          )
        ) : null}
      </header>

      {isPending ? <Skeleton active paragraph={{ rows: 2 }} /> : null}
      {isError ? <Alert type="error" showIcon title={t('loadError')} /> : null}
      {settled && !account ? (
        <Empty description={t('empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : null}

      {account ? <BankAccountCard account={account} /> : null}

      <BankAccountForm
        scope={scope}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        replacing={account}
      />
    </section>
  );
}
