import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUTO_ACCEPT_BLOCKER,
  CUSTOMER_DOCUMENT_TYPE,
  DRIVER_DEPOSIT_MODE,
  DRIVER_DEPOSIT_MODE_SUPPORTED,
  DRIVER_SURCHARGE_KIND_SPEC,
  DRIVER_SURCHARGE_KIND_VALUES,
  HANDOVER_WINDOW_KIND,
  IDENTITY_VERIFY_METHOD,
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
  type DriverSurchargeRuleSnapshot,
  type HandoverWindow,
  type HandoverWindowKind,
  type RentalTermsSnapshot,
  type ServiceType,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { DriversService } from '../drivers/drivers.service';
import { AuditService } from '../audit/audit.service';
import { currentSupportScope } from '../../common/support/support-request.store';
import { assertSupportServiceSettingPinned } from './service-setting-support-policy';
import { OccupancyService } from '../calendar/occupancy.service';
import { ListingsService } from '../public-listings/listings.service';
// HÀM THUẦN, không phải service: không tạo cạnh DI nào nên module lá này vẫn là lá.
import { refreshPendingApprovalSnapshot } from '../vehicles/refresh-pending-approval-snapshot';
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
  quoteIsEstimate: boolean;
  /** Tuyến hoa hồng sẽ sinh khoản giữ chỗ thay vì tạo đơn ngay. */
  holdRequired: boolean;
  /** Khách đã tích đồng ý điều khoản (chỉ có nghĩa khi chủ xe bắt buộc). */
  termsAccepted: boolean;
}

