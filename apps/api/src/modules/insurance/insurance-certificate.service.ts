import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MicUnavailableError, type MicClient } from '@xeprime/prisma';
import { API_ERROR_CODE, INSURANCE_POLICY_STATUS } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { R2Service } from '../storage/r2.service';
import { MIC_CLIENT } from './partner/insurance-partner.port';

/** Hợp đồng có GCN để tải: đã cấp, hoặc đang bồi thường (vẫn là hợp đồng có hiệu lực). */
export const CERTIFICATE_DOWNLOADABLE_STATUSES = [
  INSURANCE_POLICY_STATUS.ISSUED,
  INSURANCE_POLICY_STATUS.CLAIM,
];

/** Trần cứng khi đọc bản lưu — một GCN vài trăm KB; to hơn nhiều nghĩa là object sai. */
const CERTIFICATE_MAX_BYTES = 10 * 1024 * 1024;

/** Khoá R2 RIÊNG TƯ của GCN — một hợp đồng một tệp, không bao giờ có đường công khai. */
export function insuranceCertificateObjectKey(policyId: string): string {
  return `insurance/certificates/${policyId}.pdf`;
}

export interface CertificatePdf {
  file: Buffer;
  fileName: string;
}

/**
 * GCN PDF của một hợp đồng — ADR 0088, ADR 0091 điều 6.
 *
 * Lưu một bản ở bucket R2 RIÊNG TƯ (`certificate_object_key`): khách gặp sự cố giữa đường mà API MIC
 * đang lỗi vẫn mở được giấy chứng nhận. Bản lưu được ghi ở lần tải đầu tiên, hoặc sớm hơn bởi vòng
 * lưu trước (`prefetch`) ngay sau khi hợp đồng được cấp. Chưa có bản lưu thì tải từ MIC
 * (`download-gcn-by-so-id` — chỉ máy chủ có IP whitelist gọi được), lưu rồi trả.
 *
 * Phạm vi do CALLER truyền vào và nằm TRONG truy vấn: hợp đồng không thuộc phạm vi ⇒ 404, không
 * tiết lộ nó có tồn tại. Tệp chỉ đi ra qua ba endpoint có phạm vi — không có link ký công khai.
 */
@Injectable()
export class InsuranceCertificateService {
  private readonly logger = new Logger(InsuranceCertificateService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MIC_CLIENT) private readonly mic: MicClient | null,
    /** Vắng (spec dựng tay) = không có kho riêng tư — tải thẳng từ đối tác như trước. */
    @Optional() private readonly r2?: R2Service,
  ) {}

  /** Kho R2 riêng tư dùng được cho bản lưu GCN. */
  private get storage(): R2Service | null {
    return this.r2?.privateEnabled ? this.r2 : null;
  }

  async pdf(
    policyId: string,
    scope: { bookingId?: string; tenantId?: string },
  ): Promise<CertificatePdf> {
    const policy = await this.prisma.bookingInsurancePolicy.findFirst({
      where: {
        id: policyId,
        status: { in: CERTIFICATE_DOWNLOADABLE_STATUSES },
        partnerPolicyId: { not: null },
        ...(scope.bookingId ? { bookingId: scope.bookingId } : {}),
        ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
      },
      select: {
        partnerPolicyId: true,
        partnerContractNumber: true,
        certificateNumber: true,
        certificateObjectKey: true,
      },
    });
    if (!policy?.partnerPolicyId) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không có giấy chứng nhận bảo hiểm để tải',
      });
    }
    const fileName = certificateFileName(
      policy.partnerContractNumber ?? policy.certificateNumber ?? policyId,
    );

    const stored = await this.readStored(policy.certificateObjectKey);
    if (stored) return { file: stored, fileName };

    const file = await this.downloadFromPartner(policyId, policy.partnerPolicyId);
    if (!file) throw unavailable();
    await this.store(policyId, file);
    return { file, fileName };
  }

  /**
   * Lưu trước GCN của các hợp đồng vừa cấp mà chưa có bản lưu (ADR 0091 điều 6) — vòng quét của API
   * gọi. Trả số bản đã lưu. Thiếu R2 riêng tư hoặc không chạy MIC thật thì không làm gì.
   */
  async prefetch(limit: number): Promise<number> {
    if (!this.mic || !this.storage) return 0;
    const due = await this.prisma.bookingInsurancePolicy.findMany({
      where: {
        status: { in: CERTIFICATE_DOWNLOADABLE_STATUSES },
        partnerPolicyId: { not: null },
        certificateObjectKey: null,
      },
      orderBy: { issuedAt: 'asc' },
      take: limit,
      select: { id: true, partnerPolicyId: true },
    });
    let stored = 0;
    for (const row of due) {
      const file = await this.downloadFromPartner(row.id, row.partnerPolicyId!);
      if (file && (await this.store(row.id, file))) stored += 1;
    }
    return stored;
  }

  private async readStored(key: string | null): Promise<Buffer | null> {
    const storage = this.storage;
    if (!key || !storage) return null;
    const bytes = await storage.readPrivateObject(key, CERTIFICATE_MAX_BYTES);
    return bytes && bytes.length > 0 ? Buffer.from(bytes) : null;
  }

  /** `null` khi đối tác lỗi / chưa cấu hình — caller quyết 503 hay bỏ qua. */
  private async downloadFromPartner(
    policyId: string,
    partnerPolicyId: string,
  ): Promise<Buffer | null> {
    if (!this.mic) return null;
    try {
      const file = await this.mic.downloadCertificate(partnerPolicyId);
      return file && file.length > 0 ? file : null;
    } catch (err) {
      if (err instanceof MicUnavailableError) {
        this.logger.warn({ msg: 'Tải GCN từ MIC lỗi', policyId, reason: err.message });
        return null;
      }
      throw err;
    }
  }

  /**
   * Ghi bản lưu rồi mới ghi khoá — một khoá không bao giờ trỏ vào tệp chưa có. Lưu hỏng không làm
   * hỏng lượt tải: người dùng vẫn nhận file, lần sau thử lưu lại.
   */
  private async store(policyId: string, file: Buffer): Promise<boolean> {
    const storage = this.storage;
    if (!storage) return false;
    const key = insuranceCertificateObjectKey(policyId);
    if (!(await storage.putPrivateObject(key, file, 'application/pdf'))) {
      this.logger.warn({ msg: 'Lưu GCN vào R2 lỗi', policyId });
      return false;
    }
    await this.prisma.bookingInsurancePolicy.updateMany({
      where: { id: policyId, certificateNumber: { not: null } },
      data: { certificateObjectKey: key },
    });
    return true;
  }
}

function certificateFileName(number: string): string {
  return `GCN-MIC-${number.replace(/[^A-Za-z0-9-]/g, '')}.pdf`;
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: API_ERROR_CODE.INSURANCE_CERTIFICATE_UNAVAILABLE,
    message: 'Chưa tải được giấy chứng nhận từ hãng bảo hiểm - thử lại sau ít phút',
  });
}
