import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUTO_ACCEPT_BLOCKER,
  AUTO_ACCEPT_DEFAULT_MAX_LEAD_MINUTES,
  AUTO_ACCEPT_DEFAULT_MIN_LEAD_MINUTES,
  BOOKING_STATUS_OCCUPYING,
  CUSTOMER_DOCUMENT_TYPE,
  DRIVER_DEPOSIT_MODE,
  DRIVER_DEPOSIT_MODE_SUPPORTED,
  DRIVER_STATUS,
  DRIVER_SURCHARGE_KIND_SPEC,
  DRIVER_SURCHARGE_KIND_VALUES,
  DRIVER_SURCHARGE_THRESHOLD_KIND,
  FEATURE_STATE,
  HANDOVER_WINDOW_KIND,
  HANDOVER_WINDOW_MAX_MINUTE,
  IDENTITY_VERIFY_METHOD,
  PLAN_FEATURE,
  SERVICE_TYPE,
  effectiveRequiredDocuments,
  handoverTimeToMinute,
  hasVehicleServiceSettings,
  isDriverDepositModeSupported,
  isWithinHandoverWindows,
  minuteToHandoverTime,
  requiredIdentityDocuments,
  type AutoAcceptBlocker,
  type CustomerDocumentType,
  type DriverDepositMode,
  type DriverSurchargeKind,
  type DriverSurchargeRuleSnapshot,
  type FeatureState,
  type HandoverWindow,
  type HandoverWindowKind,
  type PlanFeature,
  type RentalTermsSnapshot,
  type ServiceType,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OccupancyService } from '../calendar/occupancy.service';
import {
  DriverSurchargeRuleDto,
  HandoverWindowDto,
  PatchVehicleServiceSettingDto,
  SaveDriverSurchargeRulesDto,
  SaveVehicleOperationSettingsDto,
  VehicleOperationSettingsDto,
  VehicleServiceSettingDto,
  WithDriverAutoAcceptCapabilityDto,
} from './dto/vehicle-settings.dto';

type Db = Prisma.TransactionClient | PrismaService;

/** Giá trị HIỆU LỰC của thiết lập một dịch vụ — luôn đủ trường, kể cả khi chưa có dòng nào. */
export interface EffectiveServiceSetting {
  serviceType: ServiceType;
  autoAcceptEnabled: boolean;
  autoAcceptMinLeadMinutes: number;
  autoAcceptMaxLeadMinutes: number;
  minRentalMinutes: number | null;
  preferredRouteTypes: string[];
  requiredDocuments: string[];
  effectiveRequiredDocuments: CustomerDocumentType[];
  identityVerifyMethod: string;
  termsText: string | null;
  requireTermsAcceptance: boolean;
  depositMode: DriverDepositMode;
  updatedAt: Date | null;
}

export interface HandoverWindows {
  pickup: HandoverWindow[];
  return: HandoverWindow[];
}

/** Dữ kiện của MỘT yêu cầu để hỏi "có tự nhận được không" — hàm thuần, không đụng DB. */
export interface AutoAcceptInput {
  serviceType: string;
  pickupAt: Date | null;
  returnAt: Date | null;
  /** Thời điểm hỏi — mặc định bây giờ; truyền vào để test tất định. */
  now?: Date;
  quoteIsEstimate: boolean;
  /** Tuyến hoa hồng sẽ sinh khoản giữ chỗ thay vì tạo đơn ngay. */
  holdRequired: boolean;
  /** Khách đã tích đồng ý điều khoản (chỉ có nghĩa khi chủ xe bắt buộc). */
  termsAccepted: boolean;
}

const SERVICE_SELECT = {
  serviceType: true,
  autoAcceptEnabled: true,
  autoAcceptMinLeadMinutes: true,
  autoAcceptMaxLeadMinutes: true,
  minRentalMinutes: true,
  preferredRouteTypes: true,
  requiredDocuments: true,
  identityVerifyMethod: true,
  termsText: true,
  requireTermsAcceptance: true,
  depositMode: true,
  updatedAt: true,
} satisfies Prisma.VehicleServiceSettingSelect;

const MS_PER_MINUTE = 60_000;

/**
 * Thiết lập vận hành theo xe (08/09/2026) — writer DUY NHẤT của bốn bảng
 * `vehicle_operation_settings` · `vehicle_handover_windows` · `vehicle_service_settings` ·
 * `vehicle_driver_surcharge_rules`, và là nơi DUY NHẤT trả lời ba câu hỏi nghiệp vụ mà các
 * module khác cần:
 *
 *   - `turnaroundBufferFor` — bao nhiêu phút chết phải cộng vào occupancy MỚI (ADR 0006);
 *   - `assertHandoverWindows` / `assertServiceConstraints` — yêu cầu của khách có hợp lệ với
 *     khung giờ / thời lượng / điều khoản chủ xe đặt không;
 *   - `evaluateAutoAccept` — yêu cầu này có được hệ thống tự nhận không (thuần, không DB).
 *
 * Module này là LÁ: chỉ phụ thuộc Prisma, Audit và OccupancyService (đọc lịch bận cho preview).
 * Bookings/Holds/BookingRequests/PublicListings đều import được nó mà không tạo vòng.
 */