const SERVICE_SELECT = {
  serviceType: true,
  autoAcceptEnabled: true,
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
    /** Writer duy nhất của snapshot chợ (ADR 0008) — thẻ xe mang cờ tự động nhận chuyến. */
    private readonly listings: ListingsService,
    /** Writer duy nhất của liên kết + lượt gán tài xế (ADR 0063). */
    private readonly drivers: DriversService,
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
        .map((r) => ({
          start: minuteToHandoverTime(r.startMinute),
          end: minuteToHandoverTime(r.endMinute),
        }));
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
  ): Promise<VehicleServiceSettingDto[]> {
    await this.assertOwned(this.prisma, tenantId, vehicleId);
    const [selfDrive, withDriver, capability] = await Promise.all([
      this.serviceSettingFor(this.prisma, vehicleId, SERVICE_TYPE.SELF_DRIVE),
      this.serviceSettingFor(this.prisma, vehicleId, SERVICE_TYPE.WITH_DRIVER),
      this.withDriverCapability(tenantId),
    ]);
    return [toServiceDto(selfDrive, null), toServiceDto(withDriver, capability)];
  }

  async patchServiceSetting(
    tenantId: string,
    vehicleId: string,
    serviceType: string,
    userId: string,
    dto: PatchVehicleServiceSettingDto,
  ): Promise<VehicleServiceSettingDto> {
    if (!hasVehicleServiceSettings(serviceType)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message:
          'Chỉ dịch vụ tự lái và có tài xế có thiết lập riêng — thuê dài hạn luôn do gian hàng chốt lịch',
      });
    }
    await this.assertOwned(this.prisma, tenantId, vehicleId);
    const current = await this.serviceSettingFor(
      this.prisma,
      vehicleId,
      serviceType as ServiceType,
    );
    // Phiên hỗ trợ (ADR 0050 §13): tự nhận chuyến / điều khoản / cọc có mặt thì phải giữ nguyên.
    if (currentSupportScope()) assertSupportServiceSettingPinned(current, dto);

    const next: EffectiveServiceSetting = {
      ...current,
      ...(dto.autoAcceptEnabled !== undefined ? { autoAcceptEnabled: dto.autoAcceptEnabled } : {}),
      ...(dto.minRentalMinutes !== undefined ? { minRentalMinutes: dto.minRentalMinutes } : {}),
      ...(dto.preferredRouteTypes !== undefined
        ? { preferredRouteTypes: dto.preferredRouteTypes }
        : {}),
      ...(dto.requiredDocuments !== undefined ? { requiredDocuments: dto.requiredDocuments } : {}),
      ...(dto.identityVerifyMethod !== undefined
        ? { identityVerifyMethod: dto.identityVerifyMethod }
        : {}),
      ...(dto.termsText !== undefined ? { termsText: dto.termsText?.trim() || null } : {}),
      ...(dto.requireTermsAcceptance !== undefined
        ? { requireTermsAcceptance: dto.requireTermsAcceptance }
        : {}),
      ...(dto.depositMode !== undefined
        ? { depositMode: dto.depositMode as DriverDepositMode }
        : {}),
    };

    if (serviceType === SERVICE_TYPE.SELF_DRIVE) {
      // Trường riêng của có tài xế bị chuẩn hoá về mặc định — không giữ dữ liệu ẩn không đường dùng.
      next.minRentalMinutes = null;
      next.preferredRouteTypes = [];
      next.depositMode = DRIVER_DEPOSIT_MODE.NONE;
    }
    if (!isDriverDepositModeSupported(next.depositMode)) {
      throw invalid(
        'Chế độ đặt cọc này chưa được hệ thống thu — chỉ "không yêu cầu đặt cọc" đang dùng được',
      );
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
      const capability = await this.withDriverCapability(tenantId);
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
        /*
         * Phiên hỗ trợ: trường GHIM (tự nhận chuyến, điều khoản, cọc) không nằm trong câu UPDATE.
         * `current` được đọc trước transaction — ghi lại nó là để một lượt lưu của phiên âm thầm
         * đảo thay đổi chủ xe vừa làm cùng lúc. Hàng chưa có thì tạo với mặc định như thường.
         */
        update: currentSupportScope()
          ? {
              minRentalMinutes: data.minRentalMinutes,
              preferredRouteTypes: data.preferredRouteTypes,
              requiredDocuments: data.requiredDocuments,
              identityVerifyMethod: data.identityVerifyMethod,
              updatedBy: data.updatedBy,
            }
          : data,
      });
      /*
       * Xe đang chờ duyệt → phiếu mang thiết lập vừa lưu (24/09/2026). Điều kiện thuê
       * (`termsText`) và tự động nhận chuyến nằm TRONG thứ người duyệt đọc, nên bỏ qua đây là để
       * người duyệt phê chuẩn một bộ điều kiện chưa ai xem.
       *
       * `policy: 'unchanged'` vì đường ghi này không đụng được tới chính sách thuê — phần đó của
       * snapshot cũ mang sang nguyên vẹn. Đây cũng là lý do hàm kia nhận `'unchanged'` thay vì
       * bắt module lá này phải có `PricingService`, thứ nó cố ý không import (docblock của
       * `VehicleSettingsModule`).
       */
      await refreshPendingApprovalSnapshot(tx, {
        vehicleId,
        actorUserId: userId,
        policy: 'unchanged',
      });
      /*
       * Thẻ xe ở chợ hiện "Không cần xác nhận" theo cờ tự động nhận của TỪNG dịch vụ — cờ đó
       * mirror vào snapshot `public_listings`, nên mỗi lượt lưu phải đồng bộ lại trong CÙNG
       * transaction. Xe chưa có listing (chưa duyệt) thì đây là no-op.
       */
      await this.listings.syncFromVehicle(vehicleId, tx);
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
      serviceType === SERVICE_TYPE.WITH_DRIVER ? await this.withDriverCapability(tenantId) : null,
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
      minRentalMinutes: row.minRentalMinutes,
      preferredRouteTypes: row.preferredRouteTypes,
      requiredDocuments: row.requiredDocuments,
      effectiveRequiredDocuments: effectiveRequiredDocuments(
        serviceType,
        row.requiredDocuments,
        legal,
      ),
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
    if (!hasVehicleServiceSettings(input.serviceType))
      return AUTO_ACCEPT_BLOCKER.SERVICE_NOT_SUPPORTED;
    if (!setting.autoAcceptEnabled) return AUTO_ACCEPT_BLOCKER.DISABLED;
    if (!input.pickupAt || !input.returnAt) return AUTO_ACCEPT_BLOCKER.SERVICE_NOT_SUPPORTED;
    /*
     * KHÔNG còn mốc "đặt trước ít nhất/nhiều nhất" (17/09/2026): bật công tắc là nhận, đặt gấp
     * hay đặt xa đều vậy. Mọi điều kiện dưới đây là ràng buộc THẬT của chuyến, không phải ngưỡng
     * cấu hình — đó là lý do chúng ở lại.
     */
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
     * Có tài xế + có thu tiền giữ chỗ: đơn chỉ sinh khi tiền về (webhook), tức hai giờ sau mới
     * biết tài xế còn rảnh và còn chịu nhận hay không — và lúc đó khách đã trả tiền. Để chủ xe duyệt tay và tự chọn người (ADR 0044 điều 2).
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
        const hasDriver = await this.hasAvailableDriver(this.prisma, tenantId, {
          pickupAt: input.pickupAt,
          returnAt: input.returnAt,
        });
        if (!hasDriver) return { eligible: false, blocker: AUTO_ACCEPT_BLOCKER.NO_DRIVER };
      }
    }
    return { eligible: true, blocker: null };
  }

  /**
   * Có ít nhất MỘT tài xế liên kết rảnh khung giờ này không — điều kiện tự nhận chuyến có tài xế
   * (ADR 0063). Đơn tự nhận được gán sẵn một tài xế rảnh ở trạng thái chờ nhận; tài xế vẫn phải nhận.
   */
  hasAvailableDriver(
    db: Db,
    tenantId: string,
    window: { pickupAt: Date; returnAt: Date },
  ): Promise<boolean> {
    return this.drivers.hasAvailableDriver(db, tenantId, window);
  }

  /** Tài xế để tự gán khi tự nhận chuyến có tài xế — xem `DriversService.pickForAutoAssign`. */
  pickDriverForAutoAssign(
    db: Db,
    tenantId: string,
    window: { pickupAt: Date; returnAt: Date; excludeUserId?: string | null },
  ): Promise<{ id: string; userId: string } | null> {
    return this.drivers.pickForAutoAssign(db, tenantId, window);
  }

  /**
   * Bật tự nhận chuyến có tài xế cần ít nhất một tài xế ĐANG LIÊN KẾT. Module tài xế mở cho cả
   * hai tuyến (ADR 0063) nên `driversFeatureEnabled` luôn đúng — giữ trường cho client cũ.
   */
  private async withDriverCapability(tenantId: string): Promise<WithDriverAutoAcceptCapabilityDto> {
    const activeDrivers = await this.drivers.countActiveLinks(tenantId);
    return { available: activeDrivers > 0, activeDrivers, driversFeatureEnabled: true };
  }

  // ── Phụ phí tài xế — ĐÃ GỠ (ADR 0075 điều 7) ────────────────────────────────
  //
  // Khách luôn thấy MỘT giá có tài xế; phí cầu đường khách trả trực tiếp, chi phí khác chủ xe và
  // tài xế tự thương lượng. Bảng `vehicle_driver_surcharge_rules` không còn được đọc/ghi; hai
  // endpoint giữ HÌNH DẠNG cũ để app phát hành trước đó không vỡ: đọc trả bốn loại đều tắt, lưu
  // trả 422 `DRIVER_SURCHARGE_RETIRED`.

  async listSurchargeRules(tenantId: string, vehicleId: string): Promise<DriverSurchargeRuleDto[]> {
    await this.assertOwned(this.prisma, tenantId, vehicleId);
    return this.surchargeRulesFor(this.prisma, vehicleId);
  }

  async saveSurchargeRules(
    tenantId: string,
    vehicleId: string,
    _userId: string,
    _dto: SaveDriverSurchargeRulesDto,
  ): Promise<DriverSurchargeRuleDto[]> {
    await this.assertOwned(this.prisma, tenantId, vehicleId);
    throw new UnprocessableEntityException({
      code: API_ERROR_CODE.DRIVER_SURCHARGE_RETIRED,
      message:
        'Phụ phí tài xế đã gỡ — giá có tài xế là giá trọn gói, phí cầu đường khách trả trực tiếp',
    });
  }

  /** Bốn loại theo thứ tự cố định, đều TẮT — phụ phí tài xế không còn công bố (ADR 0075). */
  async surchargeRulesFor(_db: Db, _vehicleId: string): Promise<DriverSurchargeRuleDto[]> {
    return DRIVER_SURCHARGE_KIND_VALUES.map((kind) => ({
      kind,
      unit: DRIVER_SURCHARGE_KIND_SPEC[kind].unit,
      enabled: false,
      amount: '0',
      thresholdValue: null,
    }));
  }

  // ── Snapshot điều kiện thuê ─────────────────────────────────────────────

  /**
   * Điều kiện thuê tại THỜI ĐIỂM này, để đóng băng vào yêu cầu/đơn. `surchargeRules` luôn rỗng từ
   * ADR 0075 (phụ phí tài xế đã gỡ) — trường giữ để snapshot cũ đọc lại được.
   */
  async rentalTermsSnapshotFor(
    db: Db,
    vehicleId: string,
    serviceType: string,
    termsAcceptedAt: Date | null,
  ): Promise<RentalTermsSnapshot> {
    const service = serviceType as ServiceType;
    const [setting, windows, buffer] = await Promise.all([
      this.serviceSettingFor(db, vehicleId, service),
      this.handoverWindowsFor(db, vehicleId),
      this.turnaroundBufferFor(db, vehicleId),
    ]);
    // Phụ phí tài xế đã gỡ (ADR 0075) — snapshot mới luôn rỗng; snapshot cũ giữ nguyên số của nó.
    const surchargeRules: DriverSurchargeRuleSnapshot[] = [];
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
    if (startMinute == null || endMinute == null)
      throw invalid('Giờ giao nhận không hợp lệ (HH:mm)');
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
