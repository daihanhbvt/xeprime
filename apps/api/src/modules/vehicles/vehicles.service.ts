import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  APPROVAL_ACTION,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  API_ERROR_CODE,
  BOOKING_STATUS,
  POLICY_SOURCE,
  HELD_FUNDS_RECEIPT_SOURCES,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  SERVICE_TYPE,
  TENANT_STATUS,
  isVehicleFuelTypeAllowed,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_PUBLIC_SENSITIVE_FIELDS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_SUBMITTABLE,
  VEHICLE_TYPE,
  type PaginationMeta,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { BranchesService } from '../branches/branches.service';
import { CatalogService } from '../catalog/catalog.service';
import { policyData, PricingService } from '../pricing/pricing.service';
import { SaveVehiclePricingDto, VehiclePricingDto } from '../pricing/dto/pricing.dto';
import { ListingsService } from '../public-listings/listings.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateVehicleDto,
  FleetSummaryDto,
  UpdateVehicleDto,
  VEHICLE_DEFAULT_LIMIT,
  VEHICLE_MAX_LIMIT,
  Vehicle360SummaryDto,
  VehicleBookingBriefDto,
  VehicleDetailDto,
  VehicleListItemDto,
  VehicleListQueryDto,
  VehicleStatsDto,
  VehiclePublicReviewDto,
} from './dto/vehicle.dto';

/** Cột dùng cho một dòng bảng — không kéo `description` dài. */
const LIST_SELECT = {
  id: true,
  code: true,
  name: true,
  plateNumber: true,
  vehicleType: true,
  serviceTypes: true,
  sourceType: true,
  brand: true,
  model: true,
  manufactureYear: true,
  seatCount: true,
  bodyType: true,
  discountPercent: true,
  operationStatus: true,
  publicStatus: true,
  mainImageUrl: true,
  weekdayPrice: true,
  weekendPrice: true,
  updatedAt: true,
  // Chi nhánh đi kèm MỌI danh sách xe: "xe này ở đâu" là thông tin vận hành cơ bản, và tỉnh
  // lấy từ đây chứ không từ hồ sơ gian hàng nữa.
  branchId: true,
  branch: { select: { name: true, province: { select: { code: true, name: true } } } },
} satisfies Prisma.VehicleSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  color: true,
  fuelType: true,
  lengthMm: true,
  widthMm: true,
  heightMm: true,
  curbWeightKg: true,
  engineDisplacementCc: true,
  horsepowerHp: true,
  transmission: true,
  fuelConsumptionCity: true,
  fuelConsumptionHighway: true,
  fuelConsumptionCombined: true,
  hourlyPrice: true,
  monthlyPrice: true,
  withDriverDailyPrice: true,
  withDriverInterCityPrice: true,
  withDriverOneWayPrice: true,
  deliveryEnabled: true,
  noCollateral: true,
  description: true,
  createdAt: true,
} satisfies Prisma.VehicleSelect;

