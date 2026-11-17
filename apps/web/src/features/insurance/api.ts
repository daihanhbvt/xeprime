import type { VehicleType } from '@xeprime/types';
import { REVALIDATE_CATALOG_SECONDS } from '@/constants/cache';
import { apiGet, getApiBaseUrl } from '@/services/api-client';
import type { InsuranceCertificate, InsuranceCoverage, PublicInsuranceProduct } from './types';
import { browserApiHref } from '@/lib/api-href';

/** Danh mục sản phẩm bảo hiểm đang bật cho một loại xe — công khai, không cần đăng nhập. */
export const fetchPublicInsuranceProducts = (
  vehicleType: VehicleType,
): Promise<PublicInsuranceProduct[]> =>
  apiGet<PublicInsuranceProduct[]>('/public/insurance-products', { vehicleType });

/**
 * Server component (trang "Quyền lợi bảo hiểm", ADR 0091 điều 8): fetch thẳng, cache như danh mục —
 * mô tả sản phẩm đổi vài lần một năm. Lỗi thì trả mảng rỗng: trang vẫn nói được ai chịu khấu trừ.
 */
export async function fetchPublicInsuranceProductsServer(
  vehicleType: VehicleType,
): Promise<PublicInsuranceProduct[]> {
  try {
    const res = await fetch(
      `${getApiBaseUrl()}/public/insurance-products?vehicleType=${encodeURIComponent(vehicleType)}`,
      { cache: 'force-cache', next: { revalidate: REVALIDATE_CATALOG_SECONDS } },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { data: PublicInsuranceProduct[] };
    return body.data;
  } catch {
    return [];
  }
}

/** GCN đã cấp của một đơn — phía gian hàng/chủ xe (tenant lấy từ phiên, không từ client). */
export const fetchBookingInsuranceCertificates = (
  bookingId: string,
): Promise<InsuranceCertificate[]> =>
  apiGet<InsuranceCertificate[]>(
    `/bookings/${encodeURIComponent(bookingId)}/insurance-certificates`,
  );

/** Tình trạng bảo hiểm theo từng sản phẩm của một đơn — phía gian hàng/chủ xe. */
export const fetchBookingInsuranceCoverage = (bookingId: string): Promise<InsuranceCoverage[]> =>
  apiGet<InsuranceCoverage[]>(`/bookings/${encodeURIComponent(bookingId)}/insurance-coverage`);

/** Đường tải GCN PDF phía KHÁCH — chuyến của tôi (ADR 0088). Cùng origin, cookie phiên tự đi kèm. */
export function tripCertificatePdfHref(tripId: string, certificateId: string): string {
  return browserApiHref(
    `/trips/${encodeURIComponent(tripId)}/insurance-certificates/${encodeURIComponent(certificateId)}/pdf`,
  );
}

/** Đường tải GCN PDF phía GIAN HÀNG — đơn thuê (ADR 0088). */
export function bookingCertificatePdfHref(bookingId: string, certificateId: string): string {
  return browserApiHref(
    `/bookings/${encodeURIComponent(bookingId)}/insurance-certificates/${encodeURIComponent(certificateId)}/pdf`,
  );
}
