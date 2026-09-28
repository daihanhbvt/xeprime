'use client';

import { CheckCircleOutlined, CarOutlined, DashboardOutlined } from '@ant-design/icons';
import { Alert, App, Button, Result, Skeleton, Tabs, Typography } from 'antd';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { PERMISSION, VEHICLE_TYPE, VEHICLE_TYPE_VALUES, type VehicleType } from '@xeprime/types';
import { ROUTES, SHOP_POLICIES_DEPOSIT_ANCHOR } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { DepositToggleCard } from '@/features/shop/components/DepositToggleCard';
import { usePaymentSettings, useUpdatePaymentSettings } from '@/features/shop/hooks/use-shop';
import { PolicyInfoTip } from '@/features/rental-policies/components/PolicyInfoTip';
import { ShopPolicyForm } from '@/features/rental-policies/components/ShopPolicyForm';
import { useSaveShopPolicy, useShopPolicy } from '@/features/rental-policies/hooks/use-shop-policy';
import { getErrorMessage } from '@/services/api-client';

import styles from './ShopPoliciesPage.module.css';

const { Title, Paragraph } = Typography;

/** Chính sách mặc định tách riêng theo loại xe; đơn đã chốt luôn giữ snapshot ở backend. */
export function ShopPoliciesPage() {
  const t = useTranslations('Shop.policies');
  const tShop = useTranslations('Shop');
  const { has } = usePermissions();
  const canView = has(PERMISSION.TENANT_VIEW);
  const canEdit = has(PERMISSION.TENANT_UPDATE);

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('forbidden.title')}
        description={t('forbidden.description')}
        missingPermissions={[PERMISSION.TENANT_VIEW]}
        action={
          <Link href={ROUTES.MANAGE.ROOT}>
            <Button type="primary">{tShop('page.forbidden.backHome')}</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('title')} subtitle={t('subtitle')} />
      <DepositCollectionSection />
      <PolicyWorkspace canEdit={canEdit} />
    </div>
  );
}

/**
 * Thanh toán GIỮ CHỖ qua XePrime — Phase 6 (ADR 0032 điều 2).
 *
 * Hai khoản tiền khác nhau, và trang này phải nói rõ là khác:
 *  - **khoản giữ chỗ** (`D`): khách chuyển TRƯỚC cho XePrime, là một phần của tiền thuê;
 *  - **cọc/thế chấp khi nhận xe**: gian hàng tự thu, tự giữ, tự hoàn — nó nằm trong form chính
 *    sách theo loại xe bên dưới.
 * Gọi cả hai là "cọc" (như bản trước) là cách nhanh nhất để một gian hàng tin rằng XePrime
 * đang giữ hộ khoản thế chấp của họ.
 *
 * Tenant-wide, KHÔNG theo loại xe, nên đứng TRƯỚC tabs `PolicyWorkspace` với tiêu đề riêng
 * thay vì làm một tab thứ ba — trộn vào tabs xe hơi/xe máy sẽ gợi ý sai rằng công tắc này
 * cũng khác nhau theo loại xe.
 *
 * Route KHÔNG gác theo `PLAN_FEATURE.ESCROW_HOLD` (ADR 0027 điều 4): gian hàng thiếu cờ vào
 * đây để ĐỌC trạng thái và hiểu tính năng thuộc gói nào; chặn thật nằm ở server cho đường
 * GHI. Ẩn hẳn section nếu thiếu quyền XEM (khác PermissionState chặn cả trang ở trên, vì đây
 * là quyền của một PHẦN trang, không phải của cả trang).
 */