/** Đủ để kiểm tra đổi mã + phát hiện thay đổi trường nhạy cảm khi update (ADR 0008). */
const SENSITIVE_SELECT = {
  id: true,
  code: true,
  branchId: true,
  publicStatus: true,
  weekdayPrice: true,
  weekendPrice: true,
  hourlyPrice: true,
  monthlyPrice: true,
  withDriverDailyPrice: true,
  withDriverInterCityPrice: true,
  withDriverOneWayPrice: true,
  discountPercent: true,
  plateNumber: true,
  vehicleType: true,
  fuelType: true,
  bodyType: true,
  serviceTypes: true,
  mainImageUrl: true,
} satisfies Prisma.VehicleSelect;

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly listings: ListingsService,
    private readonly branches: BranchesService,
    private readonly billing: BillingService,
    private readonly catalog: CatalogService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * Chỉ số vận hành + tài chính cho một nhóm xe (thẻ xe ở `/manage/vehicles`).
   *
   * **Chỉ số LUỸ KẾ, không theo kỳ.** Backend chưa có hợp đồng khoảng thời gian cho thu/chi theo
   * xe, nên ở đây chỉ trả tổng từ trước tới nay. Bịa ra "doanh thu tháng này" bằng cách cắt theo
   * `createdAt` của phiếu sẽ sai nghiệp vụ: phiếu ghi nhận có thể lệch kỳ với lúc phát sinh.
   *
   * Gộp nhóm ở DB (`groupBy`) chứ không kéo bản ghi về đếm: một gian hàng vài nghìn phiếu vẫn
   * chỉ trả về vài chục dòng.
   *
   * `tenantId` từ scope (CLAUDE.md mục 6) và lọc lại `vehicleId in ids` — id đoán được của shop
   * khác sẽ rơi ra ngoài vì không khớp tenant.
   */
  async stats(
    tenantId: string,
    ids: string[],
    canViewFinance: boolean,
  ): Promise<VehicleStatsDto[]> {
    if (ids.length === 0) return [];

    const bookingScope = { tenantId, vehicleId: { in: ids }, deletedAt: null };

    const [bookingGroups, receiptGroups] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['vehicleId', 'status'],
        where: {
          ...bookingScope,
          status: { in: [BOOKING_STATUS.ACTIVE, BOOKING_STATUS.COMPLETED] },
        },
        _count: { _all: true },
      }),
      // Không có quyền tài chính thì KHÔNG chạy truy vấn — số liệu không được rời khỏi DB.
      canViewFinance
        ? this.prisma.receipt.groupBy({
            by: ['vehicleId', 'type'],
            where: {
              tenantId,
              vehicleId: { in: ids },
              status: RECEIPT_STATUS.APPROVED,
              deletedAt: null,
              // Loại TIỀN GIỮ HỘ khỏi doanh thu/chi phí của xe. Từ khi thu cọc và hoàn cọc lên sổ
              // (epic nối tiền), cọc cũng là phiếu thu gắn xe — cộng vào thì "Doanh thu" của xe
              // phình đúng bằng số cọc đang cầm, dù chưa đồng nào là của gian hàng.
              source: { notIn: [...HELD_FUNDS_RECEIPT_SOURCES] },
            },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
    ]);

    return ids.map((vehicleId) => {
      const bookingsOf = (status: string) =>
        bookingGroups.find((g) => g.vehicleId === vehicleId && g.status === status)?._count._all ??
        0;
      const sumOf = (type: string) =>
        receiptGroups.find((g) => g.vehicleId === vehicleId && g.type === type)?._sum.amount ??
        null;

      const stats: VehicleStatsDto = {
        vehicleId,
        activeBookings: bookingsOf(BOOKING_STATUS.ACTIVE),
        completedBookings: bookingsOf(BOOKING_STATUS.COMPLETED),
      };

      if (canViewFinance) {
        stats.totalIncome = String(sumOf(RECEIPT_TYPE.INCOME) ?? 0);
        stats.totalExpense = String(sumOf(RECEIPT_TYPE.EXPENSE) ?? 0);
      }

      return stats;
    });
  }

  /**
   * Đếm đội xe theo trạng thái vận hành — dải chỉ số đầu `/manage/vehicles` (Figma `236:4648`).
   *
   * Con số nói về CẢ đội xe của gian hàng, không phụ thuộc trang/bộ lọc — nên đếm ở DB bằng
   * `groupBy` (một truy vấn, vài dòng kết quả) thay vì để FE cộng từ trang hiện tại (sai ngay
   * khi có trang 2).
   */
  async fleetSummary(tenantId: string): Promise<FleetSummaryDto> {
    const groups = await this.prisma.vehicle.groupBy({
      by: ['operationStatus'],
      where: { tenantId, deletedAt: null },
      _count: { _all: true },
    });

    const countOf = (status: string) =>
      groups.find((g) => g.operationStatus === status)?._count._all ?? 0;

    return {
      total: groups.reduce((sum, g) => sum + g._count._all, 0),
      available: countOf(VEHICLE_OPERATION_STATUS.AVAILABLE),
      renting: countOf(VEHICLE_OPERATION_STATUS.RENTING),
      maintenance: countOf(VEHICLE_OPERATION_STATUS.MAINTENANCE),
      inactive: countOf(VEHICLE_OPERATION_STATUS.INACTIVE),
    };
  }

  /**
   * Tổng hợp cho Hồ sơ 360 của MỘT xe: chỉ số luỹ kế + đơn sắp tới + hoạt động gần đây.
   *
   * Gộp thành một endpoint để trang chi tiết không bắn N request rời. Từng khối gate theo quyền
   * ở đây chứ không ở FE: thiếu `bookings.view` thì truy vấn đơn KHÔNG chạy và hai danh sách
   * vắng mặt khỏi response; thiếu `finance.view` thì `stats` không mang số tiền (kế thừa từ
   * `stats()`).
   *
   * Xe phải thuộc tenant của người gọi — id đoán được của shop khác trả 404, không lộ tồn tại.
   */
  async summary360(
    tenantId: string,
    id: string,
    opts: { canViewFinance: boolean; canViewBookings: boolean },
  ): Promise<Vehicle360SummaryDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!vehicle) throw notFound();

    const [statsRow] = await this.stats(tenantId, [id], opts.canViewFinance);
    // `stats()` luôn trả một dòng cho mỗi id truyền vào; fallback chỉ để thoả type index-access.
    const result: Vehicle360SummaryDto = {
      stats: statsRow ?? { vehicleId: id, activeBookings: 0, completedBookings: 0 },
    };

    if (!opts.canViewBookings) return result;

    const briefSelect = {
      id: true,
      code: true,
      customerName: true,
      status: true,
      pickupAt: true,
      returnAt: true,
      totalAmount: true,
      updatedAt: true,
    } satisfies Prisma.BookingSelect;

    // "Sắp tới" = đơn còn chiếm lịch từ giờ trở đi (đặt trước/xác nhận/đang thuê, chưa trả xe).
    const [upcoming, recent] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          tenantId,
          vehicleId: id,
          deletedAt: null,
          status: {
            in: [BOOKING_STATUS.RESERVED, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACTIVE],
          },
          returnAt: { gte: new Date() },
        },
        orderBy: { pickupAt: 'asc' },
        take: 3,
        select: briefSelect,
      }),
      this.prisma.booking.findMany({
        where: { tenantId, vehicleId: id, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        take: 3,
        select: briefSelect,
      }),
    ]);

    const toBrief = (b: (typeof upcoming)[number]): VehicleBookingBriefDto => ({
      id: b.id,
      code: b.code,
      customerName: b.customerName,
      status: b.status,
      // Interceptor lo Date→ISO và Decimal→string ở tầng response (ADR 0007).
      pickupAt: b.pickupAt as unknown as string,
      returnAt: b.returnAt as unknown as string,
      totalAmount: b.totalAmount as unknown as string,
      updatedAt: b.updatedAt as unknown as string,
    });

    result.upcomingBookings = upcoming.map(toBrief);
    result.recentBookings = recent.map(toBrief);
    return result;
  }

  async list(
    tenantId: string,
    query: VehicleListQueryDto,
  ): Promise<{ data: VehicleListItemDto[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(VEHICLE_MAX_LIMIT, Math.max(1, query.limit ?? VEHICLE_DEFAULT_LIMIT));

    const where: Prisma.VehicleWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.vehicleType ? { vehicleType: query.vehicleType } : {}),
      // Lọc theo NĂNG LỰC: xe phục vụ được dịch vụ X — `has` trên mảng (GIN index).
      ...(query.serviceType ? { serviceTypes: { has: query.serviceType } } : {}),
      ...(query.operationStatus ? { operationStatus: query.operationStatus } : {}),
      ...(query.publicStatus ? { publicStatus: query.publicStatus } : {}),
      // `branchId` đứng SAU `tenantId` và không thay thế nó: bộ chọn chi nhánh chỉ thu hẹp phạm
      // vi, không bao giờ là đường vòng ra khỏi gian hàng của mình.
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.q ? { OR: searchOr(query.q) } : {}),
    };

    // Đếm và lấy trang trong một transaction: total khớp data cùng thời điểm.
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({
        where,
        orderBy: orderByOf(query.sort),
        skip: (page - 1) * limit,
        take: limit,
        select: LIST_SELECT,
      }),
    ]);

    return {
      data: rows.map(toListItem),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  async getOne(tenantId: string, id: string): Promise<VehicleDetailDto> {
    const row = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: DETAIL_SELECT,
    });
    if (!row) throw notFound();

    // Kèm lần gửi duyệt gần nhất + gallery ảnh + tiện ích.
    const [latest, images, features] = await Promise.all([
      this.prisma.approvalTask.findFirst({
        where: { targetType: APPROVAL_TARGET_TYPE.VEHICLE, targetId: id },
        orderBy: { submittedAt: 'desc' },
        select: { status: true, reason: true, submittedAt: true, reviewedAt: true },
      }),
      this.prisma.vehicleImage.findMany({
        where: { vehicleId: id },
        orderBy: { sortOrder: 'asc' },
        select: { imageUrl: true },
      }),
      this.prisma.vehicleFeature.findMany({
        where: { vehicleId: id },
        select: { featureKey: true },
      }),
    ]);
    const review: VehiclePublicReviewDto | null = latest
      ? {
          status: latest.status,
          reason: latest.reason,
          submittedAt: latest.submittedAt.toISOString(),
          reviewedAt: latest.reviewedAt?.toISOString() ?? null,
        }
      : null;

    return toDetail(
      row,
      review,
      images.map((i) => i.imageUrl),
      features.map((f) => f.featureKey),
    );
  }

  async create(tenantId: string, userId: string, dto: CreateVehicleDto): Promise<VehicleDetailDto> {
    // Quota gói (ADR 0010): chạm max_vehicles của gói hiện hành → PLAN_LIMIT_REACHED.
    await this.billing.assertVehicleQuota(tenantId);
    const id = newId();
    const code = dto.code?.trim() || `XP-${id.slice(-8).toUpperCase()}`;
    await this.assertCodeFree(tenantId, code);
    await this.catalog.assertVehicleValues(dto);
    assertVehicleClassification(dto.vehicleType, dto.fuelType, dto.bodyType);

    await this.prisma.$transaction(async (tx) => {
      // Chi nhánh kiểm TRONG transaction: nó phải thuộc đúng gian hàng và đang hoạt động ngay
      // tại thời điểm ghi. FK composite `(branch_id, tenant_id)` là chốt chặn cuối ở DB.
      const branch = await this.branches.assertAssignable(tx, tenantId, dto.branchId);
      await tx.vehicle.create({
        data: {
          id,
          tenantId,
          branchId: branch.id,
          createdBy: userId,
          code,
          name: dto.name,
          vehicleType: dto.vehicleType,
          ...writableFields(dto),
          // Giá chuyên biệt của dịch vụ không đăng bị loại ngay từ lúc tạo — không có giá mồ côi.
          ...orphanPriceClears(dto.serviceTypes ?? [SERVICE_TYPE.SELF_DRIVE]),
        },
      });
      await this.replaceMedia(tx, id, tenantId, dto);
    });
    return this.getOne(tenantId, id);
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateVehicleDto,
  ): Promise<VehicleDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.applyUpdate(tx, tenantId, id, userId, dto);
    });
    return this.getOne(tenantId, id);
  }

  /**
   * Lõi update TRONG transaction của caller (Wave 5.1) — để nghiệp vụ khác (áp biển số từ
   * OCR giấy tờ) chạy chung một transaction với phần của nó: fail ở đâu là rollback TẤT CẢ.
   * Giữ nguyên luật ADR 0008 (knockback + duyệt lại + đồng bộ listing) — không module nào
   * được chép lại luật này.
   */
  async applyUpdate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateVehicleDto,
  ): Promise<void> {
    const current = await tx.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: SENSITIVE_SELECT,
    });
    if (!current) throw notFound();
    await this.catalog.assertVehicleValues(dto);
    assertVehicleClassification(
      dto.vehicleType ?? current.vehicleType,
      dto.fuelType !== undefined ? dto.fuelType : current.fuelType,
      dto.bodyType !== undefined ? dto.bodyType : current.bodyType,
    );

    // Đổi mã thì mã mới phải còn trống trong gian hàng (unique DB là chốt chặn cuối).
    if (dto.code !== undefined && dto.code !== current.code) {
      await this.assertCodeFree(tenantId, dto.code, tx);
    }

    // ADR 0008: xe đang công khai mà sửa trường nhạy cảm (giá/biển số/loại/ảnh…) phải hạ về
    // chờ duyệt lại, không để thông tin đã đổi hiển thị ngoài chợ khi chưa qua kiểm duyệt.
    const knockBack =
      current.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC &&
      hasSensitiveChange(current, dto);

    // Chuyển xe sang chi nhánh khác = đổi VỊ TRÍ CÔNG KHAI của nó. Kiểm quyền sở hữu + trạng
    // thái ngay đây, và ghi audit riêng: "xe này chuyển từ đâu sang đâu" là câu hỏi có thật khi
    // đối soát, không suy được từ bản ghi sửa xe chung.
    const branchChanged = dto.branchId !== undefined && dto.branchId !== current.branchId;
    if (branchChanged) {
      await this.branches.assertAssignable(tx, tenantId, dto.branchId!);
    }

    const data: Prisma.VehicleUpdateInput = {
      ...(dto.code !== undefined ? { code: dto.code } : {}),
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.vehicleType !== undefined ? { vehicleType: dto.vehicleType } : {}),
      // `connect` theo khoá COMPOSITE `(id, tenant_id)` — cùng cặp mà FK dưới DB ràng buộc, nên
      // không có đường nào nối xe sang chi nhánh của gian hàng khác.
      ...(branchChanged
        ? { branch: { connect: { id_tenantId: { id: dto.branchId!, tenantId } } } }
        : {}),
      ...writableFields(dto),
      // Bỏ một dịch vụ → giá chuyên biệt của nó bị xoá theo (FE đã cảnh báo trước khi lưu).
      ...(dto.serviceTypes !== undefined ? orphanPriceClears(dto.serviceTypes) : {}),
      ...(knockBack ? { publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW } : {}),
    };

    const updated = await tx.vehicle.update({
      where: { id: current.id },
      data,
      select: DETAIL_SELECT,
    });
    await this.replaceMedia(tx, current.id, tenantId, dto);
    if (knockBack) {
      await this.createVehicleApprovalTask(tx, {
        vehicleId: current.id,
        tenantId,
        actorUserId: userId,
        fromStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        snapshot: updated,
        action: 'resubmit',
      });
    }
    // Mọi sửa xe → đồng bộ snapshot public_listings; nhạy cảm đổi → pending → listing ẩn (ADR 0008).
    await this.listings.syncFromVehicle(current.id, tx);

    if (branchChanged) {
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'vehicle.branch.reassign',
          targetType: 'vehicle',
          targetId: current.id,
          before: { branchId: current.branchId },
          after: { branchId: dto.branchId },
        },
        tx,
      );
    }
  }

  /** Giá & chính sách của một xe — nguồn hiệu lực + bản gian hàng để đối chiếu/đặt lại. */
  async getPricing(tenantId: string, id: string): Promise<VehiclePricingDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true,
        vehicleType: true,
        weekdayPrice: true,
        weekendPrice: true,
        hourlyPrice: true,
        monthlyPrice: true,
        withDriverDailyPrice: true,
        withDriverInterCityPrice: true,
        withDriverOneWayPrice: true,
        discountPercent: true,
        serviceTypes: true,
        publicStatus: true,
      },
    });
    if (!vehicle) throw notFound();

    const [effective, shopPolicy] = await Promise.all([
      this.pricing.effectivePolicy(tenantId, id),
      // Bản đối chiếu là mặc định THEO LOẠI XE của chính chiếc xe (17/08).
      this.pricing.shopPolicyValues(tenantId, vehicle.vehicleType),
    ]);

    return {
      source: effective?.source ?? null,
      policy: effective?.values ?? null,
      shopPolicy,
      weekdayPrice: vehicle.weekdayPrice ? vehicle.weekdayPrice.toFixed(0) : null,
      weekendPrice: vehicle.weekendPrice ? vehicle.weekendPrice.toFixed(0) : null,
      hourlyPrice: vehicle.hourlyPrice ? vehicle.hourlyPrice.toFixed(0) : null,
      monthlyPrice: vehicle.monthlyPrice ? vehicle.monthlyPrice.toFixed(0) : null,
      withDriverDailyPrice: vehicle.withDriverDailyPrice
        ? vehicle.withDriverDailyPrice.toFixed(0)
        : null,
      withDriverInterCityPrice: vehicle.withDriverInterCityPrice
        ? vehicle.withDriverInterCityPrice.toFixed(0)
        : null,
      withDriverOneWayPrice: vehicle.withDriverOneWayPrice
        ? vehicle.withDriverOneWayPrice.toFixed(0)
        : null,
      discountPercent: vehicle.discountPercent,
      serviceTypes: vehicle.serviceTypes,
      isPublic: vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
    };
  }

  /**
   * Lưu giá & chính sách theo xe trong MỘT transaction (Wave 2 — B2).
   *
   * VehiclesService là writer duy nhất của bản ghi đè (đi cùng quyền ghi xe): `source='vehicle'`
   * upsert override, `source='shop'` XOÁ override (đặt lại theo gian hàng — không copy row).
   * Đổi giá của xe đang công khai đi đúng đường knockback ADR 0008: hạ về chờ duyệt + tạo
   * phiếu duyệt lại + listing ẩn. Đơn thuê đã chốt không bị đụng tới (snapshot bất biến).
   */
  async savePricing(
    tenantId: string,
    id: string,
    userId: string,
    dto: SaveVehiclePricingDto,
  ): Promise<VehiclePricingDto> {
    const current = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: SENSITIVE_SELECT,
    });
    if (!current) throw notFound();

    const overriding = dto.source === POLICY_SOURCE.VEHICLE;
    if (overriding) {
      if (!dto.policy) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Ghi đè chính sách thì phải gửi kèm cấu hình chính sách',
        });
      }
      this.pricing.validatePolicy(dto.policy);
    }

    /*
     * Giá chuyên biệt chỉ được ĐẶT cho dịch vụ xe đang đăng — đặt giá tháng cho xe không có
     * "thuê dài hạn" là dữ liệu ẩn không đường nào dùng tới (validation chéo 17/08; xoá giá
     * bằng null thì luôn hợp lệ).
     */
    if (dto.monthlyPrice != null && !current.serviceTypes.includes(SERVICE_TYPE.LONG_TERM)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Xe không đăng dịch vụ thuê dài hạn — bổ sung dịch vụ trước khi đặt giá tháng',
      });
    }
    const driverPriceSet =
      dto.withDriverDailyPrice != null ||
      dto.withDriverInterCityPrice != null ||
      dto.withDriverOneWayPrice != null;
    if (driverPriceSet && !current.serviceTypes.includes(SERVICE_TYPE.WITH_DRIVER)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Xe không đăng dịch vụ có tài xế — bổ sung dịch vụ trước khi đặt giá có tài xế',
      });
    }

    // Giá chỉ sửa được ở chế độ ghi đè (chế độ kế thừa là read-only theo thiết kế).
    const priceDto: UpdateVehicleDto = overriding
      ? {
          ...(dto.weekdayPrice !== undefined ? { weekdayPrice: dto.weekdayPrice } : {}),
          ...(dto.weekendPrice !== undefined ? { weekendPrice: dto.weekendPrice } : {}),
          ...(dto.hourlyPrice !== undefined ? { hourlyPrice: dto.hourlyPrice } : {}),
          ...(dto.monthlyPrice !== undefined ? { monthlyPrice: dto.monthlyPrice } : {}),
          ...(dto.withDriverDailyPrice !== undefined
            ? { withDriverDailyPrice: dto.withDriverDailyPrice }
            : {}),
          ...(dto.withDriverInterCityPrice !== undefined
            ? { withDriverInterCityPrice: dto.withDriverInterCityPrice }
            : {}),
          ...(dto.withDriverOneWayPrice !== undefined
            ? { withDriverOneWayPrice: dto.withDriverOneWayPrice }
            : {}),
          ...(dto.discountPercent !== undefined ? { discountPercent: dto.discountPercent } : {}),
        }
      : {};
    const priceChanged = hasSensitiveChange(current, priceDto);
    const knockBack =
      current.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC && priceChanged;

    await this.prisma.$transaction(async (tx) => {
      const existingOverride = await tx.rentalPolicy.findUnique({
        where: { vehicleId: id },
        select: { id: true },
      });

      if (overriding) {
        const data = policyData(dto.policy!);
        if (existingOverride) {
          await tx.rentalPolicy.update({ where: { id: existingOverride.id }, data });
        } else {
          await tx.rentalPolicy.create({ data: { id: newId(), tenantId, vehicleId: id, ...data } });
        }
      } else if (existingOverride) {
        await tx.rentalPolicy.delete({ where: { id: existingOverride.id } });
      }

      if (Object.keys(priceDto).length > 0) {
        const updated = await tx.vehicle.update({
          where: { id: current.id },
          data: {
            ...writableFields(priceDto),
            ...(knockBack ? { publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW } : {}),
          },
          select: DETAIL_SELECT,
        });
        if (knockBack) {
          await this.createVehicleApprovalTask(tx, {
            vehicleId: current.id,
            tenantId,
            actorUserId: userId,
            fromStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
            snapshot: updated,
            action: 'resubmit',
          });
        }
        // Giá đổi (kể cả không knockback) → đồng bộ snapshot public_listings (ADR 0008).
        await this.listings.syncFromVehicle(current.id, tx);
      }

      // Thay đổi nhạy cảm về tiền → audit đủ before/after để đối soát.
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'vehicle.pricing.update',
          targetType: 'vehicle',
          targetId: id,
          before: {
            source: existingOverride ? POLICY_SOURCE.VEHICLE : POLICY_SOURCE.SHOP,
            weekdayPrice: current.weekdayPrice ? String(current.weekdayPrice) : null,
            weekendPrice: current.weekendPrice ? String(current.weekendPrice) : null,
            hourlyPrice: current.hourlyPrice ? String(current.hourlyPrice) : null,
            monthlyPrice: current.monthlyPrice ? String(current.monthlyPrice) : null,
            withDriverDailyPrice: current.withDriverDailyPrice
              ? String(current.withDriverDailyPrice)
              : null,
            withDriverInterCityPrice: current.withDriverInterCityPrice
              ? String(current.withDriverInterCityPrice)
              : null,
            withDriverOneWayPrice: current.withDriverOneWayPrice
              ? String(current.withDriverOneWayPrice)
              : null,
            discountPercent: current.discountPercent,
          },
          after: {
            source: dto.source,
            ...(dto.weekdayPrice !== undefined ? { weekdayPrice: dto.weekdayPrice } : {}),
            ...(dto.weekendPrice !== undefined ? { weekendPrice: dto.weekendPrice } : {}),
            ...(dto.hourlyPrice !== undefined ? { hourlyPrice: dto.hourlyPrice } : {}),
            ...(dto.monthlyPrice !== undefined ? { monthlyPrice: dto.monthlyPrice } : {}),
            ...(dto.withDriverDailyPrice !== undefined
              ? { withDriverDailyPrice: dto.withDriverDailyPrice }
              : {}),
            ...(dto.withDriverInterCityPrice !== undefined
              ? { withDriverInterCityPrice: dto.withDriverInterCityPrice }
              : {}),
            ...(dto.withDriverOneWayPrice !== undefined
              ? { withDriverOneWayPrice: dto.withDriverOneWayPrice }
              : {}),
            ...(dto.discountPercent !== undefined ? { discountPercent: dto.discountPercent } : {}),
            policy: overriding ? (dto.policy as unknown as Prisma.InputJsonValue) : null,
            knockBack,
          },
        },
        tx,
      );
    });

    return this.getPricing(tenantId, id);
  }

  /**
   * Thay TOÀN BỘ ảnh gallery + tiện ích khi client gửi (undefined = không đụng). Chạy trong tx
   * của caller. Ảnh giữ thứ tự qua `sortOrder`; feature khử trùng trước khi ghi (unique DB chốt cuối).
   */
  private async replaceMedia(
    tx: Prisma.TransactionClient,
    vehicleId: string,
    tenantId: string,
    dto: CreateVehicleDto | UpdateVehicleDto,
  ): Promise<void> {
    if (dto.images !== undefined) {
      await tx.vehicleImage.deleteMany({ where: { vehicleId } });
      if (dto.images.length > 0) {
        await tx.vehicleImage.createMany({
          data: dto.images.map((imageUrl, index) => ({
            id: newId(),
            vehicleId,
            tenantId,
            imageUrl,
            sortOrder: index,
          })),
        });
      }
    }
    if (dto.features !== undefined) {
      await tx.vehicleFeature.deleteMany({ where: { vehicleId } });
      const unique = [...new Set(dto.features)];
      if (unique.length > 0) {
        await tx.vehicleFeature.createMany({
          data: unique.map((featureKey) => ({ id: newId(), vehicleId, featureKey })),
        });
      }
    }
  }

  /**
   * Gửi (lại) xe đi duyệt công khai. Chỉ cho phép khi xe đang draft/needs_revision/rejected/hidden
   * và gian hàng đang active; bắt buộc đủ giá + ảnh + biển số + mô tả. Tạo phiếu duyệt + log +
   * audit trong một transaction — client KHÔNG tự set `approved_public` (CLAUDE.md mục 5).
   */
  async submitForPublicReview(
    tenantId: string,
    id: string,
    userId: string,
  ): Promise<VehicleDetailDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: DETAIL_SELECT,
    });
    if (!vehicle) throw notFound();

    const status = vehicle.publicStatus as VehiclePublicStatus;
    if (!VEHICLE_PUBLIC_STATUS_SUBMITTABLE.includes(status)) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message:
          status === VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW
            ? 'Xe đang chờ duyệt công khai.'
            : 'Xe đã ở trạng thái công khai.',
      });
    }

    // Không có tỉnh hợp lệ thì marketplace không biết xếp xe vào đâu — và scope công khai sẽ
    // loại nó ra. Chặn ngay ở bước GỬI DUYỆT với thông báo chỉ đúng việc phải làm, thay vì để
    // xe được duyệt rồi không ai tìm thấy.
    if (!vehicle.branchId || !vehicle.branch?.province?.code) {
      throw new BadRequestException({
        code: API_ERROR_CODE.BRANCH_LOCATION_REQUIRED,
        message:
          'Chi nhánh của xe chưa có tỉnh/thành. Hãy bổ sung tỉnh cho chi nhánh trước khi đăng xe lên chợ.',
        details: { branchId: vehicle.branchId },
      });
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });
    if (tenant?.status !== TENANT_STATUS.ACTIVE) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Gian hàng phải được duyệt hoạt động trước khi đăng xe lên chợ.',
      });
    }

    const missing = missingPublicFields(vehicle);
    if (missing.length > 0) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: `Cần bổ sung trước khi gửi duyệt: ${missing.join(', ')}.`,
        details: { missing },
      });
    }

    const isResubmit = status !== VEHICLE_PUBLIC_STATUS.DRAFT;

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: { id },
        data: { publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW },
      });
      await this.createVehicleApprovalTask(tx, {
        vehicleId: id,
        tenantId,
        actorUserId: userId,
        fromStatus: status,
        snapshot: vehicle,
        action: isResubmit ? 'resubmit' : 'submit',
      });
      // Gửi lại duyệt: nếu xe từng công khai thì listing về ẩn cho tới khi duyệt lại (ADR 0008).
      await this.listings.syncFromVehicle(id, tx);
    });

    return this.getOne(tenantId, id);
  }

  /**
   * Tạo phiếu duyệt xe + approval_log + audit (dùng chung cho submit thủ công và knock-back
   * khi sửa trường nhạy cảm). Luôn chạy trong transaction của caller.
   */
  private async createVehicleApprovalTask(
    tx: Prisma.TransactionClient,
    args: {
      vehicleId: string;
      tenantId: string;
      actorUserId: string;
      fromStatus: VehiclePublicStatus;
      snapshot: VehicleRow;
      action: 'submit' | 'resubmit';
    },
  ): Promise<void> {
    const task = await tx.approvalTask.create({
      data: {
        id: newId(),
        tenantId: args.tenantId,
        targetType: APPROVAL_TARGET_TYPE.VEHICLE,
        targetId: args.vehicleId,
        status: APPROVAL_STATUS.PENDING,
        submittedBy: args.actorUserId,
        snapshot: vehicleSnapshot(args.snapshot) as Prisma.InputJsonValue,
      },
    });
    await tx.approvalLog.create({
      data: {
        id: newId(),
        approvalTaskId: task.id,
        action: args.action === 'resubmit' ? APPROVAL_ACTION.RESUBMIT : APPROVAL_ACTION.SUBMIT,
        fromStatus: args.fromStatus,
        toStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
        actorUserId: args.actorUserId,
      },
    });
    await this.audit.record(
      {
        tenantId: args.tenantId,
        actorUserId: args.actorUserId,
        actorScope: 'tenant',
        action: 'vehicle.submit_public',
        targetType: APPROVAL_TARGET_TYPE.VEHICLE,
        targetId: args.vehicleId,
        before: { publicStatus: args.fromStatus },
        after: { publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW },
      },
      tx,
    );
  }

  /**
   * Xoá mềm. Chặn nếu xe còn lịch hiện tại/tương lai — occupancies là nguồn sự thật của
   * "xe bận" (ADR 0006); xoá xe đang có đơn sẽ để lại lịch mồ côi.
   */
  async remove(tenantId: string, id: string): Promise<{ id: string }> {
    const current = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!current) throw notFound();

    const activeSchedule = await this.prisma.vehicleOccupancy.count({
      where: { vehicleId: id, tenantId, endAt: { gt: new Date() } },
    });
    if (activeSchedule > 0) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message:
          'Xe đang có lịch hiện tại hoặc sắp tới, không thể xoá. Hãy huỷ/kết thúc lịch trước.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.update({ where: { id: current.id }, data: { deletedAt: new Date() } });
      // Xoá mềm xe → listing archived, biến khỏi marketplace (ADR 0008 §2).
      await this.listings.syncFromVehicle(current.id, tx);
    });
    return { id: current.id };
  }

  private async assertCodeFree(
    tenantId: string,
    code: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const clash = await db.vehicle.findFirst({
      where: { tenantId, code, deletedAt: null },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: `Mã xe "${code}" đã tồn tại trong gian hàng`,
      });
    }
  }
}

