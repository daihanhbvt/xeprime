import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { newId } from '@xeprime/prisma';
import { API_ERROR_CODE } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  AdminBannerDto,
  CreateBannerDto,
  PublicBannerDto,
  ReorderBannersDto,
  UpdateBannerDto,
} from './dto/banner.dto';

/** Admin có thể lưu không giới hạn, nhưng không được xếp quá bấy nhiêu banner hiển thị cùng lúc. */
const MAX_CONCURRENT_VISIBLE_BANNERS = 10;

/** Khoá giao dịch riêng cho singleton banner, tránh hai admin cùng vượt trần trong hai request song song. */
const BANNER_VISIBILITY_LOCK_ID = 93254107;

/**
 * Giữ khoá singleton của banner trong suốt giao dịch.
 *
 * `$executeRaw` chứ KHÔNG `$queryRaw`, và đây là điều kiện để nó chạy được chứ không phải sở
 * thích: `pg_advisory_xact_lock` trả về kiểu `void`, mà `$queryRaw` phải ánh xạ kiểu của TỪNG
 * CỘT kết quả — `fieldToColumnType` của `@prisma/adapter-pg` không có nhánh nào cho OID 2278
 * (`void`) nên nó ném `UnsupportedNativeDataType` ngay câu lệnh đầu tiên của transaction.
 *
 * `$executeRaw` chỉ đọc số dòng bị ảnh hưởng, không đụng tới kiểu cột, nên nó là helper đúng cho
 * mọi câu lệnh mà kết quả bị bỏ đi.
 *
 * Lỗi này chỉ lộ ra khi chạy với PostgreSQL THẬT: không có DB thì spec tự bỏ qua và CI xanh giả.
 */
