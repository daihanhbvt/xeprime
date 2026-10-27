'use client';

import { CheckCircleOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import styles from './BankAccountSavedDialog.module.css';

/**
 * Hộp "Thành công" sau khi thêm/đổi tài khoản nhận tiền — Figma `19973:52952` (modal 400, biểu
 * tượng tích xanh, một câu, một nút "Xác nhận").
 *
 * Chỉ dùng ở dáng `account` của `BankAccountForm`. Câu thân là CHÍNH câu toast của dáng chuẩn
 * ("Đã thêm…" / "Đã đổi…") để hai site không kể hai điều khác nhau về cùng một việc.
 */
export function BankAccountSavedDialog({
  open,
  message,
  onClose,
}: {
  open: boolean;
  message: string;
  onClose: () => void;
}) {
  const t = useTranslations('BankAccounts.form.saved');
  const tCommon = useTranslations('Common');

  return (
    <ResponsiveDialog
      hideHeaderTitle
      ariaLabel={t('title')}
      open={open}
      onClose={onClose}
      size="sm"
      footer={null}
    >
      <div className={styles.body}>
        <span className={styles.icon} aria-hidden="true">
          <CheckCircleOutlined />
        </span>
        <h2 className={styles.title}>{t('title')}</h2>
        <p className={styles.message}>{message}</p>
        <CtaButton block onClick={onClose}>
          {tCommon('actions.confirm')}
        </CtaButton>
      </div>
    </ResponsiveDialog>
  );
}