function searchOr(q: string): Prisma.VehicleWhereInput[] {
  const contains = { contains: q, mode: 'insensitive' } as const;
  return [
    { name: contains },
    { code: contains },
    { plateNumber: contains },
    { brand: contains },
    { model: contains },
  ];
}

function orderByOf(sort: VehicleListQueryDto['sort']): Prisma.VehicleOrderByWithRelationInput {
  switch (sort) {
    case 'name_asc':
      return { name: 'asc' };
    case 'code_asc':
      return { code: 'asc' };
    case 'price_asc':
      return { weekdayPrice: 'asc' };
    case 'price_desc':
      return { weekdayPrice: 'desc' };
    default:
      return { createdAt: 'desc' };
  }
}

/** Các trường scalar tuỳ chọn — kiểu thuần nên assign được cho cả `create` lẫn `update`. */
interface VehicleWritableFields {
  serviceTypes?: string[];
  sourceType?: string;
  plateNumber?: string | null;
  brand?: string | null;
  model?: string | null;
  manufactureYear?: number | null;
  color?: string | null;
  seatCount?: number | null;
  fuelType?: string | null;
  bodyType?: string | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  curbWeightKg?: number | null;
  engineDisplacementCc?: number | null;
  horsepowerHp?: number | null;
  transmission?: string | null;
  fuelConsumptionCity?: number | null;
  fuelConsumptionHighway?: number | null;
  fuelConsumptionCombined?: number | null;
  operationStatus?: string;
  description?: string | null;
  mainImageUrl?: string | null;
  weekdayPrice?: string;
  weekendPrice?: string | null;
  hourlyPrice?: string | null;
  monthlyPrice?: string | null;
  withDriverDailyPrice?: string | null;
  withDriverInterCityPrice?: string | null;
  withDriverOneWayPrice?: string | null;
  deliveryEnabled?: boolean;
  noCollateral?: boolean;
  discountPercent?: number | null;
}

