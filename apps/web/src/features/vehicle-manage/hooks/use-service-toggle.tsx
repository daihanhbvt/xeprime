'use client';

import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import {
  SERVICE_TYPE,
  isServiceType,
  isVehicleServiceTypeAllowed,
  type ServiceType,
} from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useUpdateVehicle } from '@/features/vehicles/hooks/use-vehicle-mutations';
import type { VehicleDetail } from '@/features/vehicles/types';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';

export interface ServiceToggleState {
  /** Vì sao KHÔNG bật/tắt được — `null` = được. Nhãn đã dịch để tooltip dùng thẳng. */
  blockedReason: (service: ServiceType, enabled: boolean) => string | null;
  toggle: (service: ServiceType, enabled: boolean) => void;
  pending: boolean;
  /** Hộp xác nhận — nơi gọi đặt vào cây một lần. */
  dialog: ReactNode;
}

/**
 * Công tắc dịch vụ trên menu quản lý xe — MỘT luật cho sidebar và cho nút "Bật" ở màn bị khoá.
 *
 * Gửi `serviceTypes` ĐẦY ĐỦ (mảng hiện có ± một dịch vụ) chứ không phải một mảng mới: thuê dài
 * hạn và mọi dịch vụ không liên quan giữ nguyên. Không bao giờ gửi mảng rỗng — xe phải giữ ít
 * nhất một dịch vụ. Xe đang công khai thì `serviceTypes` là trường nhạy cảm (ADR 0008): hỏi lại
 * trước khi lưu, đúng như `VehicleEditWorkspace` làm; tắt dịch vụ có giá chuyên biệt thì nói rõ
 * giá đó sẽ bị xoá (server `orphanPriceClears`).
 */
export function useServiceToggle(vehicle: VehicleDetail, canEdit: boolean): ServiceToggleState {
  const t = useTranslations('VehicleManage');
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const update = useUpdateVehicle(vehicle.id);
  const [pendingChange, setPendingChange] = useState<{
    service: ServiceType;
    enabled: boolean;
    next: ServiceType[];
  } | null>(null);

  // Mã lạ trong dữ liệu cũ không được kéo theo vào lệnh ghi — lọc về đúng union rồi mới gửi.
  const current = (vehicle.serviceTypes ?? []).filter(isServiceType);

  function blockedReason(service: ServiceType, enabled: boolean): string | null {
    if (!canEdit) return t('nav.toggleNoPermission');
    if (enabled && !isVehicleServiceTypeAllowed(vehicle.vehicleType, service)) {
      return t('nav.toggleNotAllowed');
    }
    if (!enabled && current.length <= 1 && current.includes(service)) {
      return t('nav.toggleLastService');
    }
    return null;
  }

  function priceLoss(service: ServiceType): boolean {
    if (service === SERVICE_TYPE.WITH_DRIVER) {
      return Boolean(
        vehicle.withDriverDailyPrice ||
          vehicle.withDriverInterCityPrice ||
          vehicle.withDriverOneWayPrice,
      );
    }
    if (service === SERVICE_TYPE.LONG_TERM) return Boolean(vehicle.monthlyPrice);
    return false;
  }

  async function commit(service: ServiceType, enabled: boolean, next: ServiceType[]) {
    try {
      await update.mutateAsync({ serviceTypes: next });
      message.success(
        t(enabled ? 'serviceToggle.enabled' : 'serviceToggle.disabled', {
          service: domainLabel('serviceType', service),
        }),
      );
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setPendingChange(null);
    }
  }

  function toggle(service: ServiceType, enabled: boolean) {
    if (blockedReason(service, enabled)) return;
    const next = enabled
      ? [...new Set([...current, service])]
      : current.filter((s) => s !== service);
    if (next.length === 0) return;
    /*
     * Chỉ còn MỘT lý do phải hỏi: tắt một dịch vụ đang có giá riêng sẽ XOÁ giá đó (server dọn
     * giá mồ côi). Bật/tắt dịch vụ của xe công khai không còn kéo xe về chờ duyệt lại từ
     * 09/09/2026, nên không hỏi lại chuyện đã không còn xảy ra.
     */
    if (!enabled && priceLoss(service)) {
      setPendingChange({ service, enabled, next });
      return;
    }
    void commit(service, enabled, next);
  }

  const dialog = (
    <ResponsiveDialog
      open={pendingChange !== null}
      title={t('serviceToggle.priceLossTitle')}
      size="sm"
      confirmLoading={update.isPending}
      onClose={() => setPendingChange(null)}
      onOk={() =>
        pendingChange && void commit(pendingChange.service, pendingChange.enabled, pendingChange.next)
      }
      okText={t('serviceToggle.confirmOk')}
      destructive={Boolean(pendingChange && !pendingChange.enabled)}
    >
      {pendingChange && !pendingChange.enabled && priceLoss(pendingChange.service) ? (
        <p>{t('serviceToggle.priceLossBody')}</p>
      ) : null}
    </ResponsiveDialog>
  );

  return { blockedReason, toggle, pending: update.isPending, dialog };
}
