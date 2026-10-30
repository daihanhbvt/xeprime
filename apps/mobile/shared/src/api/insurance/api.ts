import type { components, InsuranceProductKind, VehicleType } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

/**
 * Bảo hiểm chuyến phía khách/gian hàng (ADR 0064) — bản native của `apps/web/src/features/insurance/api.ts`
 * + `types.ts`. Hai bản KHÔNG tự đồng bộ (ADR 0031): đổi hợp đồng thì sửa cả hai.
 */

/** Mô tả một sản phẩm bảo hiểm cho ĐÚNG loại xe đang xem. */
export type PublicInsuranceProduct = Schemas['PublicInsuranceProductDto'];

/** Một giấy chứng nhận đã cấp — chỉ đọc, cho khách và gian hàng. */
export type InsuranceCertificate = Schemas['InsuranceCertificateDto'];

/** Tình trạng bảo hiểm của MỘT sản phẩm khách đã trả — kể cả khi GCN chưa có. */
export type InsuranceCoverage = Schemas['InsuranceCoverageDto'];

/** Một lựa chọn bảo hiểm ĐANG được chào cho chuyến này. */
export interface InsuranceOfferItem {
  kind: InsuranceProductKind;
  /** Phí MỖI NGÀY theo chính sách phí của báo giá (chuỗi VND — ADR 0007). */
  dailyAmount: string;
  /** Mô tả sản phẩm từ danh mục; `null` khi danh mục chưa tải được (vẫn chọn được, thiếu quyền lợi). */
  product: PublicInsuranceProduct | null;
}

export const insuranceApi = {
  /** Danh mục sản phẩm bảo hiểm đang bật cho một loại xe — công khai, không cần đăng nhập. */
  publicProducts(vehicleType: VehicleType): Promise<PublicInsuranceProduct[]> {
    return getApiClient().get<PublicInsuranceProduct[]>('/public/insurance-products', {
      vehicleType,
    });
  },

  /** GCN đã cấp của một đơn — phía gian hàng/chủ xe (tenant lấy từ phiên, không từ client). */
  bookingCertificates(bookingId: string): Promise<InsuranceCertificate[]> {
    return getApiClient().get<InsuranceCertificate[]>(
      `/bookings/${encodeURIComponent(bookingId)}/insurance-certificates`,
    );
  },

  /** Tình trạng bảo hiểm theo từng sản phẩm của một đơn — phía gian hàng/chủ xe. */
  bookingCoverage(bookingId: string): Promise<InsuranceCoverage[]> {
    return getApiClient().get<InsuranceCoverage[]>(
      `/bookings/${encodeURIComponent(bookingId)}/insurance-coverage`,
    );
  },
};
