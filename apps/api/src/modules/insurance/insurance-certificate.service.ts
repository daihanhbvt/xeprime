import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MicUnavailableError, type MicClient } from '@xeprime/prisma';
import { API_ERROR_CODE, INSURANCE_POLICY_STATUS } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { MIC_CLIENT } from './partner/insurance-partner.port';

/** Hợp đồng có GCN để tải: đã cấp, hoặc đang bồi thường (vẫn là hợp đồng có hiệu lực). */
const DOWNLOADABLE = [INSURANCE_POLICY_STATUS.ISSUED, INSURANCE_POLICY_STATUS.CLAIM];

export interface CertificatePdf {
  file: Buffer;
  fileName: string;
}

/**
 * GCN PDF của một hợp đồng — ADR 0088.
 *
 * KHÔNG lưu file: GCN mang tên, SĐT, CCCD của khách và chủ xe. Mỗi lần có người bấm "Tải GCN",
 * API tải từ MIC (`download-gcn-by-so-id`) — API chạy trên máy chủ có IP MIC đã whitelist, còn
 * link `gcn?hash=` của MIC thì người dùng thường KHÔNG mở được (MIC chặn theo IP).
 *
 * Phạm vi do CALLER truyền vào và nằm TRONG truy vấn: hợp đồng không thuộc phạm vi ⇒ 404, không
 * tiết lộ nó có tồn tại.
 */
@Injectable()
export class InsuranceCertificateService {
  private readonly logger = new Logger(InsuranceCertificateService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MIC_CLIENT) private readonly mic: MicClient | null,
  ) {}

  async pdf(
    policyId: string,
    scope: { bookingId?: string; tenantId?: string },
  ): Promise<CertificatePdf> {
    const policy = await this.prisma.bookingInsurancePolicy.findFirst({
      where: {
        id: policyId,
        status: { in: DOWNLOADABLE },
        partnerPolicyId: { not: null },
        ...(scope.bookingId ? { bookingId: scope.bookingId } : {}),
        ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      },
      select: { partnerPolicyId: true, partnerContractNumber: true, certificateNumber: true },
    });
    if (!policy?.partnerPolicyId) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không có giấy chứng nhận bảo hiểm để tải',
      });
    }
    if (!this.mic) throw unavailable();
    let file: Buffer | null;
    try {
      file = await this.mic.downloadCertificate(policy.partnerPolicyId);
    } catch (err) {
      if (err instanceof MicUnavailableError) {
        this.logger.warn({ msg: 'Tải GCN từ MIC lỗi', policyId, reason: err.message });
        throw unavailable();
      }
      throw err;
    }
    if (!file || file.length === 0) throw unavailable();
    const number = (policy.partnerContractNumber ?? policy.certificateNumber ?? policyId).replace(
      /[^A-Za-z0-9-]/g,
      '',
    );
    return { file, fileName: `GCN-MIC-${number}.pdf` };
  }
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: API_ERROR_CODE.INSURANCE_CERTIFICATE_UNAVAILABLE,
    message: 'Chưa tải được giấy chứng nhận từ hãng bảo hiểm - thử lại sau ít phút',
  });
}