/**
 * Các trường tuỳ chọn cho phép ghi khi create/update — gom một chỗ để hai đường không lệch nhau.
 * KHÔNG gồm `code`/`name`/`vehicleType` (create bắt buộc) và tuyệt đối không `publicStatus`/`tenantId`.
 * Các trường nullable (bodyType/hourlyPrice/discountPercent) nhận null để XOÁ giá trị.
 */
function writableFields(dto: CreateVehicleDto | UpdateVehicleDto): VehicleWritableFields {
  return {
    // Canonicalize (dedupe + sort) TRƯỚC khi ghi — CHECK subset của DB không chặn trùng phần
    // tử, và thứ tự ổn định giữ cho so sánh nhạy cảm (hasSensitiveChange) không báo đổi oan.
    ...(dto.serviceTypes !== undefined
      ? { serviceTypes: [...new Set(dto.serviceTypes)].sort() }
      : {}),
    ...(dto.sourceType !== undefined ? { sourceType: dto.sourceType } : {}),
    ...(dto.plateNumber !== undefined ? { plateNumber: dto.plateNumber } : {}),
    ...(dto.brand !== undefined ? { brand: dto.brand } : {}),
    ...(dto.model !== undefined ? { model: dto.model } : {}),
    ...(dto.manufactureYear !== undefined ? { manufactureYear: dto.manufactureYear } : {}),
    ...(dto.color !== undefined ? { color: dto.color } : {}),
    ...(dto.seatCount !== undefined ? { seatCount: dto.seatCount } : {}),
    ...(dto.fuelType !== undefined ? { fuelType: dto.fuelType } : {}),
    ...(dto.bodyType !== undefined ? { bodyType: dto.bodyType } : {}),
    ...(dto.lengthMm !== undefined ? { lengthMm: dto.lengthMm } : {}),
    ...(dto.widthMm !== undefined ? { widthMm: dto.widthMm } : {}),
    ...(dto.heightMm !== undefined ? { heightMm: dto.heightMm } : {}),
    ...(dto.curbWeightKg !== undefined ? { curbWeightKg: dto.curbWeightKg } : {}),
    ...(dto.engineDisplacementCc !== undefined
      ? { engineDisplacementCc: dto.engineDisplacementCc }
      : {}),
    ...(dto.horsepowerHp !== undefined ? { horsepowerHp: dto.horsepowerHp } : {}),
    ...(dto.transmission !== undefined ? { transmission: dto.transmission } : {}),
    ...(dto.fuelConsumptionCity !== undefined
      ? { fuelConsumptionCity: dto.fuelConsumptionCity }
      : {}),
    ...(dto.fuelConsumptionHighway !== undefined
      ? { fuelConsumptionHighway: dto.fuelConsumptionHighway }
      : {}),
    ...(dto.fuelConsumptionCombined !== undefined
      ? { fuelConsumptionCombined: dto.fuelConsumptionCombined }
      : {}),
    ...(dto.operationStatus !== undefined ? { operationStatus: dto.operationStatus } : {}),
    ...(dto.description !== undefined ? { description: dto.description } : {}),
    ...(dto.mainImageUrl !== undefined ? { mainImageUrl: dto.mainImageUrl } : {}),
    ...(dto.weekdayPrice !== undefined ? { weekdayPrice: dto.weekdayPrice } : {}),
    ...(dto.weekendPrice !== undefined ? { weekendPrice: dto.weekendPrice } : {}),
    ...(dto.hourlyPrice !== undefined ? { hourlyPrice: dto.hourlyPrice } : {}),
    ...(dto.monthlyPrice !== undefined ? { monthlyPrice: dto.monthlyPrice } : {}),
    ...(dto.withDriverDailyPrice !== undefined
      ? { withDriverDailyPrice: dto.withDriverDailyPrice }
      : {}),
    ...(dto.withDriverInterCityPrice !== undefined
      ? { withDriverInterCityPrice: dto.withDriverInterCityPrice }
      : {}),
    ...(dto.withDriverOneWayPrice !== undefined
      ? { withDriverOneWayPrice: dto.withDriverOneWayPrice }
      : {}),
    ...(dto.deliveryEnabled !== undefined ? { deliveryEnabled: dto.deliveryEnabled } : {}),
    ...(dto.noCollateral !== undefined ? { noCollateral: dto.noCollateral } : {}),
    ...(dto.discountPercent !== undefined ? { discountPercent: dto.discountPercent } : {}),
  };
}

