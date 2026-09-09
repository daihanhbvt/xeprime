'use client';

import { CheckCircleOutlined, CarOutlined, DashboardOutlined } from '@ant-design/icons';
import { App, Button, Result, Skeleton, Tabs } from 'antd';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { PERMISSION, VEHICLE_TYPE, VEHICLE_TYPE_VALUES, type VehicleType } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { PolicyInfoTip } from '@/features/rental-policies/components/PolicyInfoTip';
import { ShopPolicyForm } from '@/features/rental-policies/components/ShopPolicyForm';
import { useSaveShopPolicy, useShopPolicy } from '@/features/rental-policies/hooks/use-shop-policy';
import { getErrorMessage } from '@/services/api-client';

import styles from './page.module.css';

/** Chính sách mặc định tách riêng theo loại xe; đơn đã chốt luôn giữ snapshot ở backend. */
export default function ShopPoliciesPage() {
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
      <PolicyWorkspace canEdit={canEdit} />
    </div>
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
