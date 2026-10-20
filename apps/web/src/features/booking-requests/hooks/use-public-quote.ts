'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { SERVICE_TYPE } from '@xeprime/types';
import { fetchPublicQuote, type PublicQuoteParams } from '@/features/rental-policies/api';
import type { PublicQuote } from '@/features/rental-policies/types';
import { appWallClockToIso, type Dayjs } from '@/lib/datetime';
import { queryKeys } from '@/services/query-keys';

/**
 * Tham số báo giá công khai của MỘT chuyến — một chỗ dựng cho thẻ đặt xe ở trang chi tiết và cho
 * luồng gửi yêu cầu: hai nơi hỏi giá cùng một chuyến phải gửi cùng một câu hỏi, nếu không con số ở
 * trang chi tiết và ở hộp đặt xe sẽ khác nhau (và cache TanStack không dùng chung được).
 *
 * Dài hạn báo giá theo GÓI: không gửi ngày nào (giá gói không phụ thuộc ngày nhận — ADR 0011).
 * Dịch vụ theo ngày gửi khoảng nhận–trả; lộ trình chỉ có nghĩa với xe có tài xế. Thiếu dữ kiện ⇒
 * `null` (chưa hỏi).
 */
export function publicQuoteParams(trip: {
  serviceType: string;
  pickupAt?: Dayjs | null;
  returnAt?: Dayjs | null;
  routeType?: string | null;
  packageMonths?: number | null;
  vehicleProtectionSelected?: boolean;
  personalAccidentSelected?: boolean;
}): PublicQuoteParams | null {
  if (trip.serviceType === SERVICE_TYPE.LONG_TERM) {
    return trip.packageMonths != null
      ? { serviceType: SERVICE_TYPE.LONG_TERM, packageMonths: trip.packageMonths }
      : null;
  }
  if (!trip.pickupAt || !trip.returnAt) return null;
  return {
    pickupAt: appWallClockToIso(trip.pickupAt),
    returnAt: appWallClockToIso(trip.returnAt),
    serviceType: trip.serviceType,
    ...(trip.serviceType === SERVICE_TYPE.WITH_DRIVER && trip.routeType
      ? { routeType: trip.routeType }
      : {}),
    ...(trip.vehicleProtectionSelected !== undefined
      ? { vehicleProtectionSelected: trip.vehicleProtectionSelected }
      : {}),
    ...(trip.personalAccidentSelected !== undefined
      ? { personalAccidentSelected: trip.personalAccidentSelected }
      : {}),
  };
}

/**
 * Báo giá công khai — CÙNG PricingService với luồng duyệt của shop, FE không tự cộng trừ. Hỏng
 * cũng không chặn ai đặt xe: khối giá là thông tin tham khảo, giá chốt do chủ xe duyệt.
 */
export function usePublicQuote(vehicleId: string, params: PublicQuoteParams | null) {
  return useQuery({
    queryKey: queryKeys.marketplace.quote(vehicleId, params ?? {}),
    queryFn: () => fetchPublicQuote(vehicleId, params!),
    enabled: params != null,
    staleTime: 60_000,
  });
}

/**
 * Báo giá đã ÁP MÃ khuyến mãi — nguồn duy nhất cho mọi con số trong bảng giá (ADR 0046).
 *
 * Báo giá công khai không nhận mã (\`PricingModule\` cố tình không biết gì về chúng), nên bảng phí có
 * mã do endpoint xem trước mã trả về. Thay CẢ \`fees\` chứ không ghép từng số: ghép tay chính là lỗi
 * đã thấy ngày 24/09/2026 — dòng "−100.000đ" hiện ra trong khi "Tổng bạn trả" và "Tiền giữ chỗ" vẫn
 * là con số chưa trừ, vì chúng đến từ một bảng phí khác. Không có mã ⇒ báo giá gốc.
 */
export function useQuoteWithPromo(
  quote: PublicQuote | null | undefined,
  promoFees: PublicQuote['breakdown']['fees'] | null | undefined,
): PublicQuote | null {
  return useMemo(() => {
    const q = quote ?? null;
    if (!q || !promoFees) return q;
    return { ...q, breakdown: { ...q.breakdown, fees: promoFees } };
  }, [quote, promoFees]);
}