/**
 * serviceTypes đổi → giá chuyên biệt của dịch vụ KHÔNG CÒN ĐĂNG bị xoá theo (17/08): không giữ
 * giá ẩn/stale — bỏ "thuê dài hạn" thì giá tháng đi cùng, thêm lại dịch vụ thì nhập giá lại.
 * FE cảnh báo trước khi lưu; đây là lớp thực thi.
 */
function orphanPriceClears(serviceTypes: string[]): Partial<VehicleWritableFields> {
  return {
    ...(serviceTypes.includes(SERVICE_TYPE.LONG_TERM) ? {} : { monthlyPrice: null }),
    ...(serviceTypes.includes(SERVICE_TYPE.WITH_DRIVER)
      ? {}
      : {
          withDriverDailyPrice: null,
          withDriverInterCityPrice: null,
          withDriverOneWayPrice: null,
        }),
  };
}

function assertVehicleClassification(
  vehicleType: string,
  fuelType: string | null | undefined,
  bodyType: string | null | undefined,
): void {
  if (!isVehicleFuelTypeAllowed(vehicleType, fuelType)) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Nguồn năng lượng không phù hợp với loại phương tiện đã chọn',
    });
  }
  if (vehicleType !== VEHICLE_TYPE.CAR && bodyType != null) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Kiểu dáng thân xe chỉ áp dụng cho ô tô',
    });
  }
}

