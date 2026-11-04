'use client';

import { Alert, App, Button, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { ROUTES } from '@/constants/routes';
import {
  useSaveVehiclePricing,
  useVehiclePricing,
} from '@/features/rental-policies/hooks/use-vehicle-pricing';
import {
  useVehiclePricingForm,
  type VehiclePricingFormApi,
} from '@/features/rental-policies/hooks/use-vehicle-pricing-form';
import type { VehiclePricing } from '@/features/rental-policies/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { useErrorMessage } from '@/i18n/use-error-message';

import type { VehicleDetail } from '../../types';
import { useEditForm } from './edit-actions';
import styles from './EditPanes.module.css';

export interface PricedFormProps {
  api: VehiclePricingFormApi;
  pricing: VehiclePricing;
  /** Khối chính sách sửa được không: đang ghi đè (cổng quản lý) hoặc chủ xe sửa thẳng. */
  policyEditable: boolean;
}

/**
 * Nạp "Giá & chính sách" của xe và dựng form của nó cho MỘT mục màn sửa xe (Dịch vụ xe · Giao nhận).
 * Form đăng ký với cột phải dưới khoá `pricing`; mỗi mục một bản form, cùng một lệnh lưu trọn gói.
 *
 * Cổng quản lý có công tắc "Áp dụng chính sách của gian hàng"; chủ xe tuyến hoa hồng không có trang
 * chính sách gian hàng nên sửa thẳng (`direct`) — như màn giá cũ của họ.
 */
export function PricingForm({
  vehicle,
  onInvalid,
  children,
}: {
  vehicle: VehicleDetail;
  onInvalid?: (fields: string[]) => void;
  /**
   * `priced` là `null` khi giá đang tải hoặc tải lỗi — `pricingState` là khối thay thế (khung tải /
   * lỗi + thử lại) để mục đặt vào ĐÚNG chỗ của giá, phần còn lại của mục vẫn dùng được.
   */
  children: (priced: PricedFormProps | null, pricingState: ReactNode) => ReactNode;
}) {
  const t = useTranslations('Vehicles.edit.pricingTab');
  const tActions = useTranslations('Common.actions');
  const pricing = useVehiclePricing(vehicle.id);

  if (pricing.isLoading) return <>{children(null, <Skeleton active paragraph={{ rows: 8 }} />)}</>;
  if (pricing.isError || !pricing.data) {
    return children(
      null,
      <Alert
        type="error"
        showIcon
        title={t('loadError')}
        description={
          <Button size="small" onClick={() => void pricing.refetch()}>
            {tActions('retry')}
          </Button>
        }
      />,
    );
  }
  return (
    <PricedForm vehicle={vehicle} pricing={pricing.data} onInvalid={onInvalid}>
      {children}
    </PricedForm>
  );
}

function PricedForm({
  vehicle,
  pricing,
  onInvalid,
  children,
}: {
  vehicle: VehicleDetail;
  pricing: VehiclePricing;
  onInvalid?: (fields: string[]) => void;
  children: (priced: PricedFormProps | null, pricingState: ReactNode) => ReactNode;
}) {
  const t = useTranslations('Vehicles.edit.pricingTab');
  const { isManage } = useWorkspace();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const save = useSaveVehiclePricing(vehicle.id);

  const api = useVehiclePricingForm({
    vehicleName: vehicle.name,
    pricing,
    policySource: isManage ? 'switch' : 'direct',
    onInvalid,
    save: async (body) => {
      try {
        await save.mutateAsync(body);
        message.success(t('saved'));
      } catch (err) {
        message.error(errorMessage(err));
        throw err;
      }
    },
  });

  useEditForm('pricing', {
    dirty: api.dirty,
    submitting: api.submitting,
    submit: api.submit,
    reset: api.discard,
  });

  return <>{children({ api, pricing, policyEditable: api.direct || api.editMode }, null)}</>;
}

/**
 * Dòng nhắc ở khối chính sách khi xe đang theo chính sách gian hàng (design vẽ công tắc ở từng khối;
 * dữ liệu chỉ có MỘT công tắc cho cả xe — nó nằm ở đầu mục "Dịch vụ xe").
 */
export function InheritedPolicyNote({ onOpenSwitch }: { onOpenSwitch?: () => void }) {
  const t = useTranslations('Vehicles.editor.policy');
  return (
    <p className={styles.inheritNote}>
      {t.rich(onOpenSwitch ? 'inheritedElsewhere' : 'inherited', {
        policies: (chunks) => <Link href={ROUTES.MANAGE.SHOP_POLICIES}>{chunks}</Link>,
        switch: (chunks) =>
          onOpenSwitch ? (
            <button type="button" className={styles.linkButton} onClick={onOpenSwitch}>
              {chunks}
            </button>
          ) : (
            chunks
          ),
      })}
    </p>
  );
}
