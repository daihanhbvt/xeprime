'use client';

import { App, Button, Result, Switch } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';

import { SettingRow } from '@/components/form/SettingRow';
import { SHOP_POLICIES_DEPOSIT_ANCHOR, SHOP_SECTION, shopSectionPath } from '@/constants/routes';
import { lockReason } from '@/features/shop/components/DepositToggleCard';
import { VatInvoiceSetting } from '@/features/shop/components/VatInvoiceSetting';
import { usePaymentSettings, useUpdatePaymentSettings } from '@/features/shop/hooks/use-shop';
import type { PaymentSettings } from '@/features/shop/types';
import { usePermissions } from '@/hooks/use-permissions';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { useErrorMessage } from '@/i18n/use-error-message';

import { PolicyCard } from './PolicyCard';
import { PolicyInfoTip } from './PolicyInfoTip';
import styles from './ShopPolicies.module.css';

/**
 * Thẻ "Thanh toán & hóa đơn" (design `23874:68740`) — hai thiết lập cho MỌI xe của gian hàng, lưu
 * ngay khi bấm, không thuộc form chính sách theo loại xe bên dưới:
 *
 *  - **Thu tiền giữ chỗ qua XePrime** (ADR 0032 điều 2) — quyền RIÊNG `seller_profile.*`; thiếu quyền
 *    xem thì hàng này vắng hẳn, không chặn cả trang. Khoá theo giai đoạn nền tảng thì cũng vắng hẳn;
 *    khoá vì tuyến/gói/cấu hình thì vẫn hiện công tắc, kèm lý do — ADR 0027 điều 4. Chặn thật ở server.
 *  - **Hoá đơn VAT** (ADR 0059) — cùng component với Hồ sơ chủ xe của tuyến hoa hồng.
 *
 * `id` là ĐÍCH của route cũ `/shop/payment-settings` (redirect kèm hash).
 */
export function ShopPaymentCard({ canEditVat }: { canEditVat: boolean }) {
  const t = useTranslations('Shop.policies.workspace.payment');
  return (
    <PolicyCard id={SHOP_POLICIES_DEPOSIT_ANCHOR} title={t('title')} subtitle={t('subtitle')}>
      <DepositCollectionRow />
      <VatInvoiceSetting canEdit={canEditVat} variant="row" />
    </PolicyCard>
  );
}

function DepositCollectionRow() {
  const t = useTranslations('Shop.paymentSettings');
  const tTip = useTranslations('Shop.policies.workspace.payment');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const { tenant } = useTenantScope();
  const canView = has(PERMISSION.SELLER_PROFILE_VIEW);
  const canEdit = has(PERMISSION.SELLER_PROFILE_MANAGE);
  const { data, isLoading, isError, refetch } = usePaymentSettings(canView && Boolean(tenant));
  const update = useUpdatePaymentSettings();

  if (!canView) return null;

  if (isError && !data) {
    return (
      <div className={styles.rowBox}>
        <Result
          status="error"
          title={t('loadError')}
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      </div>
    );
  }
  // Đang tải thì chưa vẽ gì: hàng này thường vắng (khoá giai đoạn, ngay dưới) — một khung xương
  // hiện rồi biến mất làm cả trang giật lên.
  if (isLoading || !data) return null;

  const locked = lockReason(data);
  /*
   * Khoá theo GIAI ĐOẠN nền tảng (mọi gian hàng đều thu, không ai bật/tắt được): ẩn hẳn hàng — không
   * có việc gì để làm và không có lựa chọn nào để đọc (chốt 06/11/2026). Công tắc tự hiện lại khi nền
   * tảng mở nó; chặn thật vẫn ở server.
   */
  if (locked === 'platform') return null;
  const editable = data.editable && canEdit;
  return (
    <SettingRow
      boxed
      title={locked ? t(`locked.${locked}.title`) : t('toggle.label')}
      titleExtra={
        // Hai khoản tiền khác nhau — câu phân biệt và phạm vi áp dụng nằm ở ⓘ, không lặp thành đoạn.
        <PolicyInfoTip label={tTip('tipLabel')}>
          {t('subtitle')} {t('frozen')}
        </PolicyInfoTip>
      }
      description={<DepositDescription settings={data} locked={locked} readOnly={!canEdit} />}
      control={
        <Switch
          checked={data.depositRequired}
          disabled={!editable || update.isPending}
          loading={update.isPending}
          aria-label={t('toggle.label')}
          onChange={(checked) =>
            update.mutate(
              { depositCollectionEnabled: checked },
              {
                onSuccess: () => message.success(t('toggle.saved')),
                onError: (error) => message.error(errorMessage(error)),
              },
            )
          }
        />
      }
    />
  );
}

/**
 * Lý do khoá thì nói lý do (kèm việc làm được, nếu có); không khoá thì nói hệ quả của trạng thái
 * ĐANG ÁP DỤNG — không phải của vị trí công tắc.
 */
function DepositDescription({
  settings,
  locked,
  readOnly,
}: {
  settings: PaymentSettings;
  locked: ReturnType<typeof lockReason>;
  readOnly: boolean;
}) {
  const t = useTranslations('Shop.paymentSettings');
  return (
    <>
      <span>
        {locked
          ? t(`locked.${locked}.body`)
          : settings.depositRequired
            ? t('mode.onBody')
            : t('mode.offBody')}
      </span>
      {/* Khoá theo GIAI ĐOẠN không có việc gì để làm — không mời mua gói cho một thứ không liên quan. */}
      {locked && locked !== 'platform' ? (
        <Link href={shopSectionPath(SHOP_SECTION.PLAN)} className={styles.rowLink}>
          {t(`locked.${locked}.cta`)}
        </Link>
      ) : null}
      {readOnly && !locked ? <span className={styles.rowNote}>{t('readOnly')}</span> : null}
    </>
  );
}