/** Decimal → string do ResponseInterceptor lo (ADR 0007); ở đây giữ nguyên kiểu. */
type VehicleRow = Prisma.VehicleGetPayload<{ select: typeof DETAIL_SELECT }>;

function toListItem(
  v: Prisma.VehicleGetPayload<{ select: typeof LIST_SELECT }>,
): VehicleListItemDto {
  return {
    id: v.id,
    code: v.code,
    name: v.name,
    branch: v.branch
      ? {
          id: v.branchId!,
          name: v.branch.name,
          provinceCode: v.branch.province?.code ?? null,
          provinceName: v.branch.province?.name ?? null,
        }
      : null,
    plateNumber: v.plateNumber,
    vehicleType: v.vehicleType,
    serviceTypes: v.serviceTypes,
    sourceType: v.sourceType,
    brand: v.brand,
    model: v.model,
    manufactureYear: v.manufactureYear,
    seatCount: v.seatCount,
    bodyType: v.bodyType,
    discountPercent: v.discountPercent,
    operationStatus: v.operationStatus,
    publicStatus: v.publicStatus,
    mainImageUrl: v.mainImageUrl,
    weekdayPrice: v.weekdayPrice as unknown as string | null,
    weekendPrice: v.weekendPrice as unknown as string | null,
    updatedAt: v.updatedAt as unknown as string,
  };
}

