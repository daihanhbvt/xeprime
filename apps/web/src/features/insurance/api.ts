import type { VehicleType } from '@xeprime/types';
import { apiGet } from '@/services/api-client';
import type { InsuranceCertificate, InsuranceCoverage, PublicInsuranceProduct } from './types';

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
