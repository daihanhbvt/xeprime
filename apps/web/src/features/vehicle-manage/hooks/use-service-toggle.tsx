'use client';

import { App, Button } from 'antd';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { withDriverEnableSchema, type WithDriverEnableValues } from '@xeprime/validators';
import { readServiceInUseDetails, type ServiceInUseDetails } from '@xeprime/domain';
import {
  API_ERROR_CODE,
  SERVICE_TYPE,
  isServiceType,
  isVehicleServiceTypeAllowed,
  type ServiceType,
} from '@xeprime/types';
import { NumberField } from '@/components/form/NumberField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useUpdateVehicle } from '@/features/vehicles/hooks/use-vehicle-mutations';
import type { VehicleDetail } from '@/features/vehicles/types';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { bookingPath } from '@/constants/routes';
import { getErrorCode, getErrorDetails } from '@/services/api-client';
import { useAppFormat } from '@/i18n/use-app-format';

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
  /** Vì sao KHÔNG bật/tắt được — `null` = được. Nhãn đã dịch để tooltip dùng thẳng. */
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
  /*
   * Tắt dịch vụ khi còn chuyến đang mở dùng nó ⇒ 409 `VEHICLE_SERVICE_IN_USE` kèm danh sách
   * chuyến vướng. Toast một dòng không chứa nổi "mở đơn nào" — hiện hộp có link tới từng đơn.
   */
  const [inUse, setInUse] = useState<{ message: string; details: ServiceInUseDetails } | null>(
    null,
  );
  const fmt = useAppFormat();
  const tPricing = useTranslations('Vehicles.pricing');
  /*
   * BẬT xe có tài xế khi xe chưa đủ ba giá ⇒ hộp nhập giá (19/11/2026). Công tắc KHÔNG lưu gì cho
   * tới khi bấm "Bật dịch vụ": dịch vụ + ba giá đi chung MỘT lượt ghi, nên không còn xe "đã bật mà
   * chưa có giá" (F5 vẫn thấy bật). Huỷ hộp = công tắc về tắt. Server chặn cùng luật.
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

  /** Xe đã có ĐỦ ba giá có tài xế (bật lại dịch vụ thì không cần hỏi giá). */
  const withDriverPriced = Boolean(
    vehicle.withDriverDailyPrice && vehicle.withDriverInterCityPrice && vehicle.withDriverOneWayPrice,
  );

  async function commit(
    service: ServiceType,
    enabled: boolean,
    next: ServiceType[],
    prices?: WithDriverEnableValues,
  ): Promise<boolean> {
    try {
      await update.mutateAsync({
        serviceTypes: next,
        ...(prices
          ? {
              withDriverDailyPrice: String(prices.withDriverDailyPrice),
              withDriverInterCityPrice: String(prices.withDriverInterCityPrice),
              withDriverOneWayPrice: String(prices.withDriverOneWayPrice),
            }
          : {}),
      });
      message.success(
        t(enabled ? 'serviceToggle.enabled' : 'serviceToggle.disabled', {
          service: domainLabel('serviceType', service),
        }),
      );
    } catch (err) {
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
      else message.error(errorMessage(err));
      return false;
    } finally {
      setPendingChange(null);
    }
    return true;
  }

  const submitWithDriver = priceForm.handleSubmit(async (prices) => {
    if (!withDriverNext) return;
    const ok = await commit(SERVICE_TYPE.WITH_DRIVER, true, withDriverNext, prices);
    if (ok) closeWithDriver();
  });

  function closeWithDriver() {
    setWithDriverNext(null);
    priceForm.reset();
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
    if (enabled && service === SERVICE_TYPE.WITH_DRIVER && !withDriverPriced) {
      setWithDriverNext(next);
      return;
    }
    void commit(service, enabled, next);
  }

  const dialog = (
    <>
      <ResponsiveDialog
        open={withDriverNext !== null}
        title={t('serviceToggle.withDriverPricesTitle')}
        size="sm"
        confirmLoading={update.isPending}
        onClose={closeWithDriver}
        onOk={() => void submitWithDriver()}
        okText={t('serviceToggle.withDriverPricesOk')}
      >
        <p>{t('serviceToggle.withDriverPricesBody')}</p>
        <form onSubmit={(e) => void submitWithDriver(e)} noValidate>
          <NumberField
            control={priceForm.control}
            name="withDriverDailyPrice"
            label={tPricing('withDriver.daily')}
            money
            required
          />
          <NumberField
            control={priceForm.control}
            name="withDriverInterCityPrice"
            label={tPricing('withDriver.interCity')}
            money
            required
          />
          <NumberField
            control={priceForm.control}
            name="withDriverOneWayPrice"
            label={tPricing('withDriver.oneWay')}
            money
            required
          />
        </form>
      </ResponsiveDialog>
      <ResponsiveDialog
        open={pendingChange !== null}
        title={t('serviceToggle.priceLossTitle')}
        size="sm"
        confirmLoading={update.isPending}
        onClose={() => setPendingChange(null)}
        onOk={() =>
          pendingChange &&
          void commit(pendingChange.service, pendingChange.enabled, pendingChange.next)
        }
        okText={t('serviceToggle.confirmOk')}
        destructive={Boolean(pendingChange && !pendingChange.enabled)}
      >
        {pendingChange && !pendingChange.enabled && priceLoss(pendingChange.service) ? (
          <p>{t('serviceToggle.priceLossBody')}</p>
        ) : null}
      </ResponsiveDialog>
      <ResponsiveDialog
        open={inUse !== null}
        title={t('serviceToggle.inUse.title')}
        size="sm"
        onClose={() => setInUse(null)}
        footer={
          <Button type="primary" onClick={() => setInUse(null)}>
            {t('serviceToggle.inUse.close')}
          </Button>
        }
      >
        {inUse ? (
          <>
            <p>{inUse.message}</p>
            {inUse.details.bookings.length > 0 ? (
              <>
                <p>{t('serviceToggle.inUse.bookings')}</p>
                <ul>
                  {inUse.details.bookings.map((b) => (
                    <li key={b.id}>
                      <Link href={bookingPath.detail(b.id)}>{b.code}</Link>
                      {' · '}
                      {domainLabel('serviceType', b.serviceType)}
                      {' · '}
                      {fmt.rentalAt(b.pickupAt)}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {inUse.details.requestCount > 0 ? (
              <p>{t('serviceToggle.inUse.requests', { count: inUse.details.requestCount })}</p>
            ) : null}
          </>
        ) : null}
      </ResponsiveDialog>
    </>
  );

  const showsOn = (service: ServiceType) =>
    service === SERVICE_TYPE.WITH_DRIVER && withDriverNext !== null;

  return { blockedReason, toggle, showsOn, pending: update.isPending, dialog };
}
