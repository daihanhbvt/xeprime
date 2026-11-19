import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { withDriverEnableSchema, type WithDriverEnableValues } from '@xeprime/validators';
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
import { MoneyField } from '@/components/ui/MoneyField';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { space } from '@/theme/tokens';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useUpdateVehicle } from '@/features/vehicles/hooks/use-vehicle';
import type { VehicleDetail } from '@/features/vehicles/api';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useAppFormat } from '@/i18n/use-app-format';
import { getErrorCode, getErrorDetails } from '@/lib/api-client';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useColors } from '@/theme/ThemeProvider';

const WITH_DRIVER_PRICE_KEYS = [
  'withDriverDailyPrice',
  'withDriverInterCityPrice',
  'withDriverOneWayPrice',
] as const;

/**
 * Lỗi `WITH_DRIVER_PRICE_OUT_OF_RANGE` của server mang `{ field, min, max }` - đọc ra để đặt lỗi
 * NGAY DƯỚI ô sai (kèm khoảng hợp lệ) thay vì một toast chung không nói ô nào.
 */
function readPriceRange(
  details: unknown,
): { field: (typeof WITH_DRIVER_PRICE_KEYS)[number]; min: string; max: string } | null {
  if (!details || typeof details !== 'object') return null;
  const { field, min, max } = details as Record<string, unknown>;
  const key = WITH_DRIVER_PRICE_KEYS.find((k) => k === field);
  if (!key || min == null || max == null) return null;
  return { field: key, min: String(min), max: String(max) };
}

export interface ServiceToggleState {
  /** Vì sao KHÔNG bật/tắt được — `null` = được. Nhãn đã dịch để nơi gọi hiện thẳng. */
  blockedReason: (service: ServiceType, enabled: boolean) => string | null;
  toggle: (service: ServiceType, enabled: boolean) => void;
  /**
   * Công tắc của dịch vụ này đang hiện BẬT tạm vì hộp nhập giá có tài xế đang mở (chưa lưu gì).
   * Đóng hộp mà không lưu ⇒ công tắc về tắt. Nơi gọi: `checked = serviceOn || showsOn(service)`.
   */
  showsOn: (service: ServiceType) => boolean;
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
  const colors = useColors();
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
  const tPricing = useTranslations('Vehicles.pricing');
  /*
   * BẬT xe có tài xế khi xe chưa đủ ba giá ⇒ hộp nhập giá (19/11/2026, gương web). Công tắc KHÔNG
   * lưu gì cho tới khi bấm "Bật dịch vụ": dịch vụ + ba giá đi chung MỘT lượt ghi. Huỷ = về tắt.
   */
  const [withDriverNext, setWithDriverNext] = useState<ServiceType[] | null>(null);
  const priceResolver = useValidationResolver<WithDriverEnableValues>(
    withDriverEnableSchema,
    'Vehicles.pricing.validation',
  );
  const priceForm = useForm<WithDriverEnableValues>({
    resolver: priceResolver,
    defaultValues: {
      withDriverDailyPrice: null,
      withDriverInterCityPrice: null,
      withDriverOneWayPrice: null,
    },
  });
  const withDriverPriced = Boolean(
    vehicle.withDriverDailyPrice && vehicle.withDriverInterCityPrice && vehicle.withDriverOneWayPrice,
  );

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

  function commit(
    service: ServiceType,
    enabled: boolean,
    next: ServiceType[],
    prices?: WithDriverEnableValues,
  ) {
    update.mutate(
      {
        serviceTypes: next,
        ...(prices
          ? {
              withDriverDailyPrice: String(prices.withDriverDailyPrice),
              withDriverInterCityPrice: String(prices.withDriverInterCityPrice),
              withDriverOneWayPrice: String(prices.withDriverOneWayPrice),
            }
          : {}),
      },
      {
        onSuccess: () => {
          if (prices) closeWithDriver();
          toast.showSuccess(
            t(enabled ? 'serviceToggle.enabled' : 'serviceToggle.disabled', {
              service: domainLabel('serviceType', service),
            }),
          );
        },
        onError: (err) => {
          const details =
            getErrorCode(err) === API_ERROR_CODE.VEHICLE_SERVICE_IN_USE
              ? readServiceInUseDetails(getErrorDetails(err))
              : null;
          const range =
            prices && getErrorCode(err) === API_ERROR_CODE.WITH_DRIVER_PRICE_OUT_OF_RANGE
              ? readPriceRange(getErrorDetails(err))
              : null;
          if (range) {
            priceForm.setError(range.field, {
              message: t('serviceToggle.withDriverPriceRange', {
                min: fmt.money(range.min),
                max: fmt.money(range.max),
              }),
            });
          } else if (details) setInUse({ message: errorMessage(err), details });
          else toast.showError(errorMessage(err));
        },
        onSettled: () => setPendingChange(null),
      },
    );
  }

  function closeWithDriver() {
    setWithDriverNext(null);
    priceForm.reset();
  }

  const submitWithDriver = priceForm.handleSubmit((prices) => {
    if (withDriverNext) commit(SERVICE_TYPE.WITH_DRIVER, true, withDriverNext, prices);
  });

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
    if (enabled && service === SERVICE_TYPE.WITH_DRIVER && !withDriverPriced) {
      setWithDriverNext(next);
      return;
    }
    commit(service, enabled, next);
  }

  const dialog = (
    <>
      <AlertDialog
        open={withDriverNext !== null}
        title={t('serviceToggle.withDriverPricesTitle')}
        message={t('serviceToggle.withDriverPricesBody')}
        body={
          <YStack gap={space.sm}>
            <MoneyField
              control={priceForm.control}
              name="withDriverDailyPrice"
              unit={tPricing('unitPerDay')}
              label={tPricing('withDriver.daily')}
              required
            />
            <MoneyField
              control={priceForm.control}
              name="withDriverInterCityPrice"
              unit={tPricing('unitPerDay')}
              label={tPricing('withDriver.interCity')}
              required
            />
            <MoneyField
              control={priceForm.control}
              name="withDriverOneWayPrice"
              unit={tPricing('unitPerDay')}
              label={tPricing('withDriver.oneWay')}
              required
            />
          </YStack>
        }
        confirmLabel={t('serviceToggle.withDriverPricesOk')}
        cancelLabel={tCommon('cancel')}
        loading={update.isPending}
        onCancel={closeWithDriver}
        onConfirm={() => void submitWithDriver()}
      />
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
                  {` · ${domainLabel('serviceType', b.serviceType)} · ${fmt.rentalAt(b.pickupAt)}`}
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

  const showsOn = (service: ServiceType) =>
    service === SERVICE_TYPE.WITH_DRIVER && withDriverNext !== null;

  return { blockedReason, toggle, showsOn, pending: update.isPending, dialog };
}
