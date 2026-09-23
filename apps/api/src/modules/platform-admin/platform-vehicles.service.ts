import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  resolveMarketplaceVisibility,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type PaginationMeta,
} from '@xeprime/types';
import { marketplaceVehicleWhere } from '../../common/marketplace-vehicle-scope';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ListingsService } from '../public-listings/listings.service';
import {
  HideVehicleDto,
  PLATFORM_VEHICLE_DEFAULT_LIMIT,
  PLATFORM_VEHICLE_MAX_LIMIT,
  PlatformVehicleDetailDto,
  PlatformVehicleDto,
  PlatformVehicleListQueryDto,
} from './dto/platform-vehicle.dto';

const LIST_SELECT = {
  id: true,
  code: true,
  name: true,
  plateNumber: true,
  vehicleType: true,
  serviceTypes: true,
  publicStatus: true,
  operationStatus: true,
  // Trục HIỂN THỊ của chủ xe (ADR 0048) — admin đọc để hiểu vì sao bỏ ẩn không đưa xe lên lại.
  // `deletedAt` đi kèm vì phép gộp hiển thị cần nó; truy vấn ở đây lọc `deletedAt: null`, nhưng
  // luật thì không được dựa vào điều đó.
  marketplaceEnabled: true,
  deletedAt: true,
  mainImageUrl: true,
  weekdayPrice: true,
  tenantId: true,
  createdAt: true,
  tenant: {
    select: {
      name: true,
      status: true,
      deletedAt: true,
      profile: { select: { provinceName: true } },
    },
  },
  publicListing: { select: { status: true } },
} satisfies Prisma.VehicleSelect;

/**
 * Xe TOÀN HỆ THỐNG cho admin nền tảng (build plan §11.1) — không tenant-scope.
 *
 * Kiểm duyệt: ẩn xe vi phạm khỏi Marketplace bằng cách hạ `publicStatus` về `hidden`, rồi để
 * `ListingsService.syncFromVehicle` suy ra trạng thái snapshot trong CÙNG transaction — module
 * này KHÔNG tự ghi `public_listings` (ADR 0008). Bỏ ẩn là đường ngược lại và chỉ đi được từ
 * `hidden`: đó là trạng thái duy nhất mà nền tảng tạo ra.
 *
 * Từ ADR 0048, lựa chọn hiển thị của CHỦ XE là một cột riêng (`marketplace_enabled`) và module
 * này không bao giờ ghi vào đó. Hệ quả cần nhớ khi đọc code ở đây: bỏ ẩn một chiếc xe mà chủ xe
 * đang tắt sẽ đưa `public_status` về `approved_public` nhưng listing VẪN `hidden` — đúng ý, và
 * là lý do `marketplaceEnabled` có mặt trong DTO để người kiểm duyệt nhìn thấy.
 */
