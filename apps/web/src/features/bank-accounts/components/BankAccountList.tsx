'use client';

import { App, Alert, Button, Empty, Popconfirm, Skeleton, Tag } from 'antd';
import { BankOutlined, PlusOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  useArchiveBankAccount,
  useBankAccounts,
  useSetDefaultBankAccount,
} from '../hooks/use-bank-accounts';
import type { BankAccountScope } from '../types';
import { BankAccountForm } from './BankAccountForm';
import styles from './BankAccountList.module.css';

/**
 * Danh sách tài khoản nhận tiền — dùng chung cho khu cá nhân và khu gian hàng, khác nhau đúng ở
 * `scope` (ADR 0023 điều 7: một bộ cho cả hai phía).
 *
 * Số tài khoản hiện dạng CHE: người dùng chỉ cần nhận ra tài khoản nào là của mình. Muốn đọc lại
 * số đầy đủ thì mở app ngân hàng — không phải mở trang này.
 *
 * Không có nút "sửa": đổi số tài khoản tại chỗ sẽ âm thầm đổi đích của lệnh chuyển đang chờ.
 * Thêm cái mới rồi bỏ cái cũ là hai hành động người dùng nhìn thấy và kiểm chứng được.
 */
export function BankAccountList({ scope }: { scope: BankAccountScope }) {
  const t = useTranslations('BankAccounts');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const [formOpen, setFormOpen] = useState(false);

  const { data, isPending, isError } = useBankAccounts(scope);
  const setDefault = useSetDefaultBankAccount(scope);
  const archive = useArchiveBankAccount(scope);

  const accounts = data ?? [];

  return (
    <section className={styles.panel} aria-label={t('title')}>
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>{t('title')}</h2>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
          {t('actions.add')}
        </Button>
      </header>

      {isPending ? <Skeleton active paragraph={{ rows: 2 }} /> : null}
      {isError ? <Alert type="error" showIcon message={t('loadError')} /> : null}
      {!isPending && !isError && accounts.length === 0 ? (
        <Empty description={t('empty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : null}

      <ul className={styles.list}>
        {accounts.map((account) => (
          <li key={account.id} className={styles.item}>
            <BankOutlined aria-hidden="true" className={styles.icon} />
            <div className={styles.info}>
              <p className={styles.bank}>
                {account.label || account.bankCode}{' '}
                {account.isDefault ? <Tag color="blue">{t('defaultTag')}</Tag> : null}
                {account.verifiedAt ? <Tag color="green">{t('verifiedTag')}</Tag> : null}
              </p>
              <p className={styles.number}>
                {account.bankCode} · {account.accountNumberMasked}
              </p>
              <p className={styles.name}>{account.accountName}</p>
            </div>
            <div className={styles.actions}>
              {account.isDefault ? null : (
                <Button
                  size="small"
                  loading={setDefault.isPending}
                  onClick={() =>
                    setDefault.mutate(account.id, {
                      onSuccess: () => message.success(t('form.defaultChanged')),
                      onError: (err: unknown) => message.error(errorMessage(err)),
                    })
                  }
                >
                  {t('actions.setDefault')}
                </Button>
              )}
              <Popconfirm
                title={t('actions.archiveConfirm')}
                description={t('actions.archiveHint')}
                onConfirm={() =>
                  archive.mutate(account.id, {
                    onSuccess: () => message.success(t('form.archived')),
                    onError: (err: unknown) => message.error(errorMessage(err)),
                  })
                }
              >
                <Button size="small" danger>
                  {t('actions.archive')}
                </Button>
              </Popconfirm>
            </div>
          </li>
        ))}
      </ul>

      <BankAccountForm scope={scope} open={formOpen} onClose={() => setFormOpen(false)} />
    </section>
  );
}
