import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation, newId, Prisma } from '@xeprime/prisma';
import {
  APPROVAL_ACTION,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  API_ERROR_CODE,
  BOOKING_STATUS,
  isPackageShopTrack,
  missingPackageShopListingRequirements,
  SHOP_ONBOARDING_STATE,
  POLICY_SOURCE,
  RECEIPT_TYPE,
  REVIEW_STATUS,
  SERVICE_TYPE,
  vehicleImageTypeOf,
  TENANT_STATUS,
  isVehicleFuelTypeAllowed,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_LOCKED_AFTER_APPROVAL_FIELDS,
  isMotorbikeCategory,
  isTransmissionAllowedFor,
  missingPublishRequirements,
  vehicleFeatureAppliesTo,
  vehicleFieldPolicy,
  type VehiclePublicationInput,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_SUBMITTABLE,
  type PaginationMeta,
  type VehiclePublicStatus,
  type VehicleType,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { BranchesService } from '../branches/branches.service';
import { CatalogModelService } from '../catalog/catalog-model.service';
import { CatalogService } from '../catalog/catalog.service';
import { policyData, PricingService } from '../pricing/pricing.service';
import { SaveVehiclePricingDto, VehiclePricingDto } from '../pricing/dto/pricing.dto';
import { ListingsService } from '../public-listings/listings.service';
import { businessWhere } from '../../common/finance-period';
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
  VehicleMediaItemDto,
  VehicleStatsDto,
  VehiclePublicReviewDto,
} from './dto/vehicle.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';

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
  motorbikeCategory: true,
  vehicleCatalogModelId: true,
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
  electricRangeKm: true,
  batteryCapacityKwh: true,
  electricConsumptionKwhPer100Km: true,
  hourlyPrice: true,
  monthlyPrice: true,
  withDriverDailyPrice: true,
  withDriverInterCityPrice: true,
  withDriverOneWayPrice: true,
  deliveryEnabled: true,
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
  transmission: true,
  manufactureYear: true,
  bodyType: true,
  motorbikeCategory: true,
  seatCount: true,
  serviceTypes: true,
  mainImageUrl: true,
  deliveryEnabled: true,
} satisfies Prisma.VehicleSelect;

/**
 * Unique index MỘT PHẦN "mỗi đối tượng chỉ có một phiếu CHỜ", đặt ở migration
 * `20260914180000_single_gate_vehicle_approval`.
 *
 * Tên nằm ở hằng chứ không viết thẳng vào chỗ bắt lỗi: đổi tên index ở migration mà quên chỗ kia
 * thì nhánh phục hồi ngừng chạy trong im lặng — và triệu chứng là 500 cho người bấm gửi duyệt
 * hai lần, một thứ không ai nghĩ tới khi đang đổi tên một index.
 */
