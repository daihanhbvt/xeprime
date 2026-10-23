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
  /** Phí MỖI NGÀY theo chính sách phí của báo giá (chuỗi VND — ADR 0007). */
  dailyAmount: string;
  /** Mô tả sản phẩm từ danh mục; `null` khi danh mục chưa tải được (vẫn chọn được, thiếu quyền lợi). */
  product: PublicInsuranceProduct | null;
}
