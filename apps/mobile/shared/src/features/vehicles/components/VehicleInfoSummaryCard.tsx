import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  SERVICE_TYPE,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  type VehicleOperationStatus,
} from '@xeprime/types';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { space } from '@/theme/tokens';
import { useVehicleSummary } from '../hooks/use-vehicle';
import type { VehicleDetail } from '../api';
import { Notice } from './VehicleFormSteps';

/**
 * Khối "Thông tin tóm tắt" CHỈ ĐỌC của màn sửa thông tin — bản native của nửa dưới
 * `VehicleInfoAside` bên web (loại xe · số chỗ · trạng thái · giá thuê · số KM + lời báo khoá
 * trường khi xe đã duyệt). Không có lối ghi thứ hai.
 *
 * Nửa trên của aside web (thẻ "Hình ảnh xe") KHÔNG lặp lại ở đây: trên màn hẹp nó nằm ngay dưới
 * thẻ đầu xe vốn đã có ảnh chính + dải ảnh, nên hai khối ảnh liền nhau chỉ là lặp.
 */
export function VehicleInfoSummaryCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.edit.aside');
  const tEdit = useTranslations('Vehicles.edit');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const summary = useVehicleSummary(vehicle.id).data;

  // Giá "đại diện": dịch vụ đầu tiên đang bật có giá — cùng thứ tự ưu tiên với web.
  const services = vehicle.serviceTypes ?? [];
  const price =
    services.includes(SERVICE_TYPE.SELF_DRIVE) && vehicle.weekdayPrice
      ? t('perDay', { price: fmt.money(vehicle.weekdayPrice) })
      : services.includes(SERVICE_TYPE.WITH_DRIVER) && vehicle.withDriverDailyPrice
        ? t('perDay', { price: fmt.money(vehicle.withDriverDailyPrice) })
        : services.includes(SERVICE_TYPE.LONG_TERM) && vehicle.monthlyPrice
          ? t('perMonth', { price: fmt.money(vehicle.monthlyPrice) })
          : tLabels('notAvailable');
  const status = vehicle.operationStatus as VehicleOperationStatus;

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{t('summaryTitle')}</BlockTitle>
        <DataRow label={t('vehicleType')} value={domainLabel('vehicleType', vehicle.vehicleType)} />
        {vehicle.vehicleType === VEHICLE_TYPE.CAR ? (
          <DataRow
            label={t('seats')}
            value={
              vehicle.seatCount
                ? t('seatsValue', { count: vehicle.seatCount })
                : tLabels('notAvailable')
            }
          />
        ) : null}
        <DataRow
          label={t('status')}
          value={domainLabel(
            'vehicleOperationStatus',
            status,
            VEHICLE_OPERATION_STATUS_META[status]?.label ?? status,
          )}
        />
        <DataRow label={t('price')} value={price} />
        <DataRow label={t('odometer')} value={fmt.km(summary?.currentOdometerKm ?? null)} />
        {vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC ? (
          <Notice tone="info" title={tEdit('lockedNotice')} />
        ) : null}
      </YStack>
    </Card>
  );
}