@Injectable()
export class VehicleSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly occupancy: OccupancyService,
  ) {}

  // ── Thời gian chết + khung giờ ───────────────────────────────────────────

  async getOperation(tenantId: string, vehicleId: string): Promise<VehicleOperationSettingsDto> {
    await this.assertOwned(this.prisma, tenantId, vehicleId);
    const [setting, windows] = await Promise.all([
      this.prisma.vehicleOperationSetting.findUnique({
        where: { vehicleId },
        select: { turnaroundBufferMinutes: true, updatedAt: true },
      }),
      this.handoverWindowsFor(this.prisma, vehicleId),
    ]);
    return {
      turnaroundBufferMinutes: setting?.turnaroundBufferMinutes ?? 0,
      pickupWindows: windows.pickup,
      returnWindows: windows.return,
      updatedAt: setting?.updatedAt.toISOString() ?? null,
    };
  }

  /**
   * Thay toàn bộ ba phần trong MỘT transaction. Khung giờ ghi lại từ đầu (xoá + tạo) — bảng chỉ
   * có vài dòng mỗi xe và EXCLUDE của DB vẫn là người gác cuối cho hai request đua nhau.
   *
   * Occupancy đã có KHÔNG bị tính lại: thời gian chết mới chỉ áp cho lịch giữ sau thời điểm này
   * hoặc lịch được dời (ADR 0006 — không âm thầm sửa lịch sử). Giao diện nói rõ điều này.
   */
  async saveOperation(
    tenantId: string,
    vehicleId: string,
    userId: string,
    dto: SaveVehicleOperationSettingsDto,
  ): Promise<VehicleOperationSettingsDto> {
    await this.assertOwned(this.prisma, tenantId, vehicleId);
    const pickup = normalizeWindows(dto.pickupWindows);
    const returns = normalizeWindows(dto.returnWindows);
    const before = await this.getOperation(tenantId, vehicleId);

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleOperationSetting.upsert({
        where: { vehicleId },
        create: {
          id: newId(),
          tenantId,
          vehicleId,
          turnaroundBufferMinutes: dto.turnaroundBufferMinutes,
          updatedBy: userId,
        },
        update: { turnaroundBufferMinutes: dto.turnaroundBufferMinutes, updatedBy: userId },
      });
      await tx.vehicleHandoverWindow.deleteMany({ where: { vehicleId, tenantId } });
      const rows = [
        ...pickup.map((w) => ({ kind: HANDOVER_WINDOW_KIND.PICKUP, ...w })),
        ...returns.map((w) => ({ kind: HANDOVER_WINDOW_KIND.RETURN, ...w })),
      ];
      if (rows.length > 0) {
        await tx.vehicleHandoverWindow.createMany({
          data: rows.map((w) => ({
            id: newId(),
            tenantId,
            vehicleId,
            kind: w.kind,
            startMinute: w.startMinute,
            endMinute: w.endMinute,
          })),
        });
      }
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'vehicle.operation_settings.update',
          targetType: 'vehicle',
          targetId: vehicleId,
          before: {
            turnaroundBufferMinutes: before.turnaroundBufferMinutes,
            pickupWindows: before.pickupWindows,
            returnWindows: before.returnWindows,
          },
          after: {
            turnaroundBufferMinutes: dto.turnaroundBufferMinutes,
            pickupWindows: pickup.map(toWindowDto),
            returnWindows: returns.map(toWindowDto),
          },
        },
        tx,
      );
    });

    return this.getOperation(tenantId, vehicleId);
  }

  /** Phút chết áp cho occupancy MỚI của xe — 0 khi chưa cấu hình (không âm thầm áp 1–2 giờ). */
  async turnaroundBufferFor(db: Db, vehicleId: string): Promise<number> {
    const row = await db.vehicleOperationSetting.findUnique({
      where: { vehicleId },
      select: { turnaroundBufferMinutes: true },
    });
    return row?.turnaroundBufferMinutes ?? 0;
  }

  async handoverWindowsFor(db: Db, vehicleId: string): Promise<HandoverWindows> {
    const rows = await db.vehicleHandoverWindow.findMany({
      where: { vehicleId },
      orderBy: [{ kind: 'asc' }, { startMinute: 'asc' }],
      select: { kind: true, startMinute: true, endMinute: true },
    });
    const of = (kind: HandoverWindowKind) =>
      rows
        .filter((r) => r.kind === kind)
        .map((r) => ({ start: minuteToHandoverTime(r.startMinute), end: minuteToHandoverTime(r.endMinute) }));
    return { pickup: of(HANDOVER_WINDOW_KIND.PICKUP), return: of(HANDOVER_WINDOW_KIND.RETURN) };
  }

  /**
   * Giờ nhận/trả phải rơi vào khung giờ chủ xe đặt — kiểm ở SERVER khi khách gửi yêu cầu và khi
   * gian hàng chốt giờ nhận dài hạn. `returnAt = null` (dài hạn) chỉ kiểm giờ nhận.
   */
  async assertHandoverWindows(
    db: Db,
    vehicleId: string,
    pickupAt: Date,
    returnAt: Date | null,
  ): Promise<void> {
    const windows = await this.handoverWindowsFor(db, vehicleId);
    const blocker = handoverBlocker(windows, pickupAt, returnAt);
    if (blocker) {
      throw new BadRequestException({
        code: API_ERROR_CODE.HANDOVER_WINDOW_VIOLATION,
        message:
          blocker === 'pickup'
            ? 'Giờ nhận xe nằm ngoài khung giờ giao xe của chủ xe'
            : 'Giờ trả xe nằm ngoài khung giờ nhận lại xe của chủ xe',
        details: { kind: blocker, pickupWindows: windows.pickup, returnWindows: windows.return },
      });
    }
  }

  // ── Thiết lập theo dịch vụ ───────────────────────────────────────────────

  async listServiceSettings(
    tenantId: string,
    vehicleId: string,
    features: Readonly<Record<PlanFeature, FeatureState>>,
  ): Promise<VehicleServiceSettingDto[]> {
    await this.assertOwned(this.prisma, tenantId, vehicleId);
    const [selfDrive, withDriver, capability] = await Promise.all([
      this.serviceSettingFor(this.prisma, vehicleId, SERVICE_TYPE.SELF_DRIVE),
      this.serviceSettingFor(this.prisma, vehicleId, SERVICE_TYPE.WITH_DRIVER),
      this.withDriverCapability(tenantId, features),
    ]);
    return [toServiceDto(selfDrive, null), toServiceDto(withDriver, capability)];
  }

  async patchServiceSetting(
    tenantId: string,
    vehicleId: string,
    serviceType: string,
    userId: string,
    dto: PatchVehicleServiceSettingDto,
    features: Readonly<Record<PlanFeature, FeatureState>>,
  ): Promise<VehicleServiceSettingDto> {
    if (!hasVehicleServiceSettings(serviceType)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Chỉ dịch vụ tự lái và có tài xế có thiết lập riêng — thuê dài hạn luôn do gian hàng chốt lịch',
      });
    }
    await this.assertOwned(this.prisma, tenantId, vehicleId);
    const current = await this.serviceSettingFor(this.prisma, vehicleId, serviceType as ServiceType);

    const next: EffectiveServiceSetting = {
      ...current,
      ...(dto.autoAcceptEnabled !== undefined ? { autoAcceptEnabled: dto.autoAcceptEnabled } : {}),
      ...(dto.autoAcceptMinLeadMinutes !== undefined
        ? { autoAcceptMinLeadMinutes: dto.autoAcceptMinLeadMinutes }
        : {}),
      ...(dto.autoAcceptMaxLeadMinutes !== undefined
        ? { autoAcceptMaxLeadMinutes: dto.autoAcceptMaxLeadMinutes }
        : {}),
      ...(dto.minRentalMinutes !== undefined ? { minRentalMinutes: dto.minRentalMinutes } : {}),
      ...(dto.preferredRouteTypes !== undefined ? { preferredRouteTypes: dto.preferredRouteTypes } : {}),
      ...(dto.requiredDocuments !== undefined ? { requiredDocuments: dto.requiredDocuments } : {}),
      ...(dto.identityVerifyMethod !== undefined ? { identityVerifyMethod: dto.identityVerifyMethod } : {}),
      ...(dto.termsText !== undefined ? { termsText: dto.termsText?.trim() || null } : {}),
      ...(dto.requireTermsAcceptance !== undefined
        ? { requireTermsAcceptance: dto.requireTermsAcceptance }
        : {}),
      ...(dto.depositMode !== undefined ? { depositMode: dto.depositMode as DriverDepositMode } : {}),
    };

    // Ràng buộc chéo — class-validator không mô tả được quan hệ giữa trường.
    if (next.autoAcceptMinLeadMinutes > next.autoAcceptMaxLeadMinutes) {
      throw invalid('Mức đặt trước tối thiểu không được lớn hơn mức tối đa');
    }
    if (serviceType === SERVICE_TYPE.SELF_DRIVE) {
      // Trường riêng của có tài xế bị chuẩn hoá về mặc định — không giữ dữ liệu ẩn không đường dùng.
      next.minRentalMinutes = null;
      next.preferredRouteTypes = [];
      next.depositMode = DRIVER_DEPOSIT_MODE.NONE;
    }
    if (!isDriverDepositModeSupported(next.depositMode)) {
      throw invalid('Chế độ đặt cọc này chưa được hệ thống thu — chỉ "không yêu cầu đặt cọc" đang dùng được');
    }
    if (next.requiredDocuments.includes(CUSTOMER_DOCUMENT_TYPE.OTHER)) {
      throw invalid('"Giấy tờ khác" không định danh được khách — không dùng làm yêu cầu bắt buộc');
    }
    if (next.requireTermsAcceptance && !next.termsText) {
      throw invalid('Bắt buộc khách đồng ý điều khoản thì phải có nội dung điều khoản');
    }
    /*
     * Bật tự động nhận CÓ TÀI XẾ chỉ khi hệ thống gán được tài xế an toàn: gói có tính năng Tài
     * xế và gian hàng đang có tài xế hoạt động. Không có thì từ chối ngay ở server — một toggle
     * bật lên mà không bao giờ tác dụng là toggle giả.
     */
    if (serviceType === SERVICE_TYPE.WITH_DRIVER && next.autoAcceptEnabled) {
      const capability = await this.withDriverCapability(tenantId, features);
      if (!capability.available) {
        throw new ConflictException({
          code: API_ERROR_CODE.CONFLICT,
          message: capability.driversFeatureEnabled
            ? 'Cần ít nhất một tài xế đang hoạt động để bật tự động nhận chuyến có tài xế'
            : 'Gói hiện hành chưa có tính năng Tài xế — chưa bật được tự động nhận chuyến có tài xế',
          details: capability,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const data = {
        autoAcceptEnabled: next.autoAcceptEnabled,
        autoAcceptMinLeadMinutes: next.autoAcceptMinLeadMinutes,
        autoAcceptMaxLeadMinutes: next.autoAcceptMaxLeadMinutes,
        minRentalMinutes: next.minRentalMinutes,
        preferredRouteTypes: [...new Set(next.preferredRouteTypes)],
        requiredDocuments: [...new Set(next.requiredDocuments)],
        identityVerifyMethod: next.identityVerifyMethod,
        termsText: next.termsText,
        requireTermsAcceptance: next.requireTermsAcceptance,
        depositMode: next.depositMode,
        updatedBy: userId,
      };
      await tx.vehicleServiceSetting.upsert({
        where: { vehicleId_serviceType: { vehicleId, serviceType } },
        create: { id: newId(), tenantId, vehicleId, serviceType, ...data },
        update: data,
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'vehicle.service_settings.update',
          targetType: 'vehicle',
          targetId: vehicleId,
          before: auditShape(current),
          after: { serviceType, ...auditShape(next) },
        },
        tx,
      );
    });

    const saved = await this.serviceSettingFor(this.prisma, vehicleId, serviceType as ServiceType);
    return toServiceDto(
      saved,
      serviceType === SERVICE_TYPE.WITH_DRIVER
        ? await this.withDriverCapability(tenantId, features)
        : null,
    );
  }

  /** Thiết lập HIỆU LỰC của một dịch vụ — mặc định khi chưa có dòng. */
  async serviceSettingFor(
    db: Db,
    vehicleId: string,
    serviceType: ServiceType,
  ): Promise<EffectiveServiceSetting> {
    const legal = requiredIdentityDocuments(serviceType);
    const row = hasVehicleServiceSettings(serviceType)
      ? await db.vehicleServiceSetting.findUnique({
          where: { vehicleId_serviceType: { vehicleId, serviceType } },
          select: SERVICE_SELECT,
        })
      : null;
    if (!row) {
      return {
        serviceType,
        autoAcceptEnabled: false,
        autoAcceptMinLeadMinutes: AUTO_ACCEPT_DEFAULT_MIN_LEAD_MINUTES,
        autoAcceptMaxLeadMinutes: AUTO_ACCEPT_DEFAULT_MAX_LEAD_MINUTES,
        minRentalMinutes: null,
        preferredRouteTypes: [],
        requiredDocuments: [],
        effectiveRequiredDocuments: legal,
        identityVerifyMethod: IDENTITY_VERIFY_METHOD.IN_PERSON,
        termsText: null,
        requireTermsAcceptance: false,
        depositMode: DRIVER_DEPOSIT_MODE.NONE,
        updatedAt: null,
      };
    }
    return {
      serviceType,
      autoAcceptEnabled: row.autoAcceptEnabled,
      autoAcceptMinLeadMinutes: row.autoAcceptMinLeadMinutes,
      autoAcceptMaxLeadMinutes: row.autoAcceptMaxLeadMinutes,
      minRentalMinutes: row.minRentalMinutes,
      preferredRouteTypes: row.preferredRouteTypes,
      requiredDocuments: row.requiredDocuments,
      effectiveRequiredDocuments: effectiveRequiredDocuments(serviceType, row.requiredDocuments, legal),
      identityVerifyMethod: row.identityVerifyMethod,
      termsText: row.termsText,
      requireTermsAcceptance: row.requireTermsAcceptance,
      depositMode: row.depositMode as DriverDepositMode,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Thời lượng tối thiểu + đồng ý điều khoản — kiểm ở SERVER lúc khách gửi. Khung giờ đi qua
   * `assertHandoverWindows` (cần DB); hàm này thuần trên thiết lập đã nạp.
   */
  assertServiceConstraints(
    setting: EffectiveServiceSetting,
    input: { pickupAt: Date | null; returnAt: Date | null; acceptedTerms: boolean },
  ): void {
    if (setting.requireTermsAcceptance && !input.acceptedTerms) {
      throw new BadRequestException({
        code: API_ERROR_CODE.RENTAL_TERMS_ACCEPTANCE_REQUIRED,
        message: 'Chủ xe yêu cầu khách đồng ý điều khoản thuê trước khi gửi yêu cầu',
      });
    }
    if (
      setting.minRentalMinutes != null &&
      input.pickupAt &&
      input.returnAt &&
      input.returnAt.getTime() - input.pickupAt.getTime() < setting.minRentalMinutes * MS_PER_MINUTE
    ) {
      throw new BadRequestException({
        code: API_ERROR_CODE.MIN_RENTAL_DURATION,
        message: `Thời lượng thuê tối thiểu của xe là ${Math.round(setting.minRentalMinutes / 60)} giờ`,
        details: { minRentalMinutes: setting.minRentalMinutes },
      });
    }
  }

  /**
   * Có tự nhận được không — HÀM THUẦN trên dữ kiện đã nạp. Trả MÃ chặn đầu tiên gặp, `null` =
   * đủ điều kiện. Lịch bận/tài xế rảnh KHÔNG kiểm ở đây: hai thứ đó chỉ có DB quyết lúc ghi
   * (ADR 0006), caller kiểm preview riêng nếu muốn và vẫn phải bọc lỗi lúc commit.
   */
  evaluateAutoAccept(
    setting: EffectiveServiceSetting,
    windows: HandoverWindows,
    input: AutoAcceptInput,
  ): AutoAcceptBlocker | null {
    if (!hasVehicleServiceSettings(input.serviceType)) return AUTO_ACCEPT_BLOCKER.SERVICE_NOT_SUPPORTED;
    if (!setting.autoAcceptEnabled) return AUTO_ACCEPT_BLOCKER.DISABLED;
    if (!input.pickupAt || !input.returnAt) return AUTO_ACCEPT_BLOCKER.SERVICE_NOT_SUPPORTED;
    const now = input.now ?? new Date();
    const leadMinutes = (input.pickupAt.getTime() - now.getTime()) / MS_PER_MINUTE;
    if (leadMinutes < setting.autoAcceptMinLeadMinutes) return AUTO_ACCEPT_BLOCKER.LEAD_TOO_SHORT;
    if (leadMinutes > setting.autoAcceptMaxLeadMinutes) return AUTO_ACCEPT_BLOCKER.LEAD_TOO_LONG;
    if (handoverBlocker(windows, input.pickupAt, input.returnAt)) {
      return AUTO_ACCEPT_BLOCKER.OUTSIDE_HANDOVER_WINDOW;
    }
    if (
      setting.minRentalMinutes != null &&
      input.returnAt.getTime() - input.pickupAt.getTime() < setting.minRentalMinutes * MS_PER_MINUTE
    ) {
      return AUTO_ACCEPT_BLOCKER.BELOW_MIN_DURATION;
    }
    if (setting.requireTermsAcceptance && !input.termsAccepted) {
      return AUTO_ACCEPT_BLOCKER.TERMS_NOT_ACCEPTED;
    }
    if (input.quoteIsEstimate) return AUTO_ACCEPT_BLOCKER.QUOTE_ESTIMATE;
    /*
     * Có tài xế + tuyến hoa hồng: đơn chỉ sinh khi tiền về (webhook), mà tài xế phải được gán
     * TRONG transaction tạo đơn để `bookings_driver_schedule_excl` gác. Không thể hứa tài xế
     * trước hàng giờ rồi mới tạo đơn — để chủ xe duyệt tay.
     */
    if (input.serviceType === SERVICE_TYPE.WITH_DRIVER && input.holdRequired) {
      return AUTO_ACCEPT_BLOCKER.HOLD_REQUIRED_WITH_DRIVER;
    }
    return null;
  }

  /**
   * Preview công khai cho báo giá: đủ điều kiện tự nhận không, kể cả lịch bận (đọc — có thể cũ
   * ngay khi trả về, ADR 0006) và tài xế rảnh cho chuyến có tài xế. KHÔNG kiểm SĐT/khách bị
   * chặn — hai thứ đó chỉ biết lúc gửi.
   */
  async previewAutoAccept(
    vehicleId: string,
    input: AutoAcceptInput,
  ): Promise<{ eligible: boolean; blocker: AutoAcceptBlocker | null }> {
    if (!hasVehicleServiceSettings(input.serviceType)) {
      return { eligible: false, blocker: AUTO_ACCEPT_BLOCKER.SERVICE_NOT_SUPPORTED };
    }
    // Tenant suy từ XE — endpoint công khai không có scope, và client không được gửi tenant.
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, deletedAt: null },
      select: { tenantId: true },
    });
    if (!vehicle) return { eligible: false, blocker: AUTO_ACCEPT_BLOCKER.SERVICE_NOT_SUPPORTED };
    const tenantId = vehicle.tenantId;
    const [setting, windows] = await Promise.all([
      this.serviceSettingFor(this.prisma, vehicleId, input.serviceType as ServiceType),
      this.handoverWindowsFor(this.prisma, vehicleId),
    ]);
    const blocker = this.evaluateAutoAccept(setting, windows, input);
    if (blocker) return { eligible: false, blocker };
    if (input.pickupAt && input.returnAt) {
      const busy = await this.occupancy.findOverlapping(vehicleId, input.pickupAt, input.returnAt);
      if (busy.length > 0) return { eligible: false, blocker: AUTO_ACCEPT_BLOCKER.SCHEDULE_BUSY };
      if (input.serviceType === SERVICE_TYPE.WITH_DRIVER) {
        const driver = await this.pickAssignableDriver(this.prisma, tenantId, {
          pickupAt: input.pickupAt,
          returnAt: input.returnAt,
        });
        if (!driver) return { eligible: false, blocker: AUTO_ACCEPT_BLOCKER.NO_DRIVER };
      }
    }
    return { eligible: true, blocker: null };
  }

  /**
   * Tài xế ĐẦU TIÊN gán được cho khung giờ — cùng ba điều kiện của `DriversService.findAssignable`
   * (active · GPLX còn hạn tới lúc trả · không đơn giao nhau). Đây là bước CHỌN ứng viên; chốt
   * chặn thật là `bookings_driver_schedule_excl` lúc INSERT đơn cùng transaction.
   */
  async pickAssignableDriver(
    db: Db,
    tenantId: string,
    window: { pickupAt: Date; returnAt: Date },
  ): Promise<{ id: string; name: string } | null> {
    const busy = await db.booking.findMany({
      where: {
        tenantId,
        driverId: { not: null },
        deletedAt: null,
        status: { in: [...BOOKING_STATUS_OCCUPYING] },
        pickupAt: { lt: window.returnAt },
        returnAt: { gt: window.pickupAt },
      },
      select: { driverId: true },
    });
    const busyIds = new Set(busy.map((b) => b.driverId).filter((id): id is string => id != null));
    const drivers = await db.driver.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: DRIVER_STATUS.ACTIVE,
        ...(busyIds.size > 0 ? { id: { notIn: [...busyIds] } } : {}),
        OR: [{ licenseExpiresAt: null }, { licenseExpiresAt: { gte: window.returnAt } }],
      },
      orderBy: { name: 'asc' },
      take: 1,
      select: { id: true, name: true },
    });
    return drivers[0] ?? null;
  }

  private async withDriverCapability(
    tenantId: string,
    features: Readonly<Record<PlanFeature, FeatureState>>,
  ): Promise<WithDriverAutoAcceptCapabilityDto> {
    const driversFeatureEnabled = features[PLAN_FEATURE.DRIVERS] === FEATURE_STATE.ENABLED;
    const activeDrivers = await this.prisma.driver.count({
      where: { tenantId, deletedAt: null, status: DRIVER_STATUS.ACTIVE },
    });
    return {
      available: driversFeatureEnabled && activeDrivers > 0,
      activeDrivers,
      driversFeatureEnabled,
    };
  }

  // ── Phụ phí mặc định có tài xế ──────────────────────────────────────────

  async listSurchargeRules(tenantId: string, vehicleId: string): Promise<DriverSurchargeRuleDto[]> {
    await this.assertOwned(this.prisma, tenantId, vehicleId);
    return this.surchargeRulesFor(this.prisma, vehicleId);
  }

  async saveSurchargeRules(
    tenantId: string,
    vehicleId: string,
    userId: string,
    dto: SaveDriverSurchargeRulesDto,
  ): Promise<DriverSurchargeRuleDto[]> {
    await this.assertOwned(this.prisma, tenantId, vehicleId);
    const seen = new Set<string>();
    for (const item of dto.items) {
      if (seen.has(item.kind)) throw invalid(`Loại phụ phí "${item.kind}" bị lặp`);
      seen.add(item.kind);
      const spec = DRIVER_SURCHARGE_KIND_SPEC[item.kind as DriverSurchargeKind];
      if (spec.threshold === null && item.thresholdValue != null) {
        throw invalid('Phụ phí lưu trú qua đêm không có ngưỡng');
      }
      if (
        spec.threshold === DRIVER_SURCHARGE_THRESHOLD_KIND.MINUTE_OF_DAY &&
        item.thresholdValue != null &&
        item.thresholdValue > HANDOVER_WINDOW_MAX_MINUTE
      ) {
        throw invalid('Mốc ngoài giờ phải là một giờ trong ngày');
      }
      if (item.enabled && Number(item.amount) <= 0) {
        throw invalid('Bật phụ phí thì số tiền phải lớn hơn 0');
      }
    }
    const before = await this.surchargeRulesFor(this.prisma, vehicleId);

    await this.prisma.$transaction(async (tx) => {
      for (const kind of DRIVER_SURCHARGE_KIND_VALUES) {
        const item = dto.items.find((i) => i.kind === kind);
        const data = {
          enabled: item?.enabled ?? false,
          amount: new Prisma.Decimal(item?.amount ?? '0'),
          thresholdValue: item?.thresholdValue ?? null,
          updatedBy: userId,
        };
        await tx.vehicleDriverSurchargeRule.upsert({
          where: { vehicleId_kind: { vehicleId, kind } },
          create: { id: newId(), tenantId, vehicleId, kind, ...data },
          update: data,
        });
      }
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'vehicle.driver_surcharge_rules.update',
          targetType: 'vehicle',
          targetId: vehicleId,
          before: { items: before },
          after: { items: dto.items },
        },
        tx,
      );
    });

    return this.surchargeRulesFor(this.prisma, vehicleId);
  }

  /** Đủ BỐN loại theo thứ tự cố định — loại chưa có dòng trả tắt/0. */
  async surchargeRulesFor(db: Db, vehicleId: string): Promise<DriverSurchargeRuleDto[]> {
    const rows = await db.vehicleDriverSurchargeRule.findMany({
      where: { vehicleId },
      select: { kind: true, enabled: true, amount: true, thresholdValue: true },
    });
    return DRIVER_SURCHARGE_KIND_VALUES.map((kind) => {
      const row = rows.find((r) => r.kind === kind);
      return {
        kind,
        unit: DRIVER_SURCHARGE_KIND_SPEC[kind].unit,
        enabled: row?.enabled ?? false,
        amount: row?.amount.toFixed(0) ?? '0',
        thresholdValue: row?.thresholdValue ?? null,
      };
    });
  }

  // ── Snapshot điều kiện thuê ─────────────────────────────────────────────

  /**
   * Điều kiện thuê tại THỜI ĐIỂM này, để đóng băng vào yêu cầu/đơn. Chỉ quy tắc phụ phí ĐANG BẬT
   * của chuyến có tài xế đi vào snapshot; dịch vụ khác có mảng rỗng.
   */
  async rentalTermsSnapshotFor(
    db: Db,
    vehicleId: string,
    serviceType: string,
    termsAcceptedAt: Date | null,
  ): Promise<RentalTermsSnapshot> {
    const service = serviceType as ServiceType;
    const [setting, windows, buffer, rules] = await Promise.all([
      this.serviceSettingFor(db, vehicleId, service),
      this.handoverWindowsFor(db, vehicleId),
      this.turnaroundBufferFor(db, vehicleId),
      serviceType === SERVICE_TYPE.WITH_DRIVER
        ? this.surchargeRulesFor(db, vehicleId)
        : Promise.resolve([] as DriverSurchargeRuleDto[]),
    ]);
    const surchargeRules: DriverSurchargeRuleSnapshot[] = rules
      .filter((r) => r.enabled)
      .map((r) => ({
        kind: r.kind as DriverSurchargeKind,
        unit: r.unit as DriverSurchargeRuleSnapshot['unit'],
        amount: r.amount,
        thresholdValue: r.thresholdValue,
      }));
    return {
      serviceType: service,
      requiredDocuments: setting.effectiveRequiredDocuments,
      identityVerifyMethod: setting.identityVerifyMethod,
      termsText: setting.termsText,
      requireTermsAcceptance: setting.requireTermsAcceptance,
      termsAcceptedAt: termsAcceptedAt?.toISOString() ?? null,
      depositMode: serviceType === SERVICE_TYPE.WITH_DRIVER ? setting.depositMode : null,
      surchargeRules,
      pickupWindows: windows.pickup,
      returnWindows: windows.return,
      turnaroundBufferMinutes: buffer,
    };
  }

  // ── Tiện ích ────────────────────────────────────────────────────────────

  private async assertOwned(db: Db, tenantId: string, vehicleId: string): Promise<void> {
    const found = await db.vehicle.findFirst({
      where: { id: vehicleId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({ code: API_ERROR_CODE.NOT_FOUND, message: 'Không tìm thấy xe' });
    }
  }
}

// ── Helpers thuần ────────────────────────────────────────────────────────────

interface MinuteWindow {
  startMinute: number;
  endMinute: number;
}

/** `HH:mm` → phút, kiểm `start < end` và không chồng lấn — cùng luật với CHECK/EXCLUDE ở DB. */
function normalizeWindows(windows: HandoverWindowDto[]): MinuteWindow[] {
  const parsed = windows.map((w) => {
    const startMinute = handoverTimeToMinute(w.start);
    const endMinute = handoverTimeToMinute(w.end);
    if (startMinute == null || endMinute == null) throw invalid('Giờ giao nhận không hợp lệ (HH:mm)');
    if (startMinute >= endMinute) {
      throw invalid('Giờ kết thúc phải sau giờ bắt đầu — một khung không qua nửa đêm');
    }
    return { startMinute, endMinute };
  });
  parsed.sort((a, b) => a.startMinute - b.startMinute);
  for (let i = 1; i < parsed.length; i += 1) {
    if (parsed[i]!.startMinute < parsed[i - 1]!.endMinute) {
      throw invalid('Các khung giờ không được chồng lấn nhau');
    }
  }
  return parsed;
}

function toWindowDto(w: MinuteWindow): HandoverWindow {
  return { start: minuteToHandoverTime(w.startMinute), end: minuteToHandoverTime(w.endMinute) };
}

/** Giờ nào vi phạm — `pickup` / `return` / null. Không có khung = không giới hạn. */
function handoverBlocker(
  windows: HandoverWindows,
  pickupAt: Date,
  returnAt: Date | null,
): 'pickup' | 'return' | null {
  if (!isWithinHandoverWindows(pickupAt, windows.pickup)) return 'pickup';
  if (returnAt && !isWithinHandoverWindows(returnAt, windows.return)) return 'return';
  return null;
}

function toServiceDto(
  s: EffectiveServiceSetting,
  capability: WithDriverAutoAcceptCapabilityDto | null,
): VehicleServiceSettingDto {
  return {
    serviceType: s.serviceType,
    autoAcceptEnabled: s.autoAcceptEnabled,
    autoAcceptMinLeadMinutes: s.autoAcceptMinLeadMinutes,
    autoAcceptMaxLeadMinutes: s.autoAcceptMaxLeadMinutes,
    minRentalMinutes: s.minRentalMinutes,
    preferredRouteTypes: s.preferredRouteTypes,
    requiredDocuments: s.requiredDocuments,
    effectiveRequiredDocuments: s.effectiveRequiredDocuments,
    identityVerifyMethod: s.identityVerifyMethod,
    termsText: s.termsText,
    requireTermsAcceptance: s.requireTermsAcceptance,
    depositMode: s.depositMode,
    supportedDepositModes: [...DRIVER_DEPOSIT_MODE_SUPPORTED],
    withDriverAutoAccept: capability,
    updatedAt: s.updatedAt?.toISOString() ?? null,
  };
}

function auditShape(s: EffectiveServiceSetting): Record<string, unknown> {
  return {
    autoAcceptEnabled: s.autoAcceptEnabled,
    autoAcceptMinLeadMinutes: s.autoAcceptMinLeadMinutes,
    autoAcceptMaxLeadMinutes: s.autoAcceptMaxLeadMinutes,
    minRentalMinutes: s.minRentalMinutes,
    preferredRouteTypes: s.preferredRouteTypes,
    requiredDocuments: s.requiredDocuments,
    identityVerifyMethod: s.identityVerifyMethod,
    termsText: s.termsText,
    requireTermsAcceptance: s.requireTermsAcceptance,
    depositMode: s.depositMode,
  };
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: API_ERROR_CODE.VALIDATION_FAILED, message });
}
