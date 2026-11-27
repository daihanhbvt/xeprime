'use client';

import { App, Button, Skeleton } from 'antd';
import { EmptyState } from '@/components/feedback/EmptyState';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';
import { PERMISSION, VEHICLE_TYPE, VEHICLE_TYPE_VALUES, type VehicleType } from '@xeprime/types';

import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { SegmentedTabs } from '@/components/navigation/SegmentedTabs';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';

import {
  useShopOperationDefaults,
  useShopPolicy,
  useShopRentalTerms,
} from '../hooks/use-shop-policy';
import { PoliciesLayout } from './PoliciesLayout';
import { ShopPaymentCard } from './ShopPaymentCard';
import { ShopPolicyForm } from './ShopPolicyForm';
import styles from './ShopPolicies.module.css';

/** `?type=` — loại xe đang xem; giá trị lạ về Ô tô. */
const TYPE_PARAM = 'type';

function parseVehicleType(raw: string | null): VehicleType {
  return VEHICLE_TYPE_VALUES.includes(raw as VehicleType) ? (raw as VehicleType) : VEHICLE_TYPE.CAR;
}

/**
 * Cấu hình › Chính sách thuê (design `23874:63907`). Chính sách mặc định tách theo LOẠI XE (tab Ô tô ·
 * Xe máy ở đầu trang, số = xe của loại đó); thanh toán giữ chỗ + hoá đơn VAT là của cả gian hàng.
 * Đơn đã chốt luôn giữ snapshot ở backend.
 */
export function ShopPoliciesPage() {
  const t = useTranslations('Shop.policies');
  const tShop = useTranslations('Shop');
  const { has } = usePermissions();

  if (!has(PERMISSION.TENANT_VIEW)) {
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
  return <PoliciesWorkspace canEdit={has(PERMISSION.TENANT_UPDATE)} />;
}

function PoliciesWorkspace({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('Shop.policies');
  const tWorkspace = useTranslations('Shop.policies.workspace');
  const tCommon = useTranslations('Common');
  const locale = useLocale();
  const domainLabel = useDomainLabel();
  const { modal } = App.useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vehicleType = parseVehicleType(searchParams.get(TYPE_PARAM));
  const dirtyRef = useRef(false);

  // Cả hai loại để đếm số xe trên tab; cache theo loại nên đổi tab không tải lại.
  const car = useShopPolicy(VEHICLE_TYPE.CAR);
  const motorbike = useShopPolicy(VEHICLE_TYPE.MOTORBIKE);
  const policy = vehicleType === VEHICLE_TYPE.CAR ? car : motorbike;
  const defaults = useShopOperationDefaults(vehicleType);
  const terms = useShopRentalTerms();

  const label = (type: VehicleType) => domainLabel('vehicleType', type);
  const count = (data: typeof car.data) =>
    data ? data.inheritingVehicles + data.overriddenVehicles : undefined;

  const goTo = (next: VehicleType) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === VEHICLE_TYPE.CAR) params.delete(TYPE_PARAM);
    else params.set(TYPE_PARAM, next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const requestType = (next: VehicleType) => {
    if (next === vehicleType) return;
    if (!dirtyRef.current) return goTo(next);
    modal.confirm({
      title: tWorkspace('switchType.title'),
      content: tWorkspace('switchType.body', {
        vehicle: label(vehicleType).toLocaleLowerCase(locale),
        next: label(next).toLocaleLowerCase(locale),
      }),
      okText: tWorkspace('switchType.ok'),
      cancelText: tCommon('actions.cancel'),
      onOk: () => goTo(next),
    });
  };

  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  const leading = <ShopPaymentCard canEditVat={canEdit} />;
  const failed =
    (policy.isError && !policy.data) ||
    (defaults.isError && !defaults.data) ||
    (terms.isError && !terms.data);

  return (
    <div className={styles.page}>
      <ManagePageHeader
        title={tWorkspace('title')}
        subtitle={tWorkspace('subtitle')}
        extra={
          <SegmentedTabs
            label={tWorkspace('vehicleTabsLabel')}
            value={vehicleType}
            onChange={requestType}
            items={VEHICLE_TYPE_VALUES.map((value) => ({
              value,
              label: label(value),
              count: count(value === VEHICLE_TYPE.CAR ? car.data : motorbike.data),
            }))}
          />
        }
      />

      {policy.data && defaults.data && terms.data ? (
        <ShopPolicyForm
          // Đổi loại xe là một form khác — không để RHF mang giá trị loại này sang loại kia.
          key={vehicleType}
          vehicleType={vehicleType}
          vehicleLabel={label(vehicleType)}
          initial={policy.data}
          defaults={defaults.data}
          terms={terms.data}
          canEdit={canEdit}
          leading={leading}
          onDirtyChange={onDirtyChange}
        />
      ) : (
        <PoliciesLayout>
          <div className={styles.main}>
            {leading}
            {failed ? (
              <div className={styles.card}>
                <EmptyState
                  variant="error"
                  title={t('loadError')}
                  action={
                    <Button
                      type="primary"
                      onClick={() => {
                        if (policy.isError) void policy.refetch();
                        if (defaults.isError) void defaults.refetch();
                        if (terms.isError) void terms.refetch();
                      }}
                    >
                      {tCommon('actions.retry')}
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className={styles.card}>
                <Skeleton active paragraph={{ rows: 10 }} />
              </div>
            )}
          </div>
        </PoliciesLayout>
      )}
    </div>
  );
}
