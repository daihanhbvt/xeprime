'use client';

import { Alert, App, Button, Skeleton, Switch, Tag, Typography } from 'antd';
import { useTranslations } from 'next-intl';

import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useUpdateVatInvoiceSetting, useVatInvoiceSetting } from '../hooks/use-shop';
import styles from './VatInvoiceSetting.module.css';

const { Paragraph } = Typography;

/**
 * "Hỗ trợ xuất hoá đơn VAT" — MỘT thiết lập cho mọi xe của gian hàng / chủ xe (ADR 0059).
 *
 * ## Hai chỗ đặt, một component
 *
 * Tuyến gói đặt nó ở "Chính sách thuê" (`ShopPoliciesPage`), tuyến hoa hồng ở "Hồ sơ chủ xe"
 * (`OwnerProfilePage`) — chủ xe cá nhân không có trang chính sách gian hàng. Cả hai dựng đúng
 * component này và gọi đúng một endpoint, nên không có hai luật cho cùng một cờ. Component chỉ là
 * PHẦN THÂN; khung section (tiêu đề, mô tả) là của trang chứa nó.
 *
 * ## Lưu ngay khi bấm
 *
 * `checked` bám vào cache của `GET /tenants/current/vat-invoice`; mutation chỉ ghi cache khi server
 * trả về thành công, nên lỗi thì công tắc tự đứng nguyên chỗ cũ, kèm thông báo theo MÃ lỗi.
 * `loading` vừa báo đang lưu vừa chặn bấm lặp.
 *
 * Thiếu quyền sửa (`canEdit`) hoặc đang trong phiên hỗ trợ của nền tảng (backend không khai
 * `@SupportAction`): chỉ còn trạng thái bằng chữ — không vẽ công tắc cho một hành động không mở.
 */
export function VatInvoiceSetting({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('Shop.vatInvoice');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const setting = useVatInvoiceSetting(true);
  const update = useUpdateVatInvoiceSetting();
  const supportHides = useSupportHides(SUPPORT_HIDDEN_AREA.VAT_INVOICE_TOGGLE);
  const canToggle = canEdit && !supportHides;

  if (setting.isError && !setting.data) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('loadError')}
        action={
          <Button size="small" onClick={() => void setting.refetch()}>
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }

  if (!setting.data) return <Skeleton active title={false} paragraph={{ rows: 2 }} />;

  const on = setting.data.vatInvoiceSupported;

  function onChange(next: boolean) {
    update.mutate(next, {
      onSuccess: () => message.success(next ? t('enabled') : t('disabled')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <span className={styles.label}>{t('label')}</span>
        <span className={styles.control}>
          <Tag color={on ? 'green' : 'default'}>{on ? t('on') : t('off')}</Tag>
          {canToggle ? (
            <Switch
              checked={on}
              loading={update.isPending}
              onChange={(checked) => onChange(checked)}
              aria-label={t('ariaLabel')}
            />
          ) : null}
        </span>
      </div>
      <Paragraph type="secondary" className={styles.note}>
        {t('note')}
      </Paragraph>
    </div>
  );
}
