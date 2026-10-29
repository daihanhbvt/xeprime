import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  INSURANCE_PRODUCT_KIND,
  type InsuranceProductKind,
  type VehicleType,
} from '@xeprime/types';
import { insuranceApi, type InsuranceOfferItem } from '@/api/insurance/api';
import type { PublicQuote } from '@/api/marketplace/api';
import { queryKeys } from '@/queries/query-keys';
import { insuranceOfferItems, sameOfferItems } from './offer';

/** Mô tả sản phẩm đổi vài lần một năm — giữ lâu, khớp cache công khai ở server (như web). */
const PRODUCTS_STALE_MS = 5 * 60_000;

export function usePublicInsuranceProducts(vehicleType: VehicleType | null | undefined) {
  return useQuery({
    queryKey: queryKeys.insurance.publicProducts(vehicleType ?? ''),
    queryFn: () => insuranceApi.publicProducts(vehicleType as VehicleType),
    enabled: Boolean(vehicleType),
    staleTime: PRODUCTS_STALE_MS,
  });
}

/** GCN đã cấp của một đơn (phía gian hàng). `enabled` = đơn đã bàn giao — trước đó chắc chắn rỗng. */
export function useBookingInsuranceCertificates(bookingId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.insurance.bookingCertificates(bookingId ?? ''),
    queryFn: () => insuranceApi.bookingCertificates(bookingId as string),
    enabled: Boolean(bookingId) && enabled,
  });
}

/**
 * Tình trạng bảo hiểm theo từng sản phẩm của một đơn (phía gian hàng) — có cả khi GCN chưa có, nên
 * gọi ngay khi đơn tồn tại, không chờ bàn giao.
 */
export function useBookingInsuranceCoverage(bookingId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.insurance.bookingCoverage(bookingId ?? ''),
    queryFn: () => insuranceApi.bookingCoverage(bookingId as string),
    enabled: Boolean(bookingId) && enabled,
  });
}

export interface InsuranceSelection {
  vehicleProtectionSelected: boolean;
  personalAccidentSelected: boolean;
}

/**
 * Lựa chọn bảo hiểm đang được chào cho báo giá hiện tại (ADR 0064) — và GỠ lựa chọn của khách khi
 * sản phẩm không còn được chào. Bản native của `useInsuranceOffer` web.
 *
 * Kết quả giữ nguyên qua các lượt báo giá đang tải: tích một ô làm đổi tham số báo giá, và nếu mỗi
 * lần tải lại đều coi là "không bán" thì chính cú tích đó sẽ bị gỡ ngay lập tức. Server vẫn là cổng
 * thật — nó không thu `IV`/`IP` khi `insuranceOffered = false`.
 */
export function useInsuranceOffer(
  quote: PublicQuote | null | undefined,
  vehicleType: VehicleType | null | undefined,
  selection: InsuranceSelection,
  onDeselect: (kind: InsuranceProductKind) => void,
): { items: InsuranceOfferItem[]; known: boolean } {
  const products = usePublicInsuranceProducts(vehicleType);
  const current =
    vehicleType != null
      ? insuranceOfferItems(quote, vehicleType, products.isSuccess ? products.data : undefined)
      : null;

  // Mẫu "chỉnh state theo props" của React — không cần effect để nhớ kết quả gần nhất.
  const [last, setLast] = useState<InsuranceOfferItem[] | null>(null);
  if (current !== null && !sameOfferItems(last, current)) setLast(current);
  const items = current ?? last;

  const offered = (kind: InsuranceProductKind) => items?.some((i) => i.kind === kind) ?? true;
  const dropVehicle =
    items !== null &&
    selection.vehicleProtectionSelected &&
    !offered(INSURANCE_PRODUCT_KIND.VEHICLE_TRIP);
  const dropPersonal =
    items !== null &&
    selection.personalAccidentSelected &&
    !offered(INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT);

  useEffect(() => {
    if (dropVehicle) onDeselect(INSURANCE_PRODUCT_KIND.VEHICLE_TRIP);
    if (dropPersonal) onDeselect(INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT);
  }, [dropVehicle, dropPersonal, onDeselect]);

  return { items: items ?? [], known: items !== null };
}
