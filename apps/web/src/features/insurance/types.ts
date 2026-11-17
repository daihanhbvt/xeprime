import type { components, InsuranceProductKind } from '@xeprime/types';

type Schemas = components['schemas'];

/** Mô tả một sản phẩm bảo hiểm cho ĐÚNG loại xe đang xem (ADR 0064). */
export type PublicInsuranceProduct = Schemas['PublicInsuranceProductDto'];

/** Một giấy chứng nhận đã cấp — chỉ đọc, cho khách và gian hàng. */
export type InsuranceCertificate = Schemas['InsuranceCertificateDto'];

/** Tình trạng bảo hiểm của MỘT sản phẩm khách đã trả — kể cả khi GCN chưa có (ADR 0064). */
export type InsuranceCoverage = Schemas['InsuranceCoverageDto'];

/** Một lựa chọn bảo hiểm ĐANG được chào cho chuyến này. */
export interface InsuranceOfferItem {
  kind: InsuranceProductKind;
  /** Phí MỖI NGÀY theo chính sách phí của báo giá (chuỗi VND — ADR 0007). `null` khi phí theo bậc. */
  dailyAmount: string | null;
  /**
   * BẮT BUỘC — chủ xe đặt Bắt buộc (ADR 0091), server đã cộng vào báo giá, khách không bỏ chọn được.
   * `tripAmount` là phí cả chuyến của bảo hiểm theo bậc giá trị xe (Bắt buộc lẫn Tuỳ chọn).
   */
  mandatory: boolean;
  tripAmount: string | null;
  /**
   * Phí thu hộ bảo hiểm đi kèm `tripAmount` nếu mua (ADR 0091 điều 3). Khách thấy GỘP
   * `tripAmount + serviceFeeAmount`, ⓘ tách hai số. `null` khi không có (công tắc tắt, phí theo ngày).
   */
  serviceFeeAmount: string | null;
  /** Mô tả sản phẩm từ danh mục; `null` khi danh mục chưa tải được (vẫn chọn được, thiếu quyền lợi). */
  product: PublicInsuranceProduct | null;
}