function toDetail(
  v: VehicleRow,
  latestPublicReview: VehiclePublicReviewDto | null = null,
  images: string[] = [],
  features: string[] = [],
): VehicleDetailDto {
  return {
    ...toListItem(v),
    color: v.color,
    fuelType: v.fuelType,
    lengthMm: v.lengthMm,
    widthMm: v.widthMm,
    heightMm: v.heightMm,
    curbWeightKg: v.curbWeightKg,
    engineDisplacementCc: v.engineDisplacementCc,
    horsepowerHp: v.horsepowerHp,
    transmission: v.transmission,
    fuelConsumptionCity: v.fuelConsumptionCity as unknown as string | null,
    fuelConsumptionHighway: v.fuelConsumptionHighway as unknown as string | null,
    fuelConsumptionCombined: v.fuelConsumptionCombined as unknown as string | null,
    hourlyPrice: v.hourlyPrice as unknown as string | null,
    monthlyPrice: v.monthlyPrice as unknown as string | null,
    withDriverDailyPrice: v.withDriverDailyPrice as unknown as string | null,
    withDriverInterCityPrice: v.withDriverInterCityPrice as unknown as string | null,
    withDriverOneWayPrice: v.withDriverOneWayPrice as unknown as string | null,
    deliveryEnabled: v.deliveryEnabled,
    noCollateral: v.noCollateral,
    description: v.description,
    createdAt: v.createdAt as unknown as string,
    images,
    features,
    latestPublicReview,
  };
}

