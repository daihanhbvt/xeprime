import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  INSURANCE_ISSUE_ERROR,
  INSURANCE_PRODUCT_KIND,
  type InsuranceProductKind,
} from '@xeprime/types';
import type {
  InsurancePartner,
  IssuePolicyRequest,
  IssuePolicyResult,
} from './insurance-partner.port';

/**
 * Tiền tố số Giấy chứng nhận điện tử theo sản phẩm MIC (Tổng Công ty CP Bảo hiểm Quân đội):
 * `VCX` — vật chất xe (`IV`), `NNTX` — người ngồi trên xe (`IP`).
 */
export const MIC_CERTIFICATE_PREFIX = {
  [INSURANCE_PRODUCT_KIND.VEHICLE_TRIP]: 'MIC-VCX',
  [INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT]: 'MIC-NNTX',
} as const satisfies Record<InsuranceProductKind, string>;

/** Trang tra cứu GCN của môi trường thử nghiệm. Adapter thật đọc URL từ cấu hình hợp đồng. */
export const MIC_MOCK_CERTIFICATE_LOOKUP_URL = 'https://staging-cert.mic.vn/view';

/**
 * Adapter GIẢ LẬP đối tác MIC — chỉ cho dev/staging, để luồng bàn giao → phát hành → hiện GCN
 * chạy trọn vẹn trước khi có hợp đồng thật. Bật bằng `INSURANCE_PARTNER=mic_mock`.
 *
 * ## ⚠️ KHÔNG BAO GIỜ chạy ở production — và cấu hình chặn điều đó lúc boot
 *
 * Mỗi lượt `ok: true` ở đây ghi một hợp đồng `issued` kèm số GCN — một lời khẳng định với khách
 * rằng họ CÓ bảo hiểm MIC. Số đó không tồn tại ở MIC; ngày có tai nạn, khách đã trả phí mà không
 * ai bồi thường, và XePrime đã dùng tên một hãng chưa ký hợp đồng (ADR 0028 điều 5). Vì thế
 * `env.schema.ts` từ chối boot khi `APP_ENV=production` mà `INSURANCE_PARTNER=mic_mock` — cùng khuôn
 * release gate của cổng thanh toán (ADR 0058). Mặc định vẫn là `NoopInsurancePartner`, từ chối
 * trung thực.
 *
 * ## Idempotent theo thiết kế
 *
 * Số GCN suy TẤT ĐỊNH từ `idempotencyKey` (băm SHA-256), không ngẫu nhiên: worker thử lại một
 * hợp đồng phải nhận đúng số cũ — đúng hành vi mà đối tác thật phải có với khoá chống mua đôi.
 *
 * Khi có hợp đồng MIC chính thức: viết adapter thật cạnh file này (URL + khoá API từ cấu hình),
 * đổi nhánh trong `InsuranceModule` — `InsuranceService` và luồng kế toán không đổi dòng nào.
 */
@Injectable()
export class MicMockInsurancePartner implements InsurancePartner {
  private readonly logger = new Logger(MicMockInsurancePartner.name);

  /** Nói rõ là giả lập — tên này đi vào hợp đồng khi chính sách phí không khai tên đối tác. */
  readonly partnerName = 'MIC (giả lập — môi trường thử nghiệm)';
  readonly configured = true;

  issue(request: IssuePolicyRequest): Promise<IssuePolicyResult> {
    const invalid = invalidReason(request);
    if (invalid) {
      return Promise.resolve({
        ok: false,
        code: INSURANCE_ISSUE_ERROR.INVALID_REQUEST,
        message: invalid,
        // Dữ liệu sai thì thử lại vẫn sai — cần người sửa chuyến rồi bấm thử lại.
        retryable: false,
      });
    }

    const prefix = MIC_CERTIFICATE_PREFIX[request.productKind];
    const certificateNumber = `${prefix}-${certificateSuffix(request.idempotencyKey)}`;
    const certificateUrl = `${MIC_MOCK_CERTIFICATE_LOOKUP_URL}/${certificateNumber}`;
    this.logger.warn({
      msg: 'insurance: MIC GIẢ LẬP phát hành GCN — không có hiệu lực bảo hiểm thật',
      idempotencyKey: request.idempotencyKey,
      productKind: request.productKind,
      certificateNumber,
    });
    return Promise.resolve({
      ok: true,
      certificateNumber,
      certificateUrl,
      partnerProductCode: prefix,
      // Bằng chứng ghi thẳng vào DB — đánh dấu `mock` để không ai đọc nhầm thành hợp đồng thật.
      raw: {
        mock: true,
        partner: 'mic',
        certificateNumber,
        certificateUrl,
        productKind: request.productKind,
        premiumAmount: request.premiumAmount,
        coverageFrom: request.coverageFrom.toISOString(),
        coverageTo: request.coverageTo.toISOString(),
      },
    });
  }
}

/** Lý do một yêu cầu phát hành không hợp lệ — `null` = hợp lệ. Cùng điều đối tác thật sẽ đòi. */
function invalidReason(request: IssuePolicyRequest): string | null {
  const premium = Number(request.premiumAmount);
  if (!Number.isFinite(premium) || premium <= 0) {
    return `Phí bảo hiểm không hợp lệ: ${request.premiumAmount}`;
  }
  if (!(request.coverageTo.getTime() > request.coverageFrom.getTime())) {
    return 'Thời hạn bảo hiểm không hợp lệ — ngày kết thúc phải sau ngày bắt đầu';
  }
  return null;
}

/** 8 ký tự HEX in hoa, tất định theo khoá chống mua đôi. */
function certificateSuffix(idempotencyKey: string): string {
  return createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 8).toUpperCase();
}
