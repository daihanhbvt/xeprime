import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import {
  VEHICLE_IMAGE_TYPE_VALUES,
  vehicleFieldPolicy,
  type VehicleFieldApplicability,
  type VehicleImageType,
} from '@xeprime/types';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import type { VehicleDetail } from '../api';

export type VehicleSpecKey =
  | 'brand'
  | 'model'
  | 'bodyType'
  | 'motorbikeCategory'
  | 'year'
  | 'seats'
  | 'fuel'
  | 'color'
  | 'length'
  | 'width'
  | 'height'
  | 'weight'
  | 'engine'
  | 'power'
  | 'transmission'
  | 'fuelCombined'
  | 'electricRange'
  | 'battery'
  | 'electricConsumption';

export interface VehicleSpecItem {
  key: VehicleSpecKey;
  label: string;
  /** Đã định dạng; `null` = ô ÁP DỤNG cho xe này nhưng chủ xe chưa điền (nơi hiển thị in "—"). */
  value: string | null;
}

function applies(applicability: VehicleFieldApplicability): boolean {
  return applicability !== 'hidden';
}

/**
 * Thông số kỹ thuật của MỘT xe theo ma trận `vehicleFieldPolicy` — bản native của
 * `apps/web/src/features/vehicles/hooks/use-vehicle-spec-items.ts` (cùng khoá, cùng nhãn).
 *
 * Ô mà ma trận đánh `hidden` cho loại xe/nguồn năng lượng này thì KHÔNG có mặt — không phải "—":
 * xe máy không có "số chỗ", xe điện không có "dung tích động cơ". Ô áp dụng mà chưa điền thì có
 * mặt với `value: null`, để chủ xe thấy còn phải điền gì.
 *
 * Dùng chung cho mục "Thông số kỹ thuật" (đủ danh sách) và thẻ "Thông số chính" (một lát cắt).
 */
export function useVehicleSpecItems(vehicle: VehicleDetail): VehicleSpecItem[] {
  const t = useTranslations('Vehicles.overview.specs');
  const tForm = useTranslations('Vehicles.form');
  const tOverview = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  // Xe lưu KEY của danh mục, không lưu nhãn — nhãn tra từ `catalog_items` do admin cấu hình.
  const { brandLabel, bodyTypeLabel, fuelTypeLabel } = useCatalogLabels();
  const policy = vehicleFieldPolicy(vehicle.vehicleType, vehicle.fuelType);

  /*
   * Số đo kèm đơn vị qua `fmt.measure` — giữ phần lẻ (6,8 L/100km không thành "7") và dấu phân
   * tách theo ngôn ngữ. Đơn vị là KÝ HIỆU, không dịch.
   */
  const metric = (value: number | string | null | undefined, unit: string): string | null =>
    value == null || value === ''
      ? null
      : tOverview('metric', { value: fmt.measure(Number(value)), unit });
  const text = (value: string | null | undefined): string | null => value || null;

  const items: (VehicleSpecItem | false)[] = [
    { key: 'brand', label: t('brand'), value: text(brandLabel(vehicle.brand)) },
    { key: 'model', label: t('model'), value: text(vehicle.model) },
    applies(policy.bodyType) && {
      key: 'bodyType',
      label: t('bodyType'),
      value: text(bodyTypeLabel(vehicle.bodyType)),
    },
    applies(policy.motorbikeCategory) && {
      key: 'motorbikeCategory',
      label: tForm('specs.motorbikeCategory'),
      value: vehicle.motorbikeCategory
        ? domainLabel('motorbikeCategory', vehicle.motorbikeCategory)
        : null,
    },
    // Năm là một nhãn, không phải số lượng — KHÔNG đi qua `fmt.count` ("2.021" là sai).
    {
      key: 'year',
      label: t('manufactureYear'),
      value: vehicle.manufactureYear ? String(vehicle.manufactureYear) : null,
    },
    applies(policy.seatCount) && {
      key: 'seats',
      label: t('seatCount'),
      value: vehicle.seatCount ? fmt.count(vehicle.seatCount) : null,
    },
    { key: 'fuel', label: t('fuelType'), value: text(fuelTypeLabel(vehicle.fuelType)) },
    { key: 'color', label: t('color'), value: text(vehicle.color) },
    { key: 'length', label: t('length'), value: metric(vehicle.lengthMm, 'mm') },
    { key: 'width', label: t('width'), value: metric(vehicle.widthMm, 'mm') },
    { key: 'height', label: t('height'), value: metric(vehicle.heightMm, 'mm') },
    { key: 'weight', label: t('curbWeight'), value: metric(vehicle.curbWeightKg, 'kg') },
    applies(policy.engineDisplacementCc) && {
      key: 'engine',
      label: t('engineDisplacement'),
      value: metric(vehicle.engineDisplacementCc, 'cc'),
    },
    { key: 'power', label: t('horsepower'), value: metric(vehicle.horsepowerHp, 'HP') },
    applies(policy.transmission) && {
      key: 'transmission',
      label: t('transmission'),
      value: vehicle.transmission ? domainLabel('transmissionType', vehicle.transmission) : null,
    },
    applies(policy.fuelConsumption) && {
      key: 'fuelCombined',
      label: t('fuelCombined'),
      value: metric(vehicle.fuelConsumptionCombined, 'L/100km'),
    },
    applies(policy.electricRangeKm) && {
      key: 'electricRange',
      label: tForm('advanced.electricRange'),
      value: metric(vehicle.electricRangeKm, 'km'),
    },
    applies(policy.batteryCapacityKwh) && {
      key: 'battery',
      label: tForm('advanced.batteryCapacity'),
      value: metric(vehicle.batteryCapacityKwh, 'kWh'),
    },
    applies(policy.electricConsumption) && {
      key: 'electricConsumption',
      label: tForm('advanced.electricConsumption'),
      value: metric(vehicle.electricConsumptionKwhPer100Km, 'kWh/100km'),
    },
  ];

  return items.filter((item): item is VehicleSpecItem => item !== false);
}

/**
 * Nhãn NGẮN của vị trí ảnh ("Mặt trước", "Nội thất"…) — bản native của `useImageSlotLabel` web.
 * Mã lạ (dữ liệu cũ) rơi về nhãn "Ảnh khác" thay vì in mã thô.
 */
export function useImageSlotLabel(): (type: string | null | undefined) => string {
  const t = useTranslations('Vehicles.imageSlot');
  return useCallback(
    (type) =>
      (VEHICLE_IMAGE_TYPE_VALUES as readonly string[]).includes(type ?? '')
        ? t(type as VehicleImageType)
        : t('other'),
    [t],
  );
}