function DepositCollectionSection() {
  const t = useTranslations('Shop.paymentSettings');
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

  return (
    // `id` là ĐÍCH của route cũ `/manage/shop/payment-settings` (giờ redirect kèm hash) — người
    // đã bookmark trang công tắc phải rơi đúng vào phần này, không phải đầu trang chính sách.
    <section id={SHOP_POLICIES_DEPOSIT_ANCHOR} className={styles.depositSection}>
      <Title level={2} className={styles.sectionTitle}>
        {t('title')}
      </Title>
      <Paragraph type="secondary">{t('subtitle')}</Paragraph>

      {/* Xem được nhưng không sửa được (vd. `shop_manager`): nói thẳng ra. Một công tắc mờ đi
          không có lời giải thích trông như lỗi hệ thống. */}
      {!canEdit ? (
        <Alert type="info" showIcon className={styles.readOnly} title={t('readOnly')} />
      ) : null}

      {isError && !data ? (
        <Result
          status="error"
          title={t('loadError')}
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      ) : null}

      {isLoading || (!data && !isError) ? <Skeleton active paragraph={{ rows: 6 }} /> : null}

      {data ? (
        <DepositToggleCard
          settings={data}
          canEdit={canEdit}
          saving={update.isPending}
          onChange={(enabled) =>
            update.mutate(
              { depositCollectionEnabled: enabled },
              {
                onSuccess: () => message.success(t('toggle.saved')),
                onError: (error) => message.error(errorMessage(error)),
              },
            )
          }
        />
      ) : null}
    </section>
  );
}

/** Một workspace theo loại xe: query, mutation và form không bị lẫn dữ liệu giữa hai tab. */
function PolicyWorkspace({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('Shop.policies');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const domainLabel = useDomainLabel();
  const { message } = App.useApp();
  const [vehicleType, setVehicleType] = useState<VehicleType>(VEHICLE_TYPE.CAR);
  const { data, isLoading, isError, refetch } = useShopPolicy(vehicleType);
  const save = useSaveShopPolicy(vehicleType);
  /*
   * Nhãn loại xe dựng lúc RENDER qua `Domain.vehicleType`, không lấy từ `VEHICLE_TYPE_LABEL`:
   * bảng đó là chuỗi tiếng Việt đóng băng ở module scope, nên giao diện tiếng Anh vẫn hiện
   * "Ô tô" — và ở SSR nó còn đóng băng ngôn ngữ của request ĐẦU TIÊN trong tiến trình.
   */
  const vehicleLabel = domainLabel('vehicleType', vehicleType).toLocaleLowerCase(locale);

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarMeta}>
          {data ? (
            <span className={styles.appliedPill}>
              <CheckCircleOutlined aria-hidden="true" />
              <span>{t('applied', { count: data.inheritingVehicles, vehicle: vehicleLabel })}</span>
              {data.overriddenVehicles > 0 ? (
                <PolicyInfoTip label={t('appliedTipLabel')} placement="bottomRight">
                  {t('overridden', { count: data.overriddenVehicles })}
                </PolicyInfoTip>
              ) : null}
            </span>
          ) : null}
        </div>

        <Tabs
          className={styles.vehicleTabs}
          activeKey={vehicleType}
          onChange={(key) => setVehicleType(key as VehicleType)}
          items={VEHICLE_TYPE_VALUES.map((value) => ({
            key: value,
            label: (
              <span className={styles.tabLabel}>
                {value === VEHICLE_TYPE.CAR ? (
                  <CarOutlined aria-hidden="true" />
                ) : (
                  <DashboardOutlined aria-hidden="true" />
                )}
                {domainLabel('vehicleType', value)}
              </span>
            ),
          }))}
        />
      </div>

      {isError && !data ? (
        <Result
          status="error"
          title={t('loadError')}
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      ) : null}

      {isLoading || (!data && !isError) ? (
        <div className={styles.loadingCard}>
          <Skeleton active paragraph={{ rows: 10 }} />
        </div>
      ) : null}

      {data ? (
        <ShopPolicyForm
          key={vehicleType}
          initial={data}
          canEdit={canEdit}
          submitting={save.isPending}
          onSubmit={(body) =>
            save.mutate(body, {
              onSuccess: () =>
                message.success(t('saved', { vehicle: domainLabel('vehicleType', vehicleType) })),
              onError: (error) => message.error(getErrorMessage(error)),
            })
          }
        />
      ) : null}
    </>
  );
}