@Injectable()
export class PlatformVehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly listings: ListingsService,
  ) {}

  async list(
    query: PlatformVehicleListQueryDto,
  ): Promise<{ data: PlatformVehicleDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, PLATFORM_VEHICLE_DEFAULT_LIMIT, PLATFORM_VEHICLE_MAX_LIMIT);

    const q = query.q?.trim();
    const where: Prisma.VehicleWhereInput = {
      deletedAt: null,
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.publicStatus ? { publicStatus: query.publicStatus } : {}),
      ...(query.operationStatus ? { operationStatus: query.operationStatus } : {}),
      ...(query.vehicleType ? { vehicleType: query.vehicleType } : {}),
      // Lọc theo trạng thái gian hàng: dùng để soát xe của shop đang bị khoá.
      ...(query.tenantStatus ? { tenant: { status: query.tenantStatus } } : {}),
      /*
       * "Đang thật sự hiện ngoài chợ" — bốn vế của `marketplaceVehicleWhere()`, đẩy vào `AND`
       * chứ không spread phẳng: nó mang khoá `tenant` và `publicStatus`, đúng hai khoá mà bộ
       * lọc ở trên có thể đã dùng. Spread sẽ ghi đè im lặng một trong hai.
       */
      ...(query.marketplaceVisible === undefined
        ? {}
        : query.marketplaceVisible
          ? { AND: [marketplaceVehicleWhere()] }
          : { NOT: marketplaceVehicleWhere() }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { plateNumber: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({
        where,
        // ULID id làm tiebreak — phân trang ổn định khi nhiều xe cùng mili-giây.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: LIST_SELECT,
      }),
    ]);

    return { data: rows.map(toListItem), meta: paginationMeta(paging, total) };
  }

  async getOne(id: string): Promise<PlatformVehicleDetailDto> {
    const row = await this.prisma.vehicle.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...LIST_SELECT,
        brand: true,
        model: true,
        manufactureYear: true,
        seatCount: true,
        fuelType: true,
        description: true,
        weekendPrice: true,
        hourlyPrice: true,
        updatedAt: true,
        tenant: {
          select: {
            name: true,
            slug: true,
            status: true,
            // `deletedAt` phải có mặt: select này GHI ĐÈ nhánh `tenant` của `LIST_SELECT`, và
            // `toListItem` đọc nó để suy trạng thái hiển thị (ADR 0048).
            deletedAt: true,
            owner: { select: { displayName: true } },
            profile: { select: { provinceName: true } },
          },
        },
        _count: { select: { bookings: true, reviews: true } },
      },
    });
    if (!row) throw notFound();

    return {
      ...toListItem(row),
      brand: row.brand,
      model: row.model,
      manufactureYear: row.manufactureYear,
      seatCount: row.seatCount,
      fuelType: row.fuelType,
      description: row.description,
      weekendPrice: row.weekendPrice as unknown as string | null,
      hourlyPrice: row.hourlyPrice as unknown as string | null,
      tenantSlug: row.tenant.slug,
      ownerName: row.tenant.owner?.displayName ?? null,
      bookingCount: row._count.bookings,
      reviewCount: row._count.reviews,
      updatedAt: (row.updatedAt as Date).toISOString(),
    };
  }

  /** Ẩn xe vi phạm: `approved_public` → `hidden`, snapshot Marketplace hạ theo, ghi audit. */
  async hide(id: string, actorUserId: string, dto: HideVehicleDto): Promise<PlatformVehicleDetailDto> {
    await this.transition(
      id,
      actorUserId,
      VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      VEHICLE_PUBLIC_STATUS.HIDDEN,
      'vehicle.platform_hide',
      dto.reason,
      'Chỉ ẩn được xe đang hiển thị công khai',
    );
    return this.getOne(id);
  }

  /**
   * Bỏ ẩn: `hidden` → `approved_public` (xe đã từng được duyệt), snapshot đồng bộ lại, ghi audit.
   *
   * KHÔNG đụng `marketplace_enabled` (ADR 0048 điều 4): nếu chủ xe đang tự tắt hiển thị thì bỏ
   * ẩn chỉ trả lại trạng thái KIỂM DUYỆT, và xe vẫn nằm ngoài chợ cho tới khi chính họ bật lại.
   * Bỏ ẩn kèm bật hộ là nền tảng đảo ngược một quyết định không thuộc về mình —
   * `syncFromVehicle` nhân hai trục nên điều đó tự đúng, chỉ cần không ai ghi thêm gì ở đây.
   */
  async unhide(id: string, actorUserId: string): Promise<PlatformVehicleDetailDto> {
    await this.transition(
      id,
      actorUserId,
      VEHICLE_PUBLIC_STATUS.HIDDEN,
      VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      'vehicle.platform_unhide',
      undefined,
      'Chỉ bỏ ẩn được xe đang bị nền tảng ẩn',
    );
    return this.getOne(id);
  }

  /**
   * Đổi `publicStatus` đúng một bước + đồng bộ snapshot + ghi audit, tất cả trong một
   * transaction. `updateMany` có điều kiện trạng thái nguồn nên hai request đồng thời chỉ một
   * cái đổi được (cái còn lại nhận 409 thay vì ghi đè im lặng).
   */
  private async transition(
    id: string,
    actorUserId: string,
    from: string,
    to: string,
    action: string,
    reason: string | undefined,
    conflictMessage: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.vehicle.updateMany({
        where: { id, publicStatus: from, deletedAt: null },
        data: { publicStatus: to },
      });
      if (res.count !== 1) {
        const exists = await tx.vehicle.findFirst({
          where: { id, deletedAt: null },
          select: { id: true },
        });
        if (!exists) throw notFound();
        throw new ConflictException({
          code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
          message: conflictMessage,
        });
      }

      const vehicle = await tx.vehicle.findUniqueOrThrow({
        where: { id },
        select: { tenantId: true },
      });

      // ADR 0008: chỉ ListingsService được ghi public_listings — gọi trong cùng tx để snapshot
      // không bao giờ lệch với publicStatus vừa đổi.
      await this.listings.syncFromVehicle(id, tx);

      await this.audit.record(
        {
          tenantId: vehicle.tenantId,
          actorUserId,
          actorScope: 'platform',
          action,
          targetType: 'vehicle',
          targetId: id,
          before: { publicStatus: from },
          after: { publicStatus: to, ...(reason ? { reason } : {}) },
        },
        tx,
      );
    });
  }
}

type VehicleRow = Prisma.VehicleGetPayload<{ select: typeof LIST_SELECT }>;

function toListItem(r: VehicleRow): PlatformVehicleDto {
  /*
   * Server suy LÝ DO, màn kiểm duyệt không ghép lại (ADR 0048 điều 5).
   *
   * `shopActive` đọc từ CHÍNH hàng dữ liệu (`tenant.status`) chứ không từ một scope chung — danh
   * sách này không tenant-scoped, nên mỗi dòng có một gian hàng khác nhau.
   */
  const visibility = resolveMarketplaceVisibility({
    deletedAt: r.deletedAt,
    publicStatus: r.publicStatus,
    marketplaceEnabled: r.marketplaceEnabled,
    shopActive: r.tenant.status === TENANT_STATUS.ACTIVE && r.tenant.deletedAt == null,
  });

  return {
    id: r.id,
    code: r.code,
    name: r.name,
    plateNumber: r.plateNumber,
    vehicleType: r.vehicleType,
    serviceTypes: r.serviceTypes,
    publicStatus: r.publicStatus,
    operationStatus: r.operationStatus,
    mainImageUrl: r.mainImageUrl,
    weekdayPrice: r.weekdayPrice as unknown as string | null,
    tenantId: r.tenantId,
    tenantName: r.tenant.name,
    tenantStatus: r.tenant.status,
    provinceName: r.tenant.profile?.provinceName ?? null,
    listingStatus: r.publicListing?.status ?? null,
    marketplaceEnabled: r.marketplaceEnabled,
    isMarketplaceVisible: visibility.visible,
    marketplaceVisibilityReason: visibility.reason,
    createdAt: (r.createdAt as Date).toISOString(),
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy xe',
  });
}
