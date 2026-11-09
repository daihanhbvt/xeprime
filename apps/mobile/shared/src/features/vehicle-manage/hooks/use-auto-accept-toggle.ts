import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import type { VehicleServiceSetting } from '../api';
import { usePatchVehicleServiceSetting } from './use-vehicle-settings';

export interface AutoAcceptToggleState {
  /** Giá trị đang hiện — gồm cả lượt bấm lạc quan chưa có phản hồi. */
  enabled: boolean;
  pending: boolean;
  /** Có tài xế chưa đủ năng lực (chưa ai nhận lượt) mà công tắc đang tắt: không cho BẬT. */
  blocked: boolean;
  disabled: boolean;
  change: (next: boolean) => void;
}

/**
 * Công tắc "Tự động đồng ý nhận chuyến" LƯU NGAY — bản native của web `useAutoAcceptToggle`, dùng
 * chung cho thẻ "Tối ưu nhận chuyến" ở chi tiết xe và màn thiết lập. Giá trị lạc quan gắn với
 * `updatedAt` của bản đang hiện: bản mới về thì nhường dữ liệu server; lỗi thì trả công tắc về cũ.
 */
export function useAutoAcceptToggle({
  vehicleId,
  setting,
  canEdit,
}: {
  vehicleId: string;
  setting: VehicleServiceSetting;
  canEdit: boolean;
}): AutoAcceptToggleState {
  const t = useTranslations('VehicleManage');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const patch = usePatchVehicleServiceSetting(vehicleId, setting.serviceType as ServiceType);
  const [optimistic, setOptimistic] = useState<{ value: boolean; basis: string | null } | null>(
    null,
  );

  const enabled =
    optimistic && optimistic.basis === (setting.updatedAt ?? null)
      ? optimistic.value
      : setting.autoAcceptEnabled;
  const capability =
    setting.serviceType === SERVICE_TYPE.WITH_DRIVER ? setting.withDriverAutoAccept : null;
  const blocked = capability ? !capability.available && !setting.autoAcceptEnabled : false;

  function change(next: boolean) {
    setOptimistic({ value: next, basis: setting.updatedAt ?? null });
    patch.mutate(
      { autoAcceptEnabled: next },
      {
        onSuccess: () => toast.showSuccess(t('autoAccept.saved')),
        onError: (err) => {
          setOptimistic(null);
          toast.showError(errorMessage(err));
        },
      },
    );
  }

  return {
    enabled,
    pending: patch.isPending,
    blocked,
    disabled: !canEdit || patch.isPending || blocked,
    change,
  };
}
