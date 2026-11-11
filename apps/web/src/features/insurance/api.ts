import type { VehicleType } from '@xeprime/types';
import { apiGet } from '@/services/api-client';
import type { InsuranceCertificate, InsuranceCoverage, PublicInsuranceProduct } from './types';
import { browserApiHref } from '@/lib/api-href';

/** Danh mục sản phẩm bảo hiểm đang bật cho một loại xe — công khai, không cần đăng nhập. */
export const fetchPublicInsuranceProducts = (
  vehicleType: VehicleType,
): Promise<PublicInsuranceProduct[]> =>
  apiGet<PublicInsuranceProduct[]>('/public/insurance-products', { vehicleType });

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