const PENDING_APPROVAL_TASK_UQ = 'approval_tasks_pending_target_uq';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly listings: ListingsService,
    private readonly branches: BranchesService,
    private readonly billing: BillingService,
    private readonly catalog: CatalogService,
    private readonly catalogModels: CatalogModelService,
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

    const [bookingGroups, ratingGroups, receiptGroups] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['vehicleId', 'status'],
        where: {
          ...bookingScope,
          status: { in: [BOOKING_STATUS.ACTIVE, BOOKING_STATUS.COMPLETED] },
        },
        _count: { _all: true },
      }),
      // Điểm đánh giá của xe — cùng vị từ với thẻ chợ (`ratingsByVehicle`): review published.
      this.prisma.review.groupBy({
        by: ['vehicleId'],
        where: { tenantId, vehicleId: { in: ids }, status: REVIEW_STATUS.PUBLISHED },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      // Không có quyền tài chính thì KHÔNG chạy truy vấn — số liệu không được rời khỏi DB.
      canViewFinance
        ? this.prisma.receipt.groupBy({
            by: ['vehicleId', 'type'],
            // `businessWhere` mang sẵn "đã duyệt + chưa xoá + loại tiền giữ hộ" — cùng một vị từ
            // với `/finance/summary`, nên doanh thu một chiếc xe ở đây và doanh thu của kỳ ở
            // dashboard không thể trôi khỏi nhau. Trước đây chỗ này tự viết `source: notIn`, và
            // đó chính là bản thứ hai đã làm hai màn nói hai con số.
            where: { ...businessWhere(tenantId, undefined, undefined), vehicleId: { in: ids } },
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

      const rating = ratingGroups.find((g) => g.vehicleId === vehicleId);
      const stats: VehicleStatsDto = {
        vehicleId,
        activeBookings: bookingsOf(BOOKING_STATUS.ACTIVE),
        completedBookings: bookingsOf(BOOKING_STATUS.COMPLETED),
        ratingAvg:
          rating && rating._count._all > 0 && rating._avg.rating != null
            ? (Math.round(Number(rating._avg.rating) * 10) / 10).toFixed(1)
            : null,
        ratingCount: rating?._count._all ?? 0,
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
      stats: statsRow ?? {
        vehicleId: id,
        activeBookings: 0,
        completedBookings: 0,
        ratingAvg: null,
        ratingCount: 0,
      },
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
    const paging = resolvePaging(query, VEHICLE_DEFAULT_LIMIT, VEHICLE_MAX_LIMIT);

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
        skip: paging.skip,
        take: paging.take,
        select: LIST_SELECT,
      }),
    ]);

    const reviews = await this.latestPublicReviews(rows.map((row) => row.id));

    return {
      data: rows.map((row) => toListItem(row, reviews.get(row.id) ?? null)),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Lần gửi duyệt gần nhất của NHIỀU xe — một truy vấn cho cả trang, không phải một truy vấn/xe.
   *
   * `distinct` + `orderBy [targetId, submittedAt desc]` cho ra `DISTINCT ON (target_id) … ORDER BY
   * target_id, submitted_at DESC` ở Postgres: đúng "phiếu mới nhất mỗi xe", và index
   * `(target_type, target_id)` phục vụ được nó.
   *
   * Thứ tự hai khoá trong `orderBy` là bắt buộc, không phải tuỳ chọn: `DISTINCT ON` đòi biểu
   * thức distinct đứng đầu `ORDER BY`, và đảo lại thì Postgres từ chối câu lệnh.
   */
  private async latestPublicReviews(
    vehicleIds: string[],
  ): Promise<Map<string, VehiclePublicReviewDto>> {
    if (vehicleIds.length === 0) return new Map();
    const rows = await this.prisma.approvalTask.findMany({
      where: { targetType: APPROVAL_TARGET_TYPE.VEHICLE, targetId: { in: vehicleIds } },
      distinct: ['targetId'],
      orderBy: [{ targetId: 'asc' }, { submittedAt: 'desc' }],
      select: {
        targetId: true,
        status: true,
        reason: true,
        submittedAt: true,
        reviewedAt: true,
      },
    });
    return new Map(rows.map((row) => [row.targetId, toPublicReview(row)]));
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
        select: { imageUrl: true, imageType: true, sortOrder: true },
      }),
      this.prisma.vehicleFeature.findMany({
        where: { vehicleId: id },
        select: { featureKey: true },
      }),
    ]);
    const review: VehiclePublicReviewDto | null = latest ? toPublicReview(latest) : null;

    return toDetail(
      row,
      review,
      images.map((i) => ({
        url: i.imageUrl,
        // Ảnh cũ chưa gán loại → `other` khi ĐỌC; DB giữ nguyên tới khi chủ xe bấm lưu.
        type: vehicleImageTypeOf(i.imageType),
        sortOrder: i.sortOrder,
      })),
      features.map((f) => f.featureKey),
    );
  }

  async create(tenantId: string, userId: string, dto: CreateVehicleDto): Promise<VehicleDetailDto> {
    // Hạn mức CHỖ theo loại xe (ADR 0015 điều 7, điểm chặn 1): chạm số chỗ đã mua → PLAN_LIMIT_REACHED.
    await this.billing.assertVehicleQuota(tenantId, dto.vehicleType as VehicleType);
    const id = newId();
    const code = dto.code?.trim() || `XP-${id.slice(-8).toUpperCase()}`;
    await this.assertCodeFree(tenantId, code);
    /*
     * Cặp (hãng, mẫu) do SERVER quyết, không phải client.
     *
     * Client gửi `vehicleCatalogModelId`; backend đọc mẫu trong danh mục rồi tự chép nhãn hãng
     * và tên mẫu xuống. Vì thế không tồn tại đường nào tạo ra một chiếc `motorbike` mang
     * `brand='toyota'`, `model='Vios'` — cặp đó không còn là thứ client nói ra được.
     */
    const canonical = await this.catalogModels.resolveForVehicle(
      dto.vehicleCatalogModelId,
      dto.vehicleType,
    );
    const input = applyCatalogModel(dto, canonical);

    await this.catalog.assertVehicleValues({ ...input, vehicleType: dto.vehicleType });
    assertVehicleProfile(dto.vehicleType, input.fuelType, input);

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
          ...writableFields(input),
          // Giá chuyên biệt của dịch vụ không đăng bị loại ngay từ lúc tạo — không có giá mồ côi.
          ...orphanPriceClears(dto.serviceTypes ?? [SERVICE_TYPE.SELF_DRIVE]),
          // Trường không có nghĩa với loại xe này bị dọn ngay từ lúc tạo, không đợi tới lần sửa
          // đầu tiên: một chiếc xe máy "4 chỗ" ra tới chợ là đã sai rồi.
          ...clearIncompatibleProfileFields(
            { vehicleType: dto.vehicleType, fuelType: null, transmission: null },
            {
              vehicleType: dto.vehicleType,
              fuelType: input.fuelType ?? null,
              transmission: input.transmission ?? null,
            },
          ),
        },
      });
      await this.replaceMedia(tx, id, tenantId, input, dto.vehicleType);
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
    const vehicleType = dto.vehicleType ?? current.vehicleType;
    // Chỉ tra lại danh mục khi lệnh ghi ĐỘNG tới mẫu xe — sửa giá không phải là lý do để đi
    // một round-trip vào bảng danh mục.
    const canonical =
      dto.vehicleCatalogModelId !== undefined
        ? await this.catalogModels.resolveForVehicle(dto.vehicleCatalogModelId, vehicleType)
        : null;
    const input = dto.vehicleCatalogModelId !== undefined ? applyCatalogModel(dto, canonical) : dto;

    await this.catalog.assertVehicleValues({ ...input, vehicleType });
    assertVehicleProfile(
      vehicleType,
      input.fuelType !== undefined ? input.fuelType : current.fuelType,
      // Chỉ phần request tự khai. Giá trị giữ lại từ bản ghi cũ do `clearFieldsNotInProfile` dọn.
      {
        ...(input.bodyType !== undefined ? { bodyType: input.bodyType } : {}),
        ...(input.motorbikeCategory !== undefined
          ? { motorbikeCategory: input.motorbikeCategory }
          : {}),
        ...(input.seatCount !== undefined ? { seatCount: input.seatCount } : {}),
      },
    );

    // Đổi mã thì mã mới phải còn trống trong gian hàng (unique DB là chốt chặn cuối).
    if (dto.code !== undefined && dto.code !== current.code) {
      await this.assertCodeFree(tenantId, dto.code, tx);
    }

    /*
     * 09/09/2026 (ghi đè ADR 0008): xe ĐÃ DUYỆT thì căn cước của nó bị KHOÁ — biển số, loại xe,
     * hộp số, nhiên liệu, năm sản xuất. Sửa những trường đó là biến listing đã kiểm duyệt thành
     * một chiếc xe khác, nên server từ chối thẳng thay vì âm thầm hạ xe về chờ duyệt lại.
     *
     * Mọi trường còn lại — kể cả GIÁ và ảnh — sửa tự do và hiệu lực ngay ngoài chợ.
     */
    assertNoLockedFieldChange(current, dto);

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
      ...writableFields(input),
      // Bỏ một dịch vụ → giá chuyên biệt của nó bị xoá theo (FE đã cảnh báo trước khi lưu).
      ...(dto.serviceTypes !== undefined ? orphanPriceClears(dto.serviceTypes) : {}),
      // Đổi loại xe/nguồn năng lượng → dọn mọi trường không còn nghĩa (server không tin form đã ẩn).
      ...clearIncompatibleProfileFields(current, input),
    };

    await tx.vehicle.update({ where: { id: current.id }, data });
    await this.replaceMedia(tx, current.id, tenantId, input, vehicleType);
    // Mọi sửa xe → đồng bộ snapshot public_listings ngay, để chợ không trưng thông tin cũ.
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

    /*
     * GIÁ và CHÍNH SÁCH là hai trục độc lập (20/08). Trước đây `source` điều khiển cả hai, nên
     * muốn đặt giá riêng cho một chiếc xe là buộc phải ghi đè TOÀN BỘ chính sách gian hàng —
     * và bản ghi đè đó là một BẢN SAO đóng băng, khiến xe âm thầm ngừng nhận mọi thay đổi cọc/
     * giao nhận/ưu đãi về sau. Giá vốn nằm trên `vehicles`, không nằm trên `rental_policies`,
     * nên nó luôn ghi được; `source` từ đây chỉ còn quyết định hàng chính sách của xe.
     */
    const priceDto: UpdateVehicleDto = {
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
    };

    /*
     * Cờ `vehicles.delivery_enabled` (chip tiện ích trên thẻ) đi THEO chính sách hiệu lực sau lần
     * lưu này (08/09/2026): ghi đè thì theo bộ chính sách riêng, đặt lại thì theo mặc định gian
     * hàng. Không có lần lưu nào để hai nguồn lệch nhau nữa. `null` = gian hàng chưa có chính
     * sách ⇒ giữ nguyên cờ.
     */
    const deliverySync = overriding
      ? dto.policy!.deliveryEnabled
      : ((await this.pricing.shopPolicyValues(tenantId, current.vehicleType))?.deliveryEnabled ??
        null);

    await this.prisma.$transaction(async (tx) => {
      const existingOverride = await tx.rentalPolicy.findUnique({
        where: { vehicleId: id },
        select: { id: true },
      });

      let policyChanged = false;
      if (overriding) {
        const data = policyData(dto.policy!);
        if (existingOverride) {
          await tx.rentalPolicy.update({ where: { id: existingOverride.id }, data });
        } else {
          await tx.rentalPolicy.create({ data: { id: newId(), tenantId, vehicleId: id, ...data } });
        }
        policyChanged = true;
      } else if (existingOverride) {
        await tx.rentalPolicy.delete({ where: { id: existingOverride.id } });
        policyChanged = true;
      }

      const vehicleData: Prisma.VehicleUpdateInput = {
        // Giá đổi là hiệu lực NGAY ngoài chợ (09/09/2026) — không hạ xe về chờ duyệt lại nữa.
        ...writableFields(priceDto),
        ...(deliverySync != null && deliverySync !== current.deliveryEnabled
          ? { deliveryEnabled: deliverySync }
          : {}),
      };
      if (Object.keys(vehicleData).length > 0) {
        await tx.vehicle.update({ where: { id: current.id }, data: vehicleData });
      }

      /*
       * Đồng bộ snapshot (ADR 0008) khi giá đổi HOẶC chính sách của xe đổi — nhãn "Miễn thế
       * chấp" trên sàn nay suy từ chính sách hiệu lực, nên bật/tắt ghi đè cũng làm nó đổi dù
       * không đụng đồng nào tiền giá. Chạy sau nhánh giá để đọc được giá vừa ghi.
       */
      if (Object.keys(vehicleData).length > 0 || policyChanged) {
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
    vehicleType: string,
  ): Promise<void> {
    /*
     * Hai hình thái đầu vào, MỘT bảng (08/09/2026):
     *  - `media` (màn thư viện theo ô): URL + loại, thứ tự mảng = sortOrder; URL trùng bị khử để
     *    không lưu một file hai lần.
     *  - `images` (client cũ, app native): chỉ URL. Loại đã gán của URL còn giữ lại được BẢO TOÀN
     *    — một lần lưu từ form cũ không được xoá sạch vị trí ảnh chủ xe đã sắp ở màn mới.
     */
    const media =
      dto.media !== undefined
        ? dedupeByUrl(dto.media.map((m) => ({ url: m.url.trim(), type: m.type ?? null })))
        : dto.images !== undefined
          ? await this.preserveImageTypes(tx, vehicleId, dto.images)
          : null;
    if (media) {
      await tx.vehicleImage.deleteMany({ where: { vehicleId } });
      if (media.length > 0) {
        await tx.vehicleImage.createMany({
          data: media.map((item, index) => ({
            id: newId(),
            vehicleId,
            tenantId,
            imageUrl: item.url,
            imageType: item.type,
            sortOrder: index,
          })),
        });
      }
    }
    if (dto.features !== undefined) {
      const unique = [...new Set(dto.features)];
      // Tiện ích phải dùng được cho LOẠI XE này. Danh mục đã chặn "không tồn tại"; đây chặn
      // "tồn tại nhưng không dành cho nó" — ẩn ở form mà không chặn ở đây thì client cũ vẫn ghi.
      assertFeaturesForVehicleType(vehicleType, unique);
      await tx.vehicleFeature.deleteMany({ where: { vehicleId } });
      if (unique.length > 0) {
        await tx.vehicleFeature.createMany({
          data: unique.map((featureKey) => ({ id: newId(), vehicleId, featureKey })),
        });
      }
    }
  }

  /** Loại ảnh hiện có theo URL — để `images: string[]` cũ không xoá mất vị trí đã gán. */
  private async preserveImageTypes(
    tx: Prisma.TransactionClient,
    vehicleId: string,
    urls: string[],
  ): Promise<Array<{ url: string; type: string | null }>> {
    const existing = await tx.vehicleImage.findMany({
      where: { vehicleId },
      select: { imageUrl: true, imageType: true },
    });
    const typeOf = new Map(existing.map((i) => [i.imageUrl, i.imageType]));
    return dedupeByUrl(
      urls
        .map((u) => u.trim())
        .filter(Boolean)
        .map((url) => ({ url, type: typeOf.get(url) ?? null })),
    );
  }

  /**
   * Gửi (lại) xe đi duyệt công khai — **cổng kiểm duyệt DUY NHẤT của tuyến hoa hồng** (ADR 0036).
   *
   * Năm cổng, theo thứ tự rẻ-trước-đắt-sau:
   *
   *  1. **Trạng thái xe** cho phép gửi (draft/needs_revision/rejected/hidden).
   *  2. **Gian hàng không bị khoá.** Chú ý: đây KHÔNG phải "gian hàng đã được duyệt". Tenant mở
   *     ra là `active` ngay (ADR 0036), nên cổng này chỉ còn bắt đúng trường hợp nền tảng đã
   *     khoá gian hàng — và lúc đó xe không được lên chợ là đúng.
   *  3. **Hồ sơ xe đủ điều kiện** — `missingPublishRequirements` ở `@xeprime/types`, CÙNG hàm mà
   *     checklist của web chạy, nên không còn cảnh checklist xanh hết mà server từ chối.
   *  4. **Mặt tiền GIAN HÀNG đủ điều kiện** — CHỈ với tuyến gói (ADR 0040), xem
   *     `assertPackageShopReadyToList`.
   *  5. **Hạn mức chỗ** của gói (ADR 0015 điều 7).
   *
   * Tạo phiếu duyệt + log + audit trong một transaction — client KHÔNG tự set `approved_public`
   * (CLAUDE.md mục 5).
   *
   * **Bấm lại / tải lại trang / lỗi mạng không đẻ ra phiếu thứ hai.** Hai lớp: trạng thái xe
   * chuyển sang `pending_public_review` nên lần gọi sau rơi vào cổng 1, và — với hai request
   * chạy song song vượt qua cổng đó cùng lúc — unique index một phần
   * `approval_tasks_pending_target_uq` ở DB chặn nốt. Đó là kỷ luật "chống trùng bằng constraint
   * DB, không bằng check ở tầng app" của CLAUDE.md mục 6.
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
      /*
       * "Đang chờ duyệt" là kết quả người dùng MUỐN, chỉ là đã đạt từ lần bấm trước — trả về
       * trạng thái hiện tại thay vì một lỗi đỏ. Đây chính là đường đi của việc bấm hai lần, mở
       * hai tab, hay bấm lại sau khi mạng chập ở lần đầu.
       */
      if (status === VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW) return this.getOne(tenantId, id);
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Xe đã ở trạng thái công khai.',
      });
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });
    if (tenant?.status !== TENANT_STATUS.ACTIVE) {
      throw new ConflictException({
        code: API_ERROR_CODE.SHOP_NOT_ACTIVE,
        message: 'Gian hàng đang bị khoá nên chưa đăng xe lên chợ được.',
        details: { status: tenant?.status ?? null },
      });
    }

    const imageCount = await countDistinctImages(this.prisma, vehicle.id, vehicle.mainImageUrl);
    const missing = missingPublishRequirements(publicationInput(vehicle), imageCount);
    if (missing.length > 0) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VEHICLE_PUBLISH_INCOMPLETE,
        message: 'Xe còn thiếu thông tin bắt buộc nên chưa gửi duyệt được.',
        // MÃ, không phải câu tiếng Việt — web dựng nhãn theo ngôn ngữ đang dùng (ADR 0012).
        details: { missing },
      });
    }

    /*
     * Cổng MẶT TIỀN GIAN HÀNG — chỉ tuyến gói (ADR 0040). Đứng TRƯỚC hạn mức chỗ vì nó không
     * tốn truy vấn nào ngoài một lượt đọc hồ sơ + chi nhánh, còn `assertVehicleQuota` phải đếm
     * xe. Cũng đứng SAU cổng hồ sơ xe: một chiếc xe thiếu ảnh thì thiếu ảnh, và nói về logo gian
     * hàng lúc đó là trả lời câu người dùng chưa hỏi.
     */
    await this.assertPackageShopReadyToList(tenantId);

    // Điểm chặn THỨ HAI của hạn mức chỗ (ADR 0015 điều 7 — "cái răng thật"): hết chỗ trên chợ
    // thì không đưa thêm xe lên, kể cả xe đã tạo từ trước khi gói thu nhỏ. Đếm xe đang chiếm
    // suất (chờ duyệt + đang công khai), trừ chính chiếc này để gửi-lại-duyệt không tự chặn mình.
    await this.billing.assertVehicleQuota(tenantId, vehicle.vehicleType as VehicleType, {
      scope: 'marketplace',
      excludeVehicleId: id,
    });

    const isResubmit = status !== VEHICLE_PUBLIC_STATUS.DRAFT;

    try {
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
    } catch (error) {
      /*
       * Thua cuộc đua với một request song song của CHÍNH thao tác này: phiếu kia đã tồn tại và
       * xe đã ở hàng đợi, tức là kết quả người dùng muốn đã có. Trả trạng thái hiện tại.
       *
       * Chỉ nuốt ĐÚNG vi phạm unique của phiếu chờ — mọi lỗi khác vẫn nổi lên. `isUniqueViolation`
       * ở `@xeprime/prisma` vì nhận diện nó KHÔNG hiển nhiên ở Prisma 7; xem docblock của nó.
       */
      if (isUniqueViolation(error, PENDING_APPROVAL_TASK_UQ)) return this.getOne(tenantId, id);
      throw error;
    }

    return this.getOne(tenantId, id);
  }

  /**
   * MẶT TIỀN GIAN HÀNG đã đủ để bán chưa — cổng CHỈ áp với tuyến gói (ADR 0040).
   *
   * ## Vì sao chỉ tuyến gói
   *
   * Gian hàng trả phí bán bằng THƯƠNG HIỆU: khách thấy logo trong kết quả tìm kiếm, gọi vào số
   * của gian hàng, đến đúng địa chỉ chi nhánh. Một gian hàng lên chợ mà không có logo là một ô
   * trống giữa các đối thủ có logo — và chính họ mất tiền vì điều đó.
   *
   * Chủ xe tuyến hoa hồng thì KHÔNG bị cổng này chạm tới, và đó là điều quan trọng nhất ở đây:
   * một người có một chiếc xe không có logo gian hàng và không cần có. Bắt họ thiết kế một cái
   * là dựng lại đúng rào cản mà ADR 0036 vừa gỡ khỏi phễu chủ xe.
   *
   * `isPackageShopTrack` tính cả `package_pending` là CÓ: họ đã chọn cửa gian hàng, nên luật của
   * gian hàng áp cho họ ngay. (Trên thực tế họ không tới được đây — `SubscriptionTrackGuard` và
   * routing giữ họ ở màn thanh toán — nhưng cổng không dựa vào điều đó.)
   *
   * ## Nguồn dữ liệu, và vì sao KHÔNG đọc `tenant_profiles` cho phần địa chỉ
   *
   * Bốn cột địa chỉ trên `tenant_profiles` là BẢN SAO của chi nhánh mặc định
   * (`BranchesService.syncProfileFromDefaultBranch`). Chấm theo bản sao là chấm nhầm nguồn:
   * `public_listings` lấy vị trí xe từ chi nhánh, nên một hồ sơ có tỉnh trong khi chi nhánh thì
   * không sẽ cho ra một xe lên chợ mà không ai biết nó ở đâu.
   *
   * Trong luồng bình thường bước "tạo gian hàng" đã đòi đủ năm mục không-phải-logo, nên mục
   * thường còn thiếu ở đây là ĐÚNG MỘT: logo. Cổng vẫn chấm cả sáu — hồ sơ sửa được sau đó, và
   * một gian hàng xoá trắng tên rồi đăng xe là thứ không được lọt.
   *
   * ## Hợp đồng lỗi
   *
   * Mã RIÊNG `SHOP_LISTING_REQUIREMENTS_MISSING`, KHÔNG dùng chung `PROFILE_INCOMPLETE` với cổng
   * xác minh: hai bộ quy tắc có hai từ vựng khác nhau mà `displayName`/`province` lại trùng tên,
   * nên một client chỉ nhìn `details.missing` không phân biệt được chúng — và sẽ dựng nhãn của bộ
   * này cho mã của bộ kia.
   *
   * `details.missing` là danh sách MÃ (`PACKAGE_SHOP_LISTING_REQUIREMENT`), không phải câu tiếng
   * Việt — web dựng nhãn theo ngôn ngữ đang dùng (ADR 0012). Ném TRƯỚC transaction nên xe KHÔNG
   * chuyển sang `pending` và KHÔNG có phiếu duyệt nào được tạo.
   */
  private async assertPackageShopReadyToList(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        onboardingState: true,
        profile: { select: { displayName: true, logoUrl: true } },
        branches: {
          where: { isDefault: true, deletedAt: null },
          select: { phone: true, provinceCode: true, wardCode: true, addressLine: true },
          take: 1,
        },
      },
    });

    /*
     * Hỏi TUYẾN THU PHÍ chỉ khi trục đăng ký chưa trả lời được.
     *
     * `package_pending`/`package_active` đã là câu trả lời cuối; chỉ CỬA HOA HỒNG còn mơ hồ (một
     * chủ xe hoa hồng mua gói vẫn là gian hàng tuyến gói — xem `isPackageShopTrack`). Gọi
     * `effectiveBillingFor` vô điều kiện nghĩa là mọi lượt gửi xe của mọi gian hàng đều trả tiền
     * cho một lượt đọc `tenant_subscriptions` mà phần lớn trường hợp không cần tới.
     */
    const billingMode =
      tenant.onboardingState === SHOP_ONBOARDING_STATE.COMMISSION
        ? (await this.billing.effectiveBillingFor(tenantId)).billingMode
        : null;

    if (!isPackageShopTrack({ onboardingState: tenant.onboardingState, billingMode })) return;

    const branch = tenant.branches[0];
    const missing = missingPackageShopListingRequirements({
      displayName: tenant.profile?.displayName,
      contactPhone: branch?.phone,
      provinceCode: branch?.provinceCode,
      wardCode: branch?.wardCode,
      addressLine: branch?.addressLine,
      logoUrl: tenant.profile?.logoUrl,
    });
    if (missing.length === 0) return;

    throw new ConflictException({
      code: API_ERROR_CODE.SHOP_LISTING_REQUIREMENTS_MISSING,
      message: 'Hồ sơ gian hàng còn thiếu thông tin bắt buộc nên chưa gửi xe duyệt được.',
      details: { missing },
    });
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
    /*
     * Thư viện ảnh đọc trong CÙNG transaction với phiếu: chụp ở đây thay vì bắt hai nơi gọi tự
     * truyền vào, để đường knock-back (sửa trường nhạy cảm khi xe đang công khai) cũng có ảnh —
     * nó không hề chạy qua `countDistinctImages`.
     */
    const gallery = await tx.vehicleImage.findMany({
      where: { vehicleId: args.vehicleId },
      orderBy: { sortOrder: 'asc' },
      select: { imageUrl: true },
    });
    const imageUrls = [
      ...new Set(
        [args.snapshot.mainImageUrl, ...gallery.map((image) => image.imageUrl)].filter(
          (url): url is string => Boolean(url),
        ),
      ),
    ];

    const task = await tx.approvalTask.create({
      data: {
        id: newId(),
        tenantId: args.tenantId,
        targetType: APPROVAL_TARGET_TYPE.VEHICLE,
        targetId: args.vehicleId,
        status: APPROVAL_STATUS.PENDING,
        submittedBy: args.actorUserId,
        snapshot: vehicleSnapshot(args.snapshot, imageUrls) as Prisma.InputJsonValue,
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

/** Payload ghi được của cả create lẫn update — `applyCatalogModel` nhận và trả lại đúng kiểu vào. */
type VehicleWritableInput = CreateVehicleDto | UpdateVehicleDto;

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
  /** @xeprime/types → MotorbikeCategory — chỉ xe máy. */
  motorbikeCategory?: string | null;
  /** Liên kết mẫu xe chuẩn; null = xe khai tay. */
  vehicleCatalogModelId?: string | null;
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
  electricRangeKm?: number | null;
  batteryCapacityKwh?: number | null;
  electricConsumptionKwhPer100Km?: number | null;
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
    ...(dto.motorbikeCategory !== undefined ? { motorbikeCategory: dto.motorbikeCategory } : {}),
    ...(dto.vehicleCatalogModelId !== undefined
      ? { vehicleCatalogModelId: dto.vehicleCatalogModelId }
      : {}),
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
    ...(dto.electricRangeKm !== undefined ? { electricRangeKm: dto.electricRangeKm } : {}),
    ...(dto.batteryCapacityKwh !== undefined ? { batteryCapacityKwh: dto.batteryCapacityKwh } : {}),
    ...(dto.electricConsumptionKwhPer100Km !== undefined
      ? { electricConsumptionKwhPer100Km: dto.electricConsumptionKwhPer100Km }
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

/**
 * Chép cặp (hãng, mẫu) CANONICAL từ danh mục đè lên payload của client.
 *
 * Đây là chỗ luật "client không tự đặt hãng/mẫu" thành hiện thực. Không gắn mẫu (`null`) thì
 * xoá luôn liên kết cũ nhưng GIỮ chữ mà chủ xe đã gõ: xe khai tay vẫn phải hiển thị được tên
 * của nó, chỉ mất khả năng lọc theo mẫu chuẩn.
 */
function applyCatalogModel<T extends VehicleWritableInput>(
  dto: T,
  canonical: { id: string; brand: string; model: string; motorbikeCategory: string | null } | null,
): T {
  if (!canonical) return { ...dto, vehicleCatalogModelId: null };
  return {
    ...dto,
    vehicleCatalogModelId: canonical.id,
    brand: canonical.brand,
    model: canonical.model,
    // Phân khúc từ danh mục là mặc định, KHÔNG phải áp đặt: chủ xe vẫn tự chọn được (mẫu trong
    // danh mục có thể chưa gắn phân khúc, hoặc chiếc xe đã độ khác đi).
    motorbikeCategory: dto.motorbikeCategory ?? canonical.motorbikeCategory,
  };
}

/**
 * Ma trận hồ sơ xe ở đường GHI — cùng `vehicleFieldPolicy` mà form dùng để ẩn ô.
 *
 * Chỉ xét những gì REQUEST NÓI RA, không xét giá trị được giữ lại từ bản ghi cũ.
 *
 * Đó là quy ước sẵn có của module này ("client gửi metric SAI LOẠI: server dọn, không lưu số vô
 * nghĩa"): một chiếc ô tô xăng đổi sang chạy điện thì hộp số "tự động" cũ không còn nghĩa —
 * server DỌN nó, chứ không từ chối cả lệnh sửa mà người dùng chỉ đổi mỗi nguồn năng lượng. Từ
 * chối những giá trị người dùng không hề gửi cũng chính là cách một client cũ (app native chưa
 * cập nhật bộ mã hộp số mới) bị khoá cứng khỏi mọi thao tác sửa xe.
 *
 * Cái BỊ TỪ CHỐI là mâu thuẫn do request tự khai: nguồn năng lượng không có ở loại xe đó, hay
 * gửi thẳng một chiều phân loại của loại xe khác. `clearFieldsNotInProfile` lo phần còn lại,
 * và DB giữ vế cuối bằng CHECK.
 */
function assertVehicleProfile(
  vehicleType: string,
  /** Nguồn năng lượng SAU lệnh ghi — luật của mọi trường khác phụ thuộc nó. */
  fuelType: string | null | undefined,
  /** Chỉ những trường request THỰC SỰ gửi (`undefined` = không gửi). */
  sent: {
    bodyType?: string | null;
    motorbikeCategory?: string | null;
    seatCount?: number | null;
  },
): void {
  const fail = (message: string): never => {
    throw new BadRequestException({ code: API_ERROR_CODE.VALIDATION_FAILED, message });
  };

  if (!isVehicleFuelTypeAllowed(vehicleType, fuelType)) {
    fail('Nguồn năng lượng không phù hợp với loại phương tiện đã chọn');
  }
  if (sent.motorbikeCategory != null && !isMotorbikeCategory(sent.motorbikeCategory)) {
    fail('Phân khúc xe máy không hợp lệ');
  }

  const policy = vehicleFieldPolicy(vehicleType, fuelType);
  if (policy.bodyType === 'hidden' && sent.bodyType != null) {
    fail('Kiểu dáng thân xe chỉ áp dụng cho ô tô');
  }
  if (policy.motorbikeCategory === 'hidden' && sent.motorbikeCategory != null) {
    fail('Phân khúc xe máy chỉ áp dụng cho xe máy');
  }
}

/**
 * Tiện nghi gửi lên phải DÙNG ĐƯỢC cho loại xe này.
 *
 * Danh mục đã chặn "không tồn tại"; đây chặn "tồn tại nhưng không dành cho nó" — ô tô gắn "kèm
 * mũ bảo hiểm", xe máy gắn "lốp dự phòng". Cùng bảng `VEHICLE_FEATURE_VEHICLE_TYPES` mà form
 * dùng để ẩn, nên hai bên không thể nói khác nhau.
 */
function assertFeaturesForVehicleType(vehicleType: string, features: readonly string[]): void {
  const wrong = features.filter((key) => !vehicleFeatureAppliesTo(key, vehicleType));
  if (wrong.length > 0) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: `Tiện ích không dùng được cho loại xe này: ${wrong.join(', ')}`,
    });
  }
}

/** Decimal → string do ResponseInterceptor lo (ADR 0007); ở đây giữ nguyên kiểu. */
type VehicleRow = Prisma.VehicleGetPayload<{ select: typeof DETAIL_SELECT }>;

/** Dòng `approval_tasks` → tóm tắt lần duyệt (Date → ISO). Dùng cho cả danh sách lẫn chi tiết. */
function toPublicReview(task: {
  status: string;
  reason: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
}): VehiclePublicReviewDto {
  return {
    status: task.status,
    reason: task.reason,
    submittedAt: task.submittedAt.toISOString(),
    reviewedAt: task.reviewedAt?.toISOString() ?? null,
  };
}

function toListItem(
  v: Prisma.VehicleGetPayload<{ select: typeof LIST_SELECT }>,
  latestPublicReview: VehiclePublicReviewDto | null = null,
): VehicleListItemDto {
  return {
    latestPublicReview,
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
    motorbikeCategory: v.motorbikeCategory,
    vehicleCatalogModelId: v.vehicleCatalogModelId,
    discountPercent: v.discountPercent,
    operationStatus: v.operationStatus,
    publicStatus: v.publicStatus,
    mainImageUrl: v.mainImageUrl,
    weekdayPrice: v.weekdayPrice as unknown as string | null,
    weekendPrice: v.weekendPrice as unknown as string | null,
    updatedAt: v.updatedAt as unknown as string,
  };
}

/** Giữ lần xuất hiện ĐẦU của mỗi URL — thứ tự người dùng sắp không đổi. */
function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function toDetail(
  v: VehicleRow,
  latestPublicReview: VehiclePublicReviewDto | null = null,
  media: VehicleMediaItemDto[] = [],
  features: string[] = [],
): VehicleDetailDto {
  return {
    ...toListItem(v, latestPublicReview),
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
    electricRangeKm: v.electricRangeKm,
    batteryCapacityKwh: v.batteryCapacityKwh as unknown as string | null,
    electricConsumptionKwhPer100Km: v.electricConsumptionKwhPer100Km as unknown as string | null,
    hourlyPrice: v.hourlyPrice as unknown as string | null,
    monthlyPrice: v.monthlyPrice as unknown as string | null,
    withDriverDailyPrice: v.withDriverDailyPrice as unknown as string | null,
    withDriverInterCityPrice: v.withDriverInterCityPrice as unknown as string | null,
    withDriverOneWayPrice: v.withDriverOneWayPrice as unknown as string | null,
    deliveryEnabled: v.deliveryEnabled,
    description: v.description,
    createdAt: v.createdAt as unknown as string,
    images: media.map((m) => m.url),
    media,
    features,
  };
}

type SensitiveRow = Prisma.VehicleGetPayload<{ select: typeof SENSITIVE_SELECT }>;

/** Khoá so sánh — `null` và chuỗi rỗng là một, để "chưa khai" không bị tính là đổi. */
function fieldKey(value: unknown): string | null {
  if (value == null || value === '') return null;
  return String(value);
}

/**
 * Chặn sửa CĂN CƯỚC của một chiếc xe đang công khai (09/09/2026).
 *
 * Trả về danh sách trường vi phạm trong `details.fields` để FE chỉ đúng ô bị khoá; xe chưa
 * duyệt (nháp, chờ duyệt, đã gỡ) thì sửa thoải mái.
 */
function assertNoLockedFieldChange(current: SensitiveRow, dto: UpdateVehicleDto): void {
  if (current.publicStatus !== VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC) return;
  const locked = VEHICLE_LOCKED_AFTER_APPROVAL_FIELDS.filter((field) => {
    const next = dto[field];
    if (next === undefined) return false; // không đụng tới trường này
    return fieldKey(current[field]) !== fieldKey(next);
  });
  if (locked.length === 0) return;
  throw new ConflictException({
    code: API_ERROR_CODE.VEHICLE_FIELD_LOCKED,
    message:
      'Xe đang hiển thị trên chợ nên không đổi được biển số, loại xe, hộp số, nhiên liệu hay năm sản xuất. Gỡ xe khỏi chợ trước nếu cần sửa.',
    details: { fields: locked },
  });
}

/**
 * Xoá các thông số KHÔNG CÒN NGHĨA sau khi đổi loại xe / nguồn năng lượng.
 *
 * Backend không tin việc form đã ẩn ô: một client cũ (hoặc app native chưa cập nhật) vẫn gửi
 * được `fuelConsumptionCombined` cho xe điện, và để lại con số đó nghĩa là trang xe công khai
 * khoe "7.5 L/100km" trên một chiếc xe chạy pin.
 *
 * Chỉ xoá khi lệnh ghi thật sự ĐỘNG tới loại xe hoặc nguồn năng lượng — sửa mô tả không được
 * âm thầm dọn thông số của xe.
 */
function clearIncompatibleProfileFields(
  current: { vehicleType: string; fuelType: string | null; transmission: string | null },
  dto: { vehicleType?: string; fuelType?: string | null; transmission?: string | null },
): Partial<VehicleWritableFields> {
  if (dto.vehicleType === undefined && dto.fuelType === undefined) return {};
  const vehicleType = dto.vehicleType ?? current.vehicleType;
  const fuelType = dto.fuelType !== undefined ? dto.fuelType : current.fuelType;

  /*
   * Hộp số GIỮ LẠI mà không còn hợp lệ thì bỏ.
   *
   * Ô tô xăng "số tự động" đổi sang chạy điện: xe điện truyền động một cấp, nên giữ nguyên chữ
   * "số tự động" là mô tả sai chiếc xe cho người sắp thuê nó. Ma trận không đánh `hidden` cho
   * hộp số ở xe điện (nó vẫn hỏi được), nên phần dọn này phải xét GIÁ TRỊ chứ không chỉ xét ô.
   */
  const transmission = dto.transmission !== undefined ? dto.transmission : current.transmission;
  const staleTransmission = !isTransmissionAllowedFor(vehicleType, fuelType, transmission);

  return {
    ...clearFieldsNotInProfile(vehicleType, fuelType),
    ...(staleTransmission ? { transmission: null } : {}),
  };
}

/**
 * Dọn mọi ô `hidden` theo ma trận hồ sơ xe.
 *
 * Một chiếc ô tô đổi thành xe máy phải mất số chỗ và kiểu dáng, y như nó mất lít/100km khi đổi
 * sang chạy điện — cả hai là cùng một luật, nên chỉ có một hàm.
 *
 * NHƯNG "ẩn vì chưa biết" khác "ẩn vì không áp dụng". Chưa chọn nguồn năng lượng thì ma trận trả
 * `hidden` cho toàn bộ thông số năng lượng — đơn giản vì câu hỏi chưa được trả lời. Xoá dựa trên
 * đó là xoá chính con số người dùng vừa gõ (một chiếc xe khai 6.5 L/100km mà chưa kịp chọn "Xăng"
 * sẽ mất luôn số đó). Nên khi `fuelType` còn trống, chỉ dọn phần mà LOẠI XE một mình đã quyết
 * được: số chỗ, kiểu dáng, phân khúc.
 */
function clearFieldsNotInProfile(
  vehicleType: string,
  fuelType: string | null,
): Partial<VehicleWritableFields> {
  const policy = vehicleFieldPolicy(vehicleType, fuelType);
  const fuelKnown = Boolean(fuelType);
  const hidden = (field: keyof typeof policy) => policy[field] === 'hidden';
  const hiddenByFuel = (field: keyof typeof policy) => fuelKnown && hidden(field);
  return {
    ...(hiddenByFuel('fuelConsumption')
      ? { fuelConsumptionCity: null, fuelConsumptionHighway: null, fuelConsumptionCombined: null }
      : {}),
    ...(hiddenByFuel('electricRangeKm') ? { electricRangeKm: null } : {}),
    ...(hiddenByFuel('batteryCapacityKwh') ? { batteryCapacityKwh: null } : {}),
    ...(hiddenByFuel('electricConsumption') ? { electricConsumptionKwhPer100Km: null } : {}),
    ...(hiddenByFuel('engineDisplacementCc') ? { engineDisplacementCc: null } : {}),
    ...(hiddenByFuel('transmission') ? { transmission: null } : {}),
    ...(hidden('seatCount') ? { seatCount: null } : {}),
    ...(hidden('bodyType') ? { bodyType: null } : {}),
    ...(hidden('motorbikeCategory') ? { motorbikeCategory: null } : {}),
  };
}

/**
 * Dòng `vehicles` → lát cắt mà luật lên chợ dùng chung cần (`@xeprime/types`).
 *
 * Luật sống ở `packages/types/src/vehicle-publication.ts` chứ không ở đây, vì checklist của web
 * chạy CÙNG hàm đó. Bản cũ ở file này trả về các câu tiếng Việt và tự ghi trong docblock rằng
 * "sửa một bên phải sửa cả hai" — hai bản sao của một cổng chặn là hẹn ngày chúng lệch nhau, và
 * lúc đó chủ xe thấy checklist xanh hết còn server vẫn trả 400.
 *
 * `branchProvinceCode` là lý do hàm adapter này tồn tại: nó nằm sau hai quan hệ
 * (`vehicle → branch → province`), và luật dùng chung không biết gì về bảng nào.
 */
function publicationInput(v: VehicleRow): VehiclePublicationInput {
  return {
    vehicleType: v.vehicleType,
    serviceTypes: v.serviceTypes,
    weekdayPrice: v.weekdayPrice,
    monthlyPrice: v.monthlyPrice,
    withDriverDailyPrice: v.withDriverDailyPrice,
    mainImageUrl: v.mainImageUrl,
    plateNumber: v.plateNumber,
    brand: v.brand,
    model: v.model,
    manufactureYear: v.manufactureYear,
    fuelType: v.fuelType,
    transmission: v.transmission,
    seatCount: v.seatCount,
    motorbikeCategory: v.motorbikeCategory,
    // `Decimal(6,2)` ở DB nhưng `VehiclePublicationInput` nhận `number` — mức tiêu thụ không phải
    // TIỀN nên `number` là đúng (ADR 0007 chỉ buộc tiền đi dạng chuỗi); chỉ cần chuyển tường minh.
    fuelConsumptionCombined:
      v.fuelConsumptionCombined == null ? null : Number(v.fuelConsumptionCombined),
    engineDisplacementCc: v.engineDisplacementCc,
    electricRangeKm: v.electricRangeKm,
    branchProvinceCode: v.branchId ? (v.branch?.province?.code ?? null) : null,
  };
}

/**
 * Số ảnh THẬT của một chiếc xe: ảnh đại diện ∪ thư viện, khử trùng theo URL.
 *
 * Đếm hai nguồn riêng rồi cộng lại sẽ tính đôi tấm ảnh vừa làm đại diện vừa nằm trong thư viện —
 * và checklist báo "đủ 4" trong khi khách chỉ thấy 3 tấm khác nhau.
 */
async function countDistinctImages(
  db: Prisma.TransactionClient | PrismaService,
  vehicleId: string,
  mainImageUrl: string | null,
): Promise<number> {
  const rows = await db.vehicleImage.findMany({
    where: { vehicleId },
    select: { imageUrl: true },
  });
  const urls = new Set(rows.map((row) => row.imageUrl));
  if (mainImageUrl) urls.add(mainImageUrl);
  return urls.size;
}

/**
 * Ảnh chụp hồ sơ xe lúc gửi duyệt — reviewer thấy đúng thứ đã gửi (Decimal → string).
 *
 * `images` và `branchName`/`provinceName` là hai thứ bổ sung 14/09/2026, và chúng không phải
 * trang trí: cổng gửi duyệt bắt buộc **≥4 ảnh** và **chi nhánh phải có tỉnh**, nhưng snapshot cũ
 * chỉ mang `mainImageUrl` — nghĩa là reviewer phải duyệt một chiếc xe lên chợ khi chỉ nhìn được
 * một tấm ảnh và không biết nó nằm ở tỉnh nào. Không thể duyệt đúng thứ mình không thấy.
 *
 * Snapshot là jsonb ĐÓNG BĂNG, không migrate: phiếu cũ thiếu ba key này và màn duyệt chỉ hiện
 * key có mặt, nên thêm vào đây là an toàn với mọi phiếu đã tồn tại.
 */
function vehicleSnapshot(v: VehicleRow, imageUrls: string[]): Record<string, unknown> {
  return {
    images: imageUrls,
    branchName: v.branch?.name ?? null,
    provinceName: v.branch?.province?.name ?? null,
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
    discountPercent: v.discountPercent,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy xe',
  });
}
