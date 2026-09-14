import { Injectable, Logger } from '@nestjs/common';
import { INSURANCE_ISSUE_ERROR } from '@xeprime/types';
import type {
  InsurancePartner,
  IssuePolicyRequest,
  IssuePolicyResult,
} from './insurance-partner.port';

/**
 * Adapter MẶC ĐỊNH — không có đối tác nào, và nói thẳng ra điều đó.
 *
 * ## Vì sao nó KHÔNG trả về thành công giả
 *
 * Một adapter trả `ok: true` với một số chứng nhận bịa sẽ tạo ra hàng loạt dòng `issued` trong
 * database. Mỗi dòng đó là một lời khẳng định rằng khách CÓ bảo hiểm. Ngày đầu tiên có tai nạn,
 * XePrime sẽ tra ra một số chứng nhận không tồn tại ở bất kỳ hãng nào — và đã thu tiền của khách
 * cho nó. Không có cách nào gỡ lại tình huống đó bằng code.
 *
 * Nên bản mặc định trả `partner_not_configured`, `retryable: false`. Hợp đồng dừng ở `failed`,
 * hiện trong hàng đợi admin, và phí vẫn nằm ở vế GIỮ HỘ của đối soát ba vế — nghĩa là tiền được
 * kế toán là "đang nợ một ai đó", đúng bản chất của nó.
 *
 * `CHECK booking_insurance_policies_issued_needs_certificate_check` là dây an toàn thứ hai: kể
 * cả khi ai đó viết một adapter trả OK rỗng, database vẫn từ chối đánh dấu `issued`.
 *
 * ## Hệ quả vận hành đang có
 *
 * Chính sách phí hiện hành BẬT `IV`/`IP` (quyết định của chủ sản phẩm, 14/09/2026), nên mỗi
 * chuyến bắt đầu sẽ sinh hợp đồng `failed` với mã này cho tới khi có adapter thật.
 * `insuranceErrorNeedsSupportCase` cố ý trả `false` cho mã này: đây là việc CẤU HÌNH của nền
 * tảng, không phải sự cố của từng chuyến, nên nó không mở support case cho khách.
 */
@Injectable()
export class NoopInsurancePartner implements InsurancePartner {
  private readonly logger = new Logger(NoopInsurancePartner.name);

  /**
   * Tên trung lập. **Không bao giờ** điền tên một hãng thật ở đây: snapshot này đi vào hợp đồng
   * và hiện cho khách, và gắn tên một hãng chưa ký hợp đồng là mạo danh họ (ADR 0028 điều 5).
   */
  readonly partnerName = 'Chưa có đối tác bảo hiểm';
  readonly configured = false;

  issue(request: IssuePolicyRequest): Promise<IssuePolicyResult> {
    this.logger.warn({
      msg: 'insurance: chưa cắm đối tác — không phát hành, KHÔNG đánh dấu issued',
      idempotencyKey: request.idempotencyKey,
      productKind: request.productKind,
      premiumAmount: request.premiumAmount,
    });
    return Promise.resolve({
      ok: false,
      code: INSURANCE_ISSUE_ERROR.PARTNER_NOT_CONFIGURED,
      message:
        'Chưa cấu hình đối tác bảo hiểm — phí đã thu đang được giữ hộ, chưa có chứng nhận nào được cấp',
      // Thử lại vô ích: không có gì để gọi. Admin phải cắm đối tác rồi bấm thử lại từ hàng đợi.
      retryable: false,
    });
  }
}
