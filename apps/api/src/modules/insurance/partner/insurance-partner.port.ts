import {
  type InsuranceConsentSource,
  type InsuranceIssueError,
  type InsuranceProductKind,
} from '@xeprime/types';

/**
 * Cổng ra đối tác bảo hiểm — ADR 0032 điều 4.
 *
 * Là một PORT chứ không phải một service gọi thẳng HTTP vì ba lý do, theo thứ tự quan trọng:
 *
 *  1. **Không có đối tác nào lúc này.** Bản mặc định (`NoopInsurancePartner`) phải từ chối một
 *     cách trung thực, không giả vờ thành công. Một interface làm chỗ đó tường minh.
 *  2. **Đối tác thật sẽ có hình dạng riêng** (SOAP, form-encoded, ký số…). Giữ nó sau một cổng
 *     nghĩa là khi cắm vào, không dòng nào của `InsuranceService` phải đổi.
 *  3. **Test không được gọi ra Internet.** Fake adapter chỉ sống trong test, và đó là ranh giới
 *     duy nhất fake được phép tồn tại.
 */
export interface IssuePolicyRequest {
  /** Khoá chống mua đôi ở phía đối tác — KHÔNG đổi qua các lần thử lại. */
  idempotencyKey: string;
  productKind: InsuranceProductKind;
  premiumAmount: string;
  coverageFrom: Date;
  coverageTo: Date;
  vehicle: { plateNumber: string | null; name: string };
  customer: { name: string; phone: string | null };
  /** Bằng chứng khách chọn `IP` — đối tác có thể đòi khi đối chiếu. */
  consent: { at: Date; source: InsuranceConsentSource } | null;
}

export type IssuePolicyResult =
  | {
      ok: true;
      certificateNumber: string;
      certificateUrl?: string;
      partnerProductCode?: string;
      /** Nguyên trạng phản hồi của đối tác — bằng chứng, ghi thẳng vào DB. */
      raw: unknown;
    }
  | {
      ok: false;
      code: InsuranceIssueError;
      message: string;
      /** `false` = lỗi vĩnh viễn, thử lại vô ích (đối tác từ chối, dữ liệu sai). */
      retryable: boolean;
      raw?: unknown;
    };

/**
 * Token DI — interface không tồn tại lúc chạy nên Nest cần một chuỗi để tra provider.
 */
export const INSURANCE_PARTNER = 'INSURANCE_PARTNER';

export interface InsurancePartner {
  /** Tên hiện cho khách và ghi vào snapshot hợp đồng. */
  readonly partnerName: string;
  /** Có cắm đối tác thật chưa — `false` thì cổng phát hành báo `partner_not_configured`. */
  readonly configured: boolean;
  issue(request: IssuePolicyRequest): Promise<IssuePolicyResult>;
}
