import { Injectable } from '@nestjs/common';
import {
  enqueuePlanGuideEmail,
  Prisma,
  type EnqueuePlanGuideEmailInput,
} from '@xeprime/prisma';
import {
  APP_CONFIG_AUDIT_ACTION,
  APP_CONFIG_KEY,
  AUDIT_ACTOR_SCOPE,
  AUDIT_TARGET_TYPE,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  PartnerAppConfigAdminDto,
  PartnerAppConfigDto,
  UpdatePartnerAppConfigDto,
} from './dto/app-config.dto';

type Db = PrismaService | Prisma.TransactionClient;

const ADMIN_SELECT = {
  isPlanPromotionEnabled: true,
  version: true,
  supportHotline: true,
  supportZalo: true,
  updatedAt: true,
  updater: { select: { displayName: true } },
} satisfies Prisma.PlatformAppConfigSelect;

type AdminRow = Prisma.PlatformAppConfigGetPayload<{ select: typeof ADMIN_SELECT }>;

/**
 * Cấu hình app bật/tắt từ xa — WRITER DUY NHẤT của `platform_app_configs`, và là cửa xếp hàng email
 * hướng dẫn gói phía API (worker xếp hàng các mốc vòng đời gói bằng cùng khoá chống trùng).
 *
 * Đổi cấu hình: audit + `version` +1 trong MỘT transaction. App đọc lại qua `GET /app-config/partner`
 * khi màn được focus (không realtime).
 */
@Injectable()
export class AppConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getPartner(db: Db = this.prisma): Promise<PartnerAppConfigDto> {
    const row = await db.platformAppConfig.findUnique({
      where: { key: APP_CONFIG_KEY.PARTNER },
      select: { isPlanPromotionEnabled: true, version: true },
    });
    // Dòng do migration nạp; thiếu (DB dựng tay) ⇒ mặc định TẮT, không bao giờ đoán bật.
    return row ?? { isPlanPromotionEnabled: false, version: 1 };
  }

  async getPartnerAdmin(): Promise<PartnerAppConfigAdminDto> {
    const row = await this.ensureRow(this.prisma);
    return toAdmin(row);
  }

  async updatePartner(
    actorUserId: string,
    dto: UpdatePartnerAppConfigDto,
  ): Promise<PartnerAppConfigAdminDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.ensureRow(tx);
      // Khoá dòng: hai admin PATCH cùng lúc không được cùng đọc một `version`.
      await tx.$queryRaw`SELECT key FROM platform_app_configs WHERE key = ${APP_CONFIG_KEY.PARTNER} FOR UPDATE`;
      const before = await tx.platformAppConfig.findUniqueOrThrow({
        where: { key: APP_CONFIG_KEY.PARTNER },
        select: ADMIN_SELECT,
      });

      const data: Prisma.PlatformAppConfigUpdateInput = {};
      if (dto.isPlanPromotionEnabled !== undefined && dto.isPlanPromotionEnabled !== before.isPlanPromotionEnabled) {
        data.isPlanPromotionEnabled = dto.isPlanPromotionEnabled;
      }
      if (dto.supportHotline !== undefined && dto.supportHotline !== before.supportHotline) {
        data.supportHotline = dto.supportHotline;
      }
      if (dto.supportZalo !== undefined && dto.supportZalo !== before.supportZalo) {
        data.supportZalo = dto.supportZalo;
      }
      // Không đổi gì ⇒ không bump, không audit, không chiếu lại.
      if (Object.keys(data).length === 0) return before;

      const after = await tx.platformAppConfig.update({
        where: { key: APP_CONFIG_KEY.PARTNER },
        data: { ...data, version: { increment: 1 }, updater: { connect: { id: actorUserId } } },
        select: ADMIN_SELECT,
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: APP_CONFIG_AUDIT_ACTION.UPDATE,
          targetType: AUDIT_TARGET_TYPE.APP_CONFIG,
          targetId: APP_CONFIG_KEY.PARTNER,
          before: snapshot(before),
          after: snapshot(after),
        },
        tx,
      );
      return after;
    });
    return toAdmin(row);
  }

  /** Hotline/Zalo cho nội dung email. */
  async contact(): Promise<{ hotline: string | null; zalo: string | null }> {
    const row = await this.prisma.platformAppConfig.findUnique({
      where: { key: APP_CONFIG_KEY.PARTNER },
      select: { supportHotline: true, supportZalo: true },
    });
    return { hotline: row?.supportHotline ?? null, zalo: row?.supportZalo ?? null };
  }

  /**
   * Xếp hàng email hướng dẫn gói — cổng `isPlanPromotionEnabled` + khoá chống trùng sống ở
   * `enqueuePlanGuideEmail` của `@xeprime/prisma` (dùng CHUNG với worker). Trả `true` khi có một
   * dòng mới vào hàng.
   */
  enqueuePlanGuide(db: Db, input: EnqueuePlanGuideEmailInput): Promise<boolean> {
    return enqueuePlanGuideEmail(db, input);
  }

  private async ensureRow(db: Db): Promise<AdminRow> {
    return db.platformAppConfig.upsert({
      where: { key: APP_CONFIG_KEY.PARTNER },
      create: { key: APP_CONFIG_KEY.PARTNER },
      update: {},
      select: ADMIN_SELECT,
    });
  }
}

function snapshot(row: AdminRow) {
  return {
    isPlanPromotionEnabled: row.isPlanPromotionEnabled,
    version: row.version,
    supportHotline: row.supportHotline,
    supportZalo: row.supportZalo,
  };
}

function toAdmin(row: AdminRow): PartnerAppConfigAdminDto {
  return {
    isPlanPromotionEnabled: row.isPlanPromotionEnabled,
    version: row.version,
    supportHotline: row.supportHotline,
    supportZalo: row.supportZalo,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updater?.displayName ?? null,
  };
}
