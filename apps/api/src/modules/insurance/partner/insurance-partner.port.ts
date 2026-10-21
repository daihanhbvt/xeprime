/**
 * Cổng ra đối tác bảo hiểm — ADR 0032 điều 4 · ADR 0064.
 *
 * Interface, hai adapter (`NoopInsurancePartner` mặc định, `MicMockInsurancePartner` cho
 * dev/staging) và toàn bộ vòng phát hành sống ở `@xeprime/prisma` (`insurance-issue.ts`): worker
 * và API phải chạy ĐÚNG MỘT bản, và worker không kéo runtime Nest vào. File này chỉ giữ token DI
 * của phía API và re-export kiểu để code trong module không phải biết package nào chứa chúng.
 *
 * Cắm đối tác thật = thêm một adapter cạnh hai adapter kia + một nhánh ở `createInsurancePartner`.
 * `InsuranceService` và luồng kế toán không đổi dòng nào.
 */
export type {
  InsurancePartner,
  IssuePolicyRequest,
  IssuePolicyResult,
} from '@xeprime/prisma';

/** Token DI — interface không tồn tại lúc chạy nên Nest cần một chuỗi để tra provider. */
export const INSURANCE_PARTNER = 'INSURANCE_PARTNER';
