'use client';

import { useTranslations } from 'next-intl';
import { vehicleFieldPolicy, type VehicleFieldApplicability } from '@xeprime/types';

import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

import type { VehicleDetail } from '../types';

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
 * Thông số kỹ thuật của MỘT xe, theo đúng ma trận `vehicleFieldPolicy` (@xeprime/types) mà form
 * đăng xe dùng để hỏi và checklist lên chợ dùng để kiểm.
 *
 * Ô mà ma trận đánh `hidden` cho loại xe/nguồn năng lượng này thì KHÔNG có mặt — không phải "—":
 * xe máy không có "số chỗ", xe điện không có "dung tích động cơ". In "—" cho một ô như vậy là nói
 * với chủ xe rằng họ còn thiếu một thứ mà form không bao giờ hỏi họ. Ô áp dụng mà chưa điền thì
 * có mặt với `value: null`, để chủ xe thấy còn phải điền gì.
 *
 * Dùng chung cho tab "Thông số kỹ thuật" (đủ danh sách) và thẻ "Thông số chính" (một lát cắt), để
 * hai nơi không định dạng cùng một con số theo hai cách.
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

  /**
   * Số đo kèm đơn vị. Con số đi qua `fmt.measure` để dấu phân tách theo ngôn ngữ đang xem
   * (`4.630` · `6,8` vi — `4,630` · `6.8` en) mà KHÔNG làm tròn mất phần lẻ: trước 02/10/2026 bảng
   * này dùng `fmt.count`, và 6,8 L/100km hiện thành "7". Đơn vị (mm/kg/cc/HP/kWh) là KÝ HIỆU,
   * không dịch.
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
