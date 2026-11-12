'use client';

import { App } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SERVICE_TYPE } from '@xeprime/types';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { useErrorMessage } from '@/i18n/use-error-message';
import { usePatchVehicleServiceSetting } from '../hooks';
import type { VehicleServiceSetting } from '../types';

export interface AutoAcceptToggleState {
  /** Giá trị đang hiện — gồm cả lượt bấm lạc quan chưa có phản hồi. */
  enabled: boolean;
  pending: boolean;
  /**
   * Công tắc có bấm được không. Tắt luôn được; BẬT thì có tài xế còn cần năng lực tài xế
   * (`withDriverAutoAccept.available`). Phiên hỗ trợ chỉ thấy trạng thái (ADR 0050 §13).
   */
  disabled: boolean;
  change: (next: boolean) => Promise<void>;
}

/**
 * Công tắc "Tự động đồng ý nhận chuyến" của MỘT dịch vụ — LƯU NGAY khi bấm, chỉ gửi
 * `autoAcceptEnabled` (server gộp từng trường, các ô khác của thiết lập giữ nguyên).
 *
 * Một hook cho mọi nơi đặt công tắc (thẻ "Tối ưu nhận chuyến" của Hồ sơ xe, mục dịch vụ của màn
 * sửa): cùng giá trị lạc quan, cùng cổng năng lực, cùng câu báo — hai bản tự viết sẽ lệch nhau ở
 * đúng ca khó (có tài xế chưa có tài xế nào nhận lượt).
 *
 * Giá trị lạc quan gắn với `updatedAt` của bản đang hiển thị: bản mới (đã lưu) về thì tự nhường chỗ
 * cho dữ liệu server; lỗi thì bỏ và trả công tắc về như cũ.
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
  const t = useTranslations('VehicleManage.autoAccept');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const locked = useSupportHides(SUPPORT_HIDDEN_AREA.AUTO_ACCEPT);
  const patch = usePatchVehicleServiceSetting(vehicleId, setting.serviceType);
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

  async function change(next: boolean) {
    setOptimistic({ value: next, basis: setting.updatedAt ?? null });
    try {
      await patch.mutateAsync({ autoAcceptEnabled: next });
      message.success(t('saved'));
    } catch (err) {
      setOptimistic(null);
      message.error(errorMessage(err));
    }
  }

  return {
    enabled,
    pending: patch.isPending,
    disabled: !canEdit || locked || patch.isPending || blocked,
    change,
  };
}