type SensitiveRow = Prisma.VehicleGetPayload<{ select: typeof SENSITIVE_SELECT }>;

/**
 * Khoá so sánh trường nhạy cảm — MẢNG canonicalize (dedupe + sort + join) để đổi THỨ TỰ chọn
 * dịch vụ không bị tính là thay đổi. Công thức này có bản đối xứng ở FE
 * (`apps/web/features/vehicles/sensitive-changes.ts`) — sửa một bên phải sửa cả hai.
 */
function sensitiveKey(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) return [...new Set(value)].sort().join(',');
  return String(value);
}

/** Có trường nhạy cảm nào được sửa sang giá trị khác hiện tại không (ADR 0008). */
function hasSensitiveChange(current: SensitiveRow, dto: UpdateVehicleDto): boolean {
  return VEHICLE_PUBLIC_SENSITIVE_FIELDS.some((field) => {
    const next = dto[field];
    if (next === undefined) return false; // không đụng tới trường này
    return sensitiveKey(current[field]) !== sensitiveKey(next);
  });
}

/**
 * Điều kiện tối thiểu để xe được lên chợ; trả danh sách còn thiếu (rỗng = đủ).
 *
 * Giá kiểm THEO DỊCH VỤ xe đăng (17/08): đăng dịch vụ nào thì phải niêm yết giá chuyên biệt
 * của dịch vụ đó — không âm thầm lấy giá tự lái trưng như tổng giá có tài xế/dài hạn. Bản đối
 * xứng ở FE: `apps/web/features/vehicles/publication.ts` — sửa một bên phải sửa cả hai.
 */
function missingPublicFields(v: VehicleRow): string[] {
  const missing: string[] = [];
  if (v.serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE) && v.weekdayPrice == null) {
    missing.push('giá thuê tự lái (ngày thường)');
  }
  if (v.serviceTypes.includes(SERVICE_TYPE.LONG_TERM) && v.monthlyPrice == null) {
    missing.push('giá tháng thuê dài hạn');
  }
  if (v.serviceTypes.includes(SERVICE_TYPE.WITH_DRIVER) && v.withDriverDailyPrice == null) {
    missing.push('giá/ngày có tài xế');
  }
  if (!v.mainImageUrl) missing.push('ảnh đại diện');
  if (!v.plateNumber) missing.push('biển số');
  if (!v.description) missing.push('mô tả xe');
  return missing;
}

/** Ảnh chụp hồ sơ xe lúc gửi duyệt — reviewer thấy đúng thứ đã gửi (Decimal → string). */
function vehicleSnapshot(v: VehicleRow): Record<string, unknown> {
  return {
    name: v.name,
    code: v.code,
    plateNumber: v.plateNumber,
    vehicleType: v.vehicleType,
    // Key MỚI `serviceTypes` (mảng) — snapshot cũ trong approval_tasks còn key `serviceType`
    // (string, có thể 'both'); FE approvals đọc được cả hai shape.
    serviceTypes: v.serviceTypes,
    brand: v.brand,
    model: v.model,
    manufactureYear: v.manufactureYear,
    seatCount: v.seatCount,
    fuelType: v.fuelType,
    bodyType: v.bodyType,
    color: v.color,
    mainImageUrl: v.mainImageUrl,
    description: v.description,
    weekdayPrice: v.weekdayPrice == null ? null : String(v.weekdayPrice),
    weekendPrice: v.weekendPrice == null ? null : String(v.weekendPrice),
    hourlyPrice: v.hourlyPrice == null ? null : String(v.hourlyPrice),
    monthlyPrice: v.monthlyPrice == null ? null : String(v.monthlyPrice),
    withDriverDailyPrice: v.withDriverDailyPrice == null ? null : String(v.withDriverDailyPrice),
    withDriverInterCityPrice:
      v.withDriverInterCityPrice == null ? null : String(v.withDriverInterCityPrice),
    withDriverOneWayPrice: v.withDriverOneWayPrice == null ? null : String(v.withDriverOneWayPrice),
    deliveryEnabled: v.deliveryEnabled,
    noCollateral: v.noCollateral,
    discountPercent: v.discountPercent,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy xe',
  });
}
