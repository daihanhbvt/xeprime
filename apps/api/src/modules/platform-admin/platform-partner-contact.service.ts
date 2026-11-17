import { Injectable, NotFoundException } from '@nestjs/common';
import { API_ERROR_CODE } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { PartnerContactDto } from './dto/platform-partner.dto';

/** Hành động audit của một lượt bỏ che — nhãn ở `Domain.auditAction.tenant.contact_reveal`. */
export const PARTNER_CONTACT_REVEAL_AUDIT_ACTION = 'tenant.contact_reveal';

/**
 * Bỏ che liên hệ của MỘT đối tác cho drawer Platform Admin.
 *
 * Tách khỏi `PlatformPartnerDetailService` vì service đó (và controller của nó) hứa "đọc không để
 * lại dấu", còn lượt này CỐ Ý để lại dấu: "ai đã xem SĐT của chủ gian hàng nào, lúc nào" phải trả
 * lời được (CLAUDE.md §6) — cùng khuôn với `PlatformCustomersService.revealContact`.
 */
@Injectable()
export class PlatformPartnerContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async reveal(tenantId: string, actorUserId: string): Promise<PartnerContactDto> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: {
        id: true,
        phone: true,
        email: true,
        owner: { select: { phone: true, email: true } },
      },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy đối tác',
      });
    }

    await this.audit.record({
      actorUserId,
      actorScope: 'platform',
      action: PARTNER_CONTACT_REVEAL_AUDIT_ACTION,
      targetType: 'tenant',
      targetId: tenant.id,
      tenantId: tenant.id,
      // Chỉ ghi ĐÃ xem cái gì, không chép giá trị PII vào log.
      after: { revealed: ['ownerPhone', 'ownerEmail', 'publicPhone', 'publicEmail'] },
    });

    return {
      tenantId: tenant.id,
      ownerPhone: tenant.owner?.phone ?? null,
      ownerEmail: tenant.owner?.email ?? null,
      publicPhone: tenant.phone,
      publicEmail: tenant.email,
    };
  }
}
