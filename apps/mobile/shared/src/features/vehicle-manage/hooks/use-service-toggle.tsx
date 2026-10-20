import { useState, type ReactNode } from 'react';
import { Text } from 'tamagui';
import { readServiceInUseDetails, type ServiceInUseDetails } from '@xeprime/domain';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  SERVICE_TYPE,
  isServiceType,
  isVehicleServiceTypeAllowed,
  type ServiceType,
} from '@xeprime/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useUpdateVehicle } from '@/features/vehicles/hooks/use-vehicle';
import type { VehicleDetail } from '@/features/vehicles/api';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useAppFormat } from '@/i18n/use-app-format';
import { getErrorCode, getErrorDetails } from '@/lib/api-client';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { colors } from '@/theme/tokens';

export interface ServiceToggleState {
  /** Vì sao KHÔNG bật/tắt được — `null` = được. Nhãn đã dịch để nơi gọi hiện thẳng. */
  blockedReason: (service: ServiceType, enabled: boolean) => string | null;
  toggle: (service: ServiceType, enabled: boolean) => void;
  pending: boolean;
  /** Hộp xác nhận — nơi gọi đặt vào cây một lần. */
  dialog: ReactNode;
}

/**
 * Công tắc dịch vụ của một chiếc xe — MỘT luật cho mục lục quản lý xe và cho nút "Bật" ở màn bị
 * khoá. Bản native của `use-service-toggle.tsx` bên web.
 *
 * Gửi `serviceTypes` ĐẦY ĐỦ (mảng hiện có ± một dịch vụ) chứ không phải một mảng mới: thuê dài
 * hạn và mọi dịch vụ không liên quan giữ nguyên. Không bao giờ gửi mảng rỗng — xe phải giữ ít
 * nhất một dịch vụ. Tắt một dịch vụ đang có giá chuyên biệt thì hỏi lại, vì server dọn giá mồ côi.
 */
export function useServiceToggle(vehicle: VehicleDetail, canEdit: boolean): ServiceToggleState {
  const t = useTranslations('VehicleManage');
  const tCommon = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const update = useUpdateVehicle(vehicle.id);
  const [pendingChange, setPendingChange] = useState<{
    service: ServiceType;
    enabled: boolean;
    next: ServiceType[];
  } | null>(null);
  /*
   * Tắt dịch vụ khi còn chuyến đang mở dùng nó ⇒ 409 `VEHICLE_SERVICE_IN_USE` kèm danh sách chuyến
   * vướng — gương hộp của web: câu lỗi theo MÃ + mã đơn bấm được để mở đơn đó.
   */
  const [inUse, setInUse] = useState<{ message: string; details: ServiceInUseDetails } | null>(
    null,
  );
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

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

  function commit(service: ServiceType, enabled: boolean, next: ServiceType[]) {
    update.mutate(
      { serviceTypes: next },
      {
        onSuccess: () =>
          toast.showSuccess(
            t(enabled ? 'serviceToggle.enabled' : 'serviceToggle.disabled', {
              service: domainLabel('serviceType', service),
            }),
          ),
        onError: (err) => {
          const details =
            getErrorCode(err) === API_ERROR_CODE.VEHICLE_SERVICE_IN_USE
              ? readServiceInUseDetails(getErrorDetails(err))
              : null;
          if (details) setInUse({ message: errorMessage(err), details });
          else toast.showError(errorMessage(err));
        },
        onSettled: () => setPendingChange(null),
      },
    );
  }

  function toggle(service: ServiceType, enabled: boolean) {
    if (blockedReason(service, enabled)) return;
    const next = enabled
      ? [...new Set([...current, service])]
      : current.filter((s) => s !== service);
    if (next.length === 0) return;
    /*
     * Chỉ còn MỘT lý do phải hỏi: tắt một dịch vụ đang có giá riêng sẽ XOÁ giá đó (server dọn giá
     * mồ côi). Bật/tắt dịch vụ của xe công khai không còn kéo xe về chờ duyệt lại từ 09/09/2026,
     * nên không hỏi lại chuyện đã không còn xảy ra.
     */
    if (!enabled && priceLoss(service)) {
      setPendingChange({ service, enabled, next });
      return;
    }
    commit(service, enabled, next);
  }

  const dialog = (
    <>
      <AlertDialog
        open={pendingChange !== null}
        title={t('serviceToggle.priceLossTitle')}
        message={t('serviceToggle.priceLossBody')}
        confirmLabel={t('serviceToggle.confirmOk')}
        cancelLabel={tCommon('cancel')}
        destructive
        loading={update.isPending}
        onCancel={() => setPendingChange(null)}
        onConfirm={() =>
          pendingChange && commit(pendingChange.service, pendingChange.enabled, pendingChange.next)
        }
      />
      <AlertDialog
        open={inUse !== null}
        title={t('serviceToggle.inUse.title')}
        message={
          inUse ? (
            <>
              {inUse.message}
              {inUse.details.bookings.length > 0 ? `\n\n${t('serviceToggle.inUse.bookings')}` : ''}
              {inUse.details.bookings.map((b) => (
                <Text key={b.id}>
                  {'\n• '}
                  <Text
                    col={colors.primaryActive}
                    textDecorationLine="underline"
                    onPress={() => {
                      setInUse(null);
                      navigateOnce(ROUTES.manage.bookingDetail(b.id));
                    }}
                  >
                    {b.code}
                  </Text>
                  {` · ${domainLabel('serviceType', b.serviceType)} · ${fmt.shortDateTime(b.pickupAt)}`}
                </Text>
              ))}
              {inUse.details.requestCount > 0
                ? `\n\n${t('serviceToggle.inUse.requests', { count: inUse.details.requestCount })}`
                : ''}
            </>
          ) : null
        }
        confirmLabel={t('serviceToggle.inUse.close')}
        onConfirm={() => setInUse(null)}
        onCancel={() => setInUse(null)}
      />
    </>
  );

  return { blockedReason, toggle, pending: update.isPending, dialog };
}
