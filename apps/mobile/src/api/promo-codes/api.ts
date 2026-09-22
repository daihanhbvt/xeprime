import { getApiClient, type QueryParams } from '@xeprime/api-client';
import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/**
 * MÃ KHUYẾN MÃI NỀN TẢNG — bản NATIVE của tầng gọi API (ADR 0031: mỗi app một bản).
 *
 * ⚠️ Web có bản của riêng nó ở `apps/web/src/features/promo-codes/api.ts`. Hai bản KHÔNG tự đồng
 * bộ: sửa một contract dùng chung ⇒ sửa CẢ HAI. Phần KHÔNG được phép lệch — công thức số giảm,
 * lý do không áp được, khoá nhận diện chuyến — đã nằm ở `@xeprime/types` (`computePromoDiscount`,
 * `PROMO_INELIGIBLE_REASON`, `promoTripKey`), nên chỗ này chỉ còn là đường dây.
 */
export type PromoPreview = Schemas['PromoPreviewDto'];

/**
 * Tham số một chuyến để hỏi mã.
 *
 * KHÔNG có SĐT hay tên khách: danh tính đến từ phiên (Bearer token), không từ payload
 * (ADR 0046 điều 5) — một endpoint công khai nhận SĐT là một cách tra "số nào đã từng thuê xe".
 */
export interface PromoTripParams {
  vehicleId: string;
  serviceType?: string | undefined;
  pickupAt?: string | undefined;
  returnAt?: string | undefined;
  packageMonths?: number | undefined;
  routeType?: string | undefined;
  personalAccidentSelected?: boolean | undefined;
}

/**
 * Bỏ mọi giá trị trống thay vì gửi chuỗi rỗng: DTO bên API khai `@IsOptional()` kèm
 * `@IsISO8601()`, và `@IsOptional` chỉ bỏ qua `null`/`undefined` — một chuỗi rỗng vẫn đi vào
 * validator và bật 400.
 */
function tripBody(trip: PromoTripParams): QueryParams {
  return {
    vehicleId: trip.vehicleId,
    ...(trip.serviceType ? { serviceType: trip.serviceType } : {}),
    ...(trip.pickupAt ? { pickupAt: trip.pickupAt } : {}),
    ...(trip.returnAt ? { returnAt: trip.returnAt } : {}),
    ...(trip.packageMonths != null ? { packageMonths: trip.packageMonths } : {}),
    ...(trip.routeType ? { routeType: trip.routeType } : {}),
    ...(trip.personalAccidentSelected
      ? { personalAccidentSelected: trip.personalAccidentSelected }
      : {}),
  };
}

/**
 * XEM TRƯỚC một mã — server tính số giảm và tổng khách trả.
 *
 * KHÔNG ném khi mã không hợp lệ: `applicable = false` kèm `reason` là một câu TRẢ LỜI, không phải
 * lỗi — màn hình vẽ nhánh lý do chứ không hiện một toast đỏ.
 */
export function previewPromoCode(code: string, trip: PromoTripParams): Promise<PromoPreview> {
  return getApiClient().post<PromoPreview>('/public/promo-codes/preview', {
    ...tripBody(trip),
    code,
  });
}

/**
 * Mã ĐÃ CÔNG BỐ cho chuyến này, kèm lý do với từng mã không áp được.
 *
 * Handler trả `{ data: [...] }` nên `ResponseInterceptor` giữ nguyên envelope và client bóc đúng
 * một lớp — kết quả là chính mảng.
 */
export function availablePromoCodes(trip: PromoTripParams): Promise<PromoPreview[]> {
  return getApiClient().get<PromoPreview[]>('/public/promo-codes/available', tripBody(trip));
}
