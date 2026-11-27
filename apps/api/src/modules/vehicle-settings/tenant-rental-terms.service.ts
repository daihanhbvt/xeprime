import { BadRequestException, Injectable } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  RENTAL_TERMS_GROUP_VALUES,
  rentalTermsGroupOf,
  type RentalTermsGroup,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  SaveTenantRentalTermsDto,
  TenantRentalTermsDto,
  TenantRentalTermsItemDto,
} from './dto/tenant-rental-terms.dto';

type Db = Prisma.TransactionClient | PrismaService;

/** Điều khoản HIỆU LỰC của một nhóm - luôn đủ trường, kể cả khi gian hàng chưa lưu. */
export interface EffectiveRentalTerms {
  serviceType: RentalTermsGroup;
  termsText: string | null;
  requireTermsAcceptance: boolean;
  updatedAt: Date | null;
}

/**
 * Điều khoản thuê của GIAN HÀNG (ADR 0112 điều 3) - writer DUY NHẤT của `tenant_rental_terms`.
 * Hai nhóm: `self_drive` (Tự lái & Dài hạn) và `with_driver` (Có tài xế); áp cho mọi xe. Giấy tờ và
 * cách đối chiếu danh tính KHÔNG ở đây - đó là luật chuẩn `PLATFORM_RENTAL_CONDITIONS`.
 */
@Injectable()
export class TenantRentalTermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(tenantId: string): Promise<TenantRentalTermsDto> {
    const rows = await this.prisma.tenantRentalTerms.findMany({ where: { tenantId } });
    return {
      items: RENTAL_TERMS_GROUP_VALUES.map((group) =>
        toItem(effectiveOf(group, rows.find((r) => r.serviceType === group))),
      ),
    };
  }

  /** Upsert theo nhóm + audit before/after trong MỘT transaction. */
  async save(
    tenantId: string,
    userId: string,
    dto: SaveTenantRentalTermsDto,
  ): Promise<TenantRentalTermsDto> {
    const items = dto.items.map((i) => ({
      serviceType: i.serviceType,
      termsText: i.termsText?.trim() || null,
      requireTermsAcceptance: i.requireTermsAcceptance,
    }));
    for (const item of items) {
      if (item.requireTermsAcceptance && !item.termsText) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Bắt buộc khách xác nhận điều khoản thì phải có nội dung điều khoản',
          details: { field: 'termsText', serviceType: item.serviceType },
        });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.tenantRentalTerms.findMany({ where: { tenantId } });
      for (const item of items) {
        const data = {
          termsText: item.termsText,
          requireTermsAcceptance: item.requireTermsAcceptance,
          updatedBy: userId,
        };
        await tx.tenantRentalTerms.upsert({
          where: { tenantId_serviceType: { tenantId, serviceType: item.serviceType } },
          create: { id: newId(), tenantId, serviceType: item.serviceType, ...data },
          update: data,
        });
      }
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'tenant_rental_terms.update',
          targetType: 'tenant',
          targetId: tenantId,
          before: before.map((r) => ({
            serviceType: r.serviceType,
            termsText: r.termsText,
            requireTermsAcceptance: r.requireTermsAcceptance,
          })),
          after: items,
        },
        tx,
      );
    });
    return this.get(tenantId);
  }

  /** Điều khoản áp cho MỘT dịch vụ (dài hạn đọc nhóm tự lái). */
  async termsFor(db: Db, tenantId: string, serviceType: string): Promise<EffectiveRentalTerms> {
    const group = rentalTermsGroupOf(serviceType);
    const row = await db.tenantRentalTerms.findUnique({
      where: { tenantId_serviceType: { tenantId, serviceType: group } },
    });
    return effectiveOf(group, row ?? undefined);
  }
}

function effectiveOf(
  group: RentalTermsGroup,
  row:
    | { termsText: string | null; requireTermsAcceptance: boolean; updatedAt: Date }
    | undefined,
): EffectiveRentalTerms {
  const termsText = row?.termsText?.trim() ? row.termsText : null;
  return {
    serviceType: group,
    termsText,
    // Không có nội dung thì không có gì để xác nhận.
    requireTermsAcceptance: Boolean(row?.requireTermsAcceptance && termsText),
    updatedAt: row?.updatedAt ?? null,
  };
}

function toItem(t: EffectiveRentalTerms): TenantRentalTermsItemDto {
  return {
    serviceType: t.serviceType,
    termsText: t.termsText,
    requireTermsAcceptance: t.requireTermsAcceptance,
    updatedAt: t.updatedAt?.toISOString() ?? null,
  };
}