function lockBannerVisibility(tx: Pick<PrismaService, '$executeRaw'>): Promise<number> {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(CAST(${BANNER_VISIBILITY_LOCK_ID} AS bigint))`;
}

const SELECT = {
  id: true,
  title: true,
  imageUrl: true,
  tabletImageUrl: true,
  mobileImageUrl: true,
  altText: true,
  linkUrl: true,
  sortOrder: true,
  active: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Row = {
  id: string;
  title: string;
  imageUrl: string;
  tabletImageUrl: string | null;
  mobileImageUrl: string | null;
  altText: string;
  linkUrl: string | null;
  sortOrder: number;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Banner hero trang chủ — ĐƯỜNG GHI DUY NHẤT của `marketplace_banners`.
 *
 * Nội dung này hiện với toàn bộ khách truy cập nên: mutation nào cũng cần quyền
 * `platform.banners.manage` (guard ở controller) và đều ghi `audit_logs`; public API chỉ trả
 * đúng các trường cần render, không lộ tên nội bộ/lịch/metadata.
 */
@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Trả TOÀN BỘ banner đang hiển thị; giới hạn 10 được chặn ở đường ghi, không cắt âm thầm ở đây. */
  async publicList(): Promise<PublicBannerDto[]> {
    const now = new Date();
    const rows = await this.prisma.marketplaceBanner.findMany({
      where: {
        active: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        imageUrl: true,
        tabletImageUrl: true,
        mobileImageUrl: true,
        altText: true,
        linkUrl: true,
      },
    });
    return rows;
  }

  async listForAdmin(): Promise<AdminBannerDto[]> {
    const rows = await this.prisma.marketplaceBanner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: SELECT,
    });
    return rows.map((row) => this.toAdminDto(row));
  }

  async create(actorUserId: string, dto: CreateBannerDto): Promise<AdminBannerDto> {
    this.assertSchedule(dto.startsAt ?? null, dto.endsAt ?? null);

    const row = await this.prisma.$transaction(async (tx) => {
      await lockBannerVisibility(tx);

      const active = dto.active ?? true;
      const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
      const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
      if (active) await this.assertVisibilityCapacity(tx, { startsAt, endsAt });

      const created = await tx.marketplaceBanner.create({
        data: {
          id: newId(),
          title: dto.title.trim(),
          imageUrl: dto.imageUrl.trim(),
          tabletImageUrl: dto.tabletImageUrl?.trim() || null,
          mobileImageUrl: dto.mobileImageUrl?.trim() || null,
          altText: dto.altText.trim(),
          linkUrl: dto.linkUrl?.trim() || null,
          sortOrder: dto.sortOrder ?? (await this.nextSortOrder(tx)),
          active,
          startsAt,
          endsAt,
          createdBy: actorUserId,
        },
        select: SELECT,
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'banner.create',
          targetType: 'marketplace_banner',
          targetId: created.id,
          after: { title: created.title, imageUrl: created.imageUrl, active: created.active },
        },
        tx,
      );
      return created;
    });
    return this.toAdminDto(row);
  }

  async update(actorUserId: string, id: string, dto: UpdateBannerDto): Promise<AdminBannerDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      await lockBannerVisibility(tx);
      const current = await this.load(id, tx);

      // Lịch mới = giá trị gửi lên nếu CÓ MẶT trong payload (kể cả null = xoá), không thì giữ cũ —
      // phải ghép xong mới kiểm tra được thứ tự, vì admin có thể chỉ sửa một đầu.
      const startsAt =
        'startsAt' in dto ? (dto.startsAt ? new Date(dto.startsAt) : null) : current.startsAt;
      const endsAt = 'endsAt' in dto ? (dto.endsAt ? new Date(dto.endsAt) : null) : current.endsAt;
      const active = dto.active ?? current.active;
      this.assertSchedule(startsAt?.toISOString() ?? null, endsAt?.toISOString() ?? null);

      const visibilityChanged = 'active' in dto || 'startsAt' in dto || 'endsAt' in dto;
      if (active && visibilityChanged) {
        await this.assertVisibilityCapacity(tx, { startsAt, endsAt }, id);
      }

      const updated = await tx.marketplaceBanner.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl.trim() } : {}),
          ...('tabletImageUrl' in dto
            ? { tabletImageUrl: dto.tabletImageUrl?.trim() || null }
            : {}),
          ...('mobileImageUrl' in dto
            ? { mobileImageUrl: dto.mobileImageUrl?.trim() || null }
            : {}),
          ...(dto.altText !== undefined ? { altText: dto.altText.trim() } : {}),
          ...('linkUrl' in dto ? { linkUrl: dto.linkUrl?.trim() || null } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...('startsAt' in dto || 'endsAt' in dto ? { startsAt, endsAt } : {}),
        },
        select: SELECT,
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'banner.update',
          targetType: 'marketplace_banner',
          targetId: id,
          before: { title: current.title, active: current.active, imageUrl: current.imageUrl },
          after: { title: updated.title, active: updated.active, imageUrl: updated.imageUrl },
        },
        tx,
      );
      return updated;
    });
    return this.toAdminDto(row);
  }

  /**
   * Xoá hẳn — banner không được bảng nào tham chiếu và ảnh vẫn nằm trên R2, nên xoá nhầm thì
   * tạo lại từ chính URL cũ; giữ "thùng rác" riêng cho nó là phức tạp không đổi lấy gì.
   */
  async remove(actorUserId: string, id: string): Promise<void> {
    const current = await this.load(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.marketplaceBanner.delete({ where: { id } });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'banner.delete',
          targetType: 'marketplace_banner',
          targetId: id,
          before: { title: current.title, imageUrl: current.imageUrl },
        },
        tx,
      );
    });
  }

  /** Ghi lại TRỌN thứ tự trong một transaction — gửi thiếu là từ chối, không lệch số âm thầm. */
  async reorder(actorUserId: string, dto: ReorderBannersDto): Promise<AdminBannerDto[]> {
    const rows = await this.prisma.marketplaceBanner.findMany({ select: { id: true } });
    const known = new Set(rows.map((r) => r.id));
    const unknown = dto.ids.filter((id) => !known.has(id));
    if (unknown.length > 0 || dto.ids.length !== rows.length) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Phải gửi đủ toàn bộ banner theo thứ tự mới',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of dto.ids.entries()) {
        await tx.marketplaceBanner.update({ where: { id }, data: { sortOrder: index } });
      }
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'banner.reorder',
          targetType: 'marketplace_banner',
          after: { ids: dto.ids },
        },
        tx,
      );
    });
    return this.listForAdmin();
  }

  private async load(
    id: string,
    db: Pick<PrismaService, 'marketplaceBanner'> = this.prisma,
  ): Promise<Row> {
    const row = await db.marketplaceBanner.findUnique({ where: { id }, select: SELECT });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy banner',
      });
    }
    return row;
  }

  private assertSchedule(startsAt: string | null, endsAt: string | null): void {
    if (startsAt && endsAt && !(new Date(endsAt).getTime() > new Date(startsAt).getTime())) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Thời điểm ngừng hiển thị phải sau thời điểm bắt đầu',
      });
    }
  }

  /**
   * Kiểm tra toàn bộ KHOẢNG LỊCH, không chỉ thời điểm hiện tại. Nếu chỉ đếm `visibleNow`, 10 banner
   * đang chạy vô hạn cộng một banner hẹn ngày mai vẫn hợp lệ hôm nay nhưng tự thành 11 khi tới lịch.
   */
  private async assertVisibilityCapacity(
    db: Pick<PrismaService, 'marketplaceBanner'>,
    candidate: { startsAt: Date | null; endsAt: Date | null },
    excludeId?: string,
  ): Promise<void> {
    const rows = await db.marketplaceBanner.findMany({
      where: {
        active: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { startsAt: true, endsAt: true },
    });

    // Không xét phần lịch đã trôi qua: banner chưa tồn tại ở quá khứ và không thể làm thay đổi trạng thái cũ.
    const candidateStart = Math.max(
      candidate.startsAt?.getTime() ?? Number.NEGATIVE_INFINITY,
      Date.now(),
    );
    const candidateEnd = candidate.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (candidateStart >= candidateEnd) return;
    const events: Array<{ at: number; delta: 1 | -1 }> = [];

    for (const row of rows) {
      const overlapStart = Math.max(
        candidateStart,
        row.startsAt?.getTime() ?? Number.NEGATIVE_INFINITY,
      );
      const overlapEnd = Math.min(candidateEnd, row.endsAt?.getTime() ?? Number.POSITIVE_INFINITY);
      if (overlapStart >= overlapEnd) continue;
      events.push({ at: overlapStart, delta: 1 }, { at: overlapEnd, delta: -1 });
    }

    // Khoảng lịch là [bắt đầu, kết thúc): cùng một mốc thì xử lý kết thúc trước bắt đầu.
    events.sort((a, b) => a.at - b.at || a.delta - b.delta);
    let concurrent = 0;
    for (const event of events) {
      concurrent += event.delta;
      if (concurrent >= MAX_CONCURRENT_VISIBLE_BANNERS) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message:
            'Chỉ được phép tối đa 10 banner hiển thị cùng thời điểm. Hãy tắt hoặc điều chỉnh lịch của banner khác trước.',
        });
      }
    }
  }

  private async nextSortOrder(tx: Pick<PrismaService, 'marketplaceBanner'>): Promise<number> {
    const last = await tx.marketplaceBanner.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return last ? last.sortOrder + 1 : 0;
  }

  private toAdminDto(row: Row): AdminBannerDto {
    const now = Date.now();
    return {
      id: row.id,
      title: row.title,
      imageUrl: row.imageUrl,
      tabletImageUrl: row.tabletImageUrl,
      mobileImageUrl: row.mobileImageUrl,
      altText: row.altText,
      linkUrl: row.linkUrl,
      sortOrder: row.sortOrder,
      active: row.active,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      visibleNow:
        row.active &&
        (!row.startsAt || row.startsAt.getTime() <= now) &&
        (!row.endsAt || row.endsAt.getTime() > now),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
