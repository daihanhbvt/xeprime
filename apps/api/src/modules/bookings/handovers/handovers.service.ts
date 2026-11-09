import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, openSupportCaseWhere, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  HANDOVER_CONFIRM_BOOKING_TARGET,
  HANDOVER_CONFIRM_SOURCE,
  HANDOVER_ENERGY_KIND,
  HANDOVER_MAX_PHOTOS,
  HANDOVER_STATUS,
  HANDOVER_SUSPICIOUS_KM_PER_DAY_SETTING,
  HANDOVER_TYPE,
  ODOMETER_SOURCE,
  PAYMENT_KIND,
  PRIVATE_FILE_PURPOSE,
  PRIVATE_FILE_STATUS,
  AUDIT_ACTOR_SCOPE,
  AUDIT_TARGET_TYPE,
  SUPPORT_CASE_AUDIT_ACTION,
  SUPPORT_CASE_AUTO_RESOLVE_REASON,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_EVENT_KIND,
  SUPPORT_CASE_STATUS,
  SUPPORT_CASE_STATUS_OPEN,
  SUPPORT_EVENT_VISIBILITY,
  SUPPORT_PARTY,
  handoverEnergyKind,
  handoverOdometerSuspicion,
  canAttachHandoverPhoto,
  isHandoverPhotoSlotFor,
  isHandoverEditable,
  isHandoverEligible,
  vehicleMaintenanceSchedule,
  type BookingStatus,
  type HandoverPhotoSlot,
  type HandoverStatus,
  type HandoverType,
  type OdometerSource,
  type PaymentMethod,
} from '@xeprime/types';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { MaintenanceService } from '../../vehicles/maintenance/maintenance.service';
import { OdometerService } from '../../vehicles/maintenance/odometer.service';
import { VehicleContractsService } from '../../vehicles/vehicle-contracts.service';
import {
  SourceContractDownloadDto,
  SourceContractPresignDto,
} from '../../vehicles/dto/vehicle-source.dto';
import { BookingPaymentWriter } from '../../payments/booking-payment.writer';
import { BookingsService } from '../bookings.service';
import { SettlementService } from '../settlement/settlement.service';
import {
  CancelHandoverDto,
  ConfirmHandoverDto,
  HandoverContextDto,
  HandoverDto,
  MissingOdometerQueueDto,
  PresignHandoverPhotoDto,
  ResolveHandoverOdometerDto,
  SaveHandoverDto,
} from './dto/handover.dto';
import { paginationMeta, resolvePaging } from '../../../common/pagination';
import { resolveBranchScope } from '../../../common/dto/branch-scope';
import { isUniqueViolation } from '../../../common/prisma-errors';

/** Người gọi thấy được gì — controller kiểm quyền rồi truyền xuống, service không tự đọc. */
export interface HandoverViewScope {
  canViewFiles: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Dung sai khi kiểm "thời điểm thực tế không ở tương lai" — đồng hồ máy khách lệch máy chủ vài
 * chục giây là chuyện thường, và từ chối một biên bản vì lệch 5 giây là làm phiền vô cớ.
 */
const FUTURE_TOLERANCE_MS = 2 * 60 * 1000;

const PHOTO_INCLUDE = {
  photos: { include: { privateFile: true }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.VehicleHandoverInclude;

type HandoverRow = Prisma.VehicleHandoverGetPayload<{ include: typeof PHOTO_INCLUDE }>;

/**
 * Bàn giao xe (Wave 7) — writer DUY NHẤT của `vehicle_handovers` và `vehicle_handover_photos`.
 * docs/design/12 §9.1.
 *
 * Nguyên tắc đóng đinh:
 *  - **Bản nháp không có hiệu lực.** KM của xe, trạng thái đơn và lịch xe chỉ đổi lúc XÁC NHẬN.
 *    Nhân viên nhập dở, sửa, xoá thoải mái — không gì rò ra ngoài biên bản.
 *  - **Xác nhận là MỘT transaction**: đổi trạng thái biên bản → ghi KM (qua `OdometerService`)
 *    → chuyển trạng thái đơn (qua `BookingsService.transitionWithinTx`, nhả lịch nếu hoàn tất)
 *    → tính lại cảnh báo bảo dưỡng (qua `MaintenanceService`) → audit. Hỏng một bước là
 *    rollback trọn gói; không có trạng thái "đơn đã đóng nhưng KM chưa ghi".
 *  - **Xác nhận lặp lại không nhân bản hệ quả**: đã `confirmed` thì trả nguyên trạng; hai
 *    request song song thì một cái thua ở điều kiện `rowVersion` + `status` trong UPDATE.
 *  - **Thiếu KM trả không được phép làm hỏng số KM** (§9.1): biên bản vẫn đóng để giữ bằng
 *    chứng, cắm cờ `odometer_missing`, và KM có thẩm quyền KHÔNG bị đụng tới.
 *  - Mọi thay đổi KM đi qua `OdometerService` — không ghi thẳng cột KM ở đây.
 */
@Injectable()
export class HandoversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly odometer: OdometerService,
    private readonly maintenance: MaintenanceService,
    private readonly files: VehicleContractsService,
    private readonly audit: AuditService,
    // Tiền của lượt nhận lại xe: phụ phí (writer `booking_surcharges`) + phiếu thu (writer `payments`).
    private readonly settlement: SettlementService,
    private readonly payments: BookingPaymentWriter,
  ) {}

  // ── Đọc ───────────────────────────────────────────────────────────────────

  /** Toàn bộ ngữ cảnh bàn giao của một đơn — một lần gọi đủ dựng cả màn hình. */
  async context(
    tenantId: string,
    bookingId: string,
    scope: HandoverViewScope,
  ): Promise<HandoverContextDto> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const [rows, profile, suspiciousKmPerDay] = await Promise.all([
      this.prisma.vehicleHandover.findMany({
        where: { bookingId, tenantId, status: { not: HANDOVER_STATUS.CANCELED } },
        include: PHOTO_INCLUDE,
      }),
      this.prisma.vehicleMaintenanceProfile.findUnique({
        where: { vehicleId: booking.vehicleId },
        select: { currentOdometerKm: true, lastServiceKm: true, oilChangeIntervalKm: true },
      }),
      this.suspiciousKmPerDay(tenantId),
    ]);

    const nameByUserId = await this.actorNames(rows);
    const energyKind = handoverEnergyKind(booking.vehicle.fuelType);
    const pickup = rows.find((row) => row.type === HANDOVER_TYPE.PICKUP) ?? null;
    const returnRow = rows.find((row) => row.type === HANDOVER_TYPE.RETURN) ?? null;
    const status = booking.status as BookingStatus;

    return {
      bookingId: booking.id,
      bookingCode: booking.code,
      bookingStatus: booking.status,
      vehicleId: booking.vehicleId,
      vehicleName: booking.vehicle.name,
      plateNumber: booking.vehicle.plateNumber,
      vehicleType: booking.vehicle.vehicleType,
      energyKind,
      bookingPickupAt: booking.pickupAt.toISOString(),
      bookingReturnAt: booking.returnAt.toISOString(),
      vehicleOdometerKm: profile?.currentOdometerKm ?? null,
      pickupOdometerKm: confirmedOdometerKm(pickup),
      // Cùng công thức với tab Bảo dưỡng & KM (§9) — hai màn không được lệch cách tính.
      nextMaintenanceKm: vehicleMaintenanceSchedule({
        currentKm: profile?.currentOdometerKm ?? null,
        lastServiceKm: profile?.lastServiceKm ?? null,
        intervalKm: profile?.oilChangeIntervalKm ?? null,
      }).nextMaintenanceKm,
      rentalDays: rentalDaysOf(booking.pickupAt, booking.returnAt),
      suspiciousKmPerDay,
      pickup: pickup ? toDto(pickup, energyKind, scope, nameByUserId) : null,
      return: returnRow ? toDto(returnRow, energyKind, scope, nameByUserId) : null,
      // Còn mở được chiều nào — trạng thái đơn quyết định, không phải nút trên UI.
      canStartPickup: isHandoverEligible(HANDOVER_TYPE.PICKUP, status) || Boolean(pickup),
      canStartReturn: isHandoverEligible(HANDOVER_TYPE.RETURN, status) || Boolean(returnRow),
    };
  }

  // ── Bản nháp ──────────────────────────────────────────────────────────────

  /**
   * Tạo hoặc cập nhật bản nháp. Một endpoint cho cả hai vì ở quầy chỉ có một hành động:
   * "lưu những gì vừa nhập". Bản đầu tiên tự sinh; các lần sau phải nộp `expectedRowVersion`.
   */
  async saveDraft(
    tenantId: string,
    bookingId: string,
    type: HandoverType,
    userId: string,
    dto: SaveHandoverDto,
    scope: HandoverViewScope,
  ): Promise<HandoverDto> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const energyKind = handoverEnergyKind(booking.vehicle.fuelType);
    assertEnergyInput(dto, energyKind);

    const existing = await this.findActive(tenantId, bookingId, type);

    if (!existing) {
      if (!isHandoverEligible(type, booking.status as BookingStatus)) {
        throw notEligible(type, booking.status);
      }
      const id = newId();
      try {
        await this.prisma.vehicleHandover.create({
          data: {
            id,
            tenantId,
            bookingId,
            vehicleId: booking.vehicleId,
            type,
            status: dto.markReady ? HANDOVER_STATUS.READY : HANDOVER_STATUS.DRAFT,
            ...patchOf(dto),
            createdBy: userId,
            updatedBy: userId,
          },
        });
      } catch (err) {
        // Hai người cùng bấm "Bắt đầu giao xe": partial unique chặn bản thứ hai. Người thua
        // nhận đúng bản của người thắng thay vì một lỗi khó hiểu.
        if (!isUniqueViolation(err)) throw err;
        return this.read(tenantId, bookingId, type, energyKind, scope);
      }
      await this.audit.record({
        tenantId,
        actorUserId: userId,
        actorScope: 'tenant',
        action: 'booking.handover.draft.create',
        targetType: 'vehicle_handover',
        targetId: id,
        after: { bookingId, vehicleId: booking.vehicleId, type },
      });
      return this.read(tenantId, bookingId, type, energyKind, scope);
    }

    if (!isHandoverEditable(existing.status as HandoverStatus)) {
      throw readOnly();
    }
    if (dto.expectedRowVersion == null) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Thiếu expectedRowVersion - cần cho phát hiện sửa đè',
      });
    }

    const result = await this.prisma.vehicleHandover.updateMany({
      where: { id: existing.id, tenantId, rowVersion: dto.expectedRowVersion },
      data: {
        ...patchOf(dto),
        ...(dto.markReady === undefined
          ? {}
          : { status: dto.markReady ? HANDOVER_STATUS.READY : HANDOVER_STATUS.DRAFT }),
        updatedBy: userId,
        rowVersion: { increment: 1 },
      },
    });
    if (result.count === 0) throw stale();

    return this.read(tenantId, bookingId, type, energyKind, scope);
  }

  /** Hủy bản nháp. Biên bản đã xác nhận KHÔNG hủy được — nó là bằng chứng, không phải nháp. */
  async cancel(
    tenantId: string,
    bookingId: string,
    type: HandoverType,
    userId: string,
    dto: CancelHandoverDto,
    scope: HandoverViewScope,
  ): Promise<HandoverContextDto> {
    const existing = await this.requireActive(tenantId, bookingId, type);
    if (!isHandoverEditable(existing.status as HandoverStatus)) throw readOnly();

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.vehicleHandover.updateMany({
        where: { id: existing.id, tenantId, rowVersion: dto.expectedRowVersion },
        data: {
          status: HANDOVER_STATUS.CANCELED,
          canceledAt: new Date(),
          canceledBy: userId,
          updatedBy: userId,
          rowVersion: { increment: 1 },
        },
      });
      if (result.count === 0) throw stale();

      // Ảnh của bản nháp bị bỏ → đánh dấu file `deleted` (object không xoá tự động, cùng
      // kỷ luật Wave 4.1: dọn kho là việc vận hành có kiểm soát).
      const fileIds = existing.photos.map((photo) => photo.privateFileId);
      if (fileIds.length > 0) {
        await tx.vehiclePrivateFile.updateMany({
          where: { id: { in: fileIds }, tenantId, vehicleId: existing.vehicleId },
          data: { status: PRIVATE_FILE_STATUS.DELETED, deletedAt: new Date() },
        });
      }

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'booking.handover.cancel',
          targetType: 'vehicle_handover',
          targetId: existing.id,
          before: { status: existing.status },
          after: { status: HANDOVER_STATUS.CANCELED },
        },
        tx,
      );
    });

    return this.context(tenantId, bookingId, scope);
  }

  // ── Xác nhận ──────────────────────────────────────────────────────────────

  /**
   * Xác nhận bàn giao — toàn bộ hệ quả nghiệp vụ xảy ra ở đây, đúng một lần, trong một
   * transaction. Xem chú thích ở đầu class cho danh sách bước và lý do chúng phải đi cùng nhau.
   */
  async confirm(
    tenantId: string,
    bookingId: string,
    type: HandoverType,
    userId: string,
    dto: ConfirmHandoverDto,
    scope: HandoverViewScope,
    /** Người gọi có `payments.record` — đọc từ scope của request ở controller, không từ body. */
    money: { canRecordPayment: boolean } = { canRecordPayment: false },
  ): Promise<HandoverContextDto> {
    /*
     * Phụ phí + "Đã thu tiền" (06/11/2026) chỉ có nghĩa lúc NHẬN LẠI xe, và là tiền: cần đúng quyền
     * ghi thu (`payments.record`) như thẻ "Phát sinh" / hộp Thu tiền — `handovers.confirm` không đủ.
     * Kiểm TRƯỚC mọi thứ để một request sai không kịp dựng biên bản nháp nào.
     */
    const settlesMoney = Boolean(dto.surcharges?.length) || dto.collectPayment !== undefined;
    if (settlesMoney && type !== HANDOVER_TYPE.RETURN) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Phụ phí và thu tiền chỉ ghi cùng lượt nhận lại xe',
      });
    }
    if (settlesMoney && !money.canRecordPayment) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.FORBIDDEN,
        message: 'Bạn không có quyền ghi phụ phí / thu tiền cho đơn này',
      });
    }

    const booking = await this.requireBooking(tenantId, bookingId);
    const bookingStatus = booking.status as BookingStatus;

    /**
     * Wave 10 — LUỒNG NHANH: không cần bản nháp nào tồn tại trước. Một chuyến bình thường chỉ
     * có hai lần bấm ở đầu và cuối chuyến, nên nếu chưa có biên bản thì tạo ngay tại đây rồi
     * xác nhận. Ai đã mở phần nâng cao và lưu nháp trước thì bản đó được dùng tiếp như cũ.
     */
    let handover = await this.findActive(tenantId, bookingId, type);
    if (!handover) {
      if (!isHandoverEligible(type, bookingStatus)) throw notEligible(type, booking.status);
      handover = await this.createForConfirm(tenantId, bookingId, booking.vehicleId, type, userId);
    }

    // Retry mạng / bấm hai lần: đã xác nhận rồi thì trả nguyên trạng, KHÔNG chạy lại hệ quả.
    if (handover.status === HANDOVER_STATUS.CONFIRMED) {
      return this.context(tenantId, bookingId, scope);
    }

    if (!isHandoverEligible(type, bookingStatus)) throw notEligible(type, booking.status);

    /**
     * Wave 10 (docs/design/14 §2): Odo và ảnh hiện trạng đều **TUỲ CHỌN ở CẢ HAI CHIỀU**.
     *
     * Trước đây KM lúc giao là bắt buộc và ảnh phải đủ góc — thực tế điều đó biến một việc
     * 10 giây ở quầy thành một biểu mẫu, và nhân viên bịa số cho qua. Giờ số nào có thì ghi:
     * thiếu KM giao thì không có mốc sàn để đối soát KM trả (và ta không giả vờ có), thiếu KM
     * trả thì sinh việc `Thiếu KM trả`. KM của xe chỉ đổi khi có số thật.
     */
    const odometerKm = dto.odometerKm !== undefined ? dto.odometerKm : handover.odometerKm;

    /**
     * Mốc thực tế: client chọn được nhưng KHÔNG được ở tương lai — một biên bản "sẽ xảy ra"
     * là vô nghĩa, và mở đường cho việc khai khống giờ nhận để né phí quá giờ.
     */
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Thời điểm thực tế không thể ở tương lai',
        details: { fields: [{ field: 'occurredAt', message: 'Chọn thời điểm không ở tương lai' }] },
      });
    }

    const pickupKm = await this.confirmedPickupKm(tenantId, bookingId, type);
    if (type === HANDOVER_TYPE.RETURN && odometerKm !== null && pickupKm !== null) {
      if (odometerKm < pickupKm) throw belowPickup(pickupKm, odometerKm);

      const suspicion = handoverOdometerSuspicion({
        deltaKm: odometerKm - pickupKm,
        rentalDays: rentalDaysOf(booking.pickupAt, booking.returnAt),
        thresholdKmPerDay: await this.suspiciousKmPerDay(tenantId),
      });
      if (suspicion?.suspicious && !dto.acknowledgeSuspicious) {
        throw new ConflictException({
          code: API_ERROR_CODE.HANDOVER_ODOMETER_SUSPICIOUS,
          message: 'Quãng đường phát sinh thấp bất thường so với thời gian thuê',
          details: suspicion,
        });
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        /**
         * Thời điểm xác nhận do SERVER sinh, ngay tại lúc giành được biên bản — không nhận từ
         * body. Đây là dấu thời gian pháp lý của một biên bản: cho client chọn nghĩa là cho
         * phép lùi ngày một cách im lặng, và mọi đối soát sau đó (giờ nhận thực tế, quá giờ,
         * tranh chấp) mất chỗ dựa. Bàn giao lùi ngày/offline nếu cần phải là luồng riêng có
         * phê duyệt tường minh.
         *
         * MỘT mốc duy nhất dùng cho cả biên bản, `actual_pickup_at`/`actual_return_at` của đơn
         * và audit — ba nơi không được lệch nhau dù chỉ vài mili-giây.
         */
        const confirmedAt = new Date();
        /**
         * Điều kiện `status IN (draft, ready)` trong UPDATE là lớp chống trùng THẬT: hai người
         * cùng bấm thì chỉ một UPDATE khớp, người còn lại không chạy tiếp bước nào. `rowVersion`
         * là lớp BỔ SUNG, chỉ khi người gọi có bản nháp trong tay (Wave 10 cho xác nhận thẳng,
         * lúc đó chẳng có bản nào để mà cũ).
         */
        const claimed = await tx.vehicleHandover.updateMany({
          where: {
            id: handover.id,
            tenantId,
            status: { in: [HANDOVER_STATUS.DRAFT, HANDOVER_STATUS.READY] },
            ...(dto.expectedRowVersion != null ? { rowVersion: dto.expectedRowVersion } : {}),
          },
          data: {
            status: HANDOVER_STATUS.CONFIRMED,
            confirmedAt,
            confirmedBy: userId,
            // Mốc việc thực sự xảy ra: client chọn được (mặc định `Bây giờ`), `confirmedAt` thì không.
            occurredAt,
            ...(dto.odometerKm !== undefined ? { odometerKm: dto.odometerKm } : {}),
            ...(dto.condition !== undefined ? { condition: dto.condition } : {}),
            ...(dto.conditionNote !== undefined ? { conditionNote: dto.conditionNote } : {}),
            ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
            odometerMissing: odometerKm === null,
            suspiciousAcknowledged: Boolean(dto.acknowledgeSuspicious),
            updatedBy: userId,
            rowVersion: { increment: 1 },
          },
        });
        if (claimed.count === 0) throw new HandoverClaimLost();

        // KM chỉ chảy vào hồ sơ xe từ ĐÂY — và chỉ khi thật sự có số (§9.1).
        if (odometerKm !== null) {
          const readingId = await this.odometer.record(tx, {
            tenantId,
            vehicleId: booking.vehicleId,
            userId,
            odometerKm,
            source: sourceOf(type),
            sourceRefId: bookingId,
          });
          await tx.vehicleHandover.update({
            where: { id: handover.id },
            data: { odometerReadingId: readingId },
          });
        }

        // Tiền của lượt nhận lại xe — TRƯỚC khi đơn sang `completed` (đơn còn `active`).
        if (settlesMoney) {
          await this.settleReturnMoneyWithinTx(tx, { tenantId, userId, booking, dto, occurredAt });
        }

        // Đơn chuyển trạng thái qua chính BookingsService: nhả lịch, audit và thông báo giữ
        // nguyên luật cũ, không nhân bản ở đây.
        const target = HANDOVER_CONFIRM_BOOKING_TARGET[type];
        if (target) {
          /**
           * Đơn chuyển thẳng `reserved → active` trong CÙNG transaction với việc xác nhận biên
           * bản (ADR 0047) — một cạnh trực tiếp, không còn đường vòng qua `confirmed`.
           *
           * Trước đây bảng chuyển trạng thái cố ý KHÔNG có cạnh thẳng này: `POST
           * /bookings/:id/transition` là endpoint CHUNG, và thêm cạnh đó vào bảng nghĩa là mở
           * một đường đổi đơn sang `Đang thuê` mà chẳng cần biên bản bàn giao nào (Wave 10 §3:
           * trạng thái đơn chỉ đổi như HỆ QUẢ của một lần xác nhận thật). Giờ an toàn thêm cạnh
           * thẳng vì `TransitionBookingDto` đã khoá endpoint công khai đó chỉ còn nhận
           * `cancelled`/`no_show` — `active` chỉ còn tới được từ đúng nơi này, không qua
           * client. Xem docblock `BOOKING_STATUS_TRANSITIONS`.
           */
          await this.bookings.transitionWithinTx(
            tx,
            tenantId,
            bookingId,
            userId,
            bookingStatus,
            target,
            // Giờ nhận/trả THỰC TẾ của đơn lấy mốc vận hành, không phải lúc bấm ghi nhận.
            type === HANDOVER_TYPE.PICKUP
              ? { actualPickupAt: occurredAt.toISOString() }
              : { actualReturnAt: occurredAt.toISOString() },
          );
        }

        /*
         * Chuyến ĐÃ DIỄN RA — câu case `handover_unconfirmed` của worker (ADR 0066, lớp 3) chờ xác
         * minh vừa có lời đáp, nên case tự kết luận ở đây. Không làm thì biên bản xác nhận muộn
         * vẫn để tiền của chuyến bị giữ tới khi có người nhớ ra đóng tay.
         *
         * Đặt SAU `transitionWithinTx`: lượt chuyển đã khoá dòng đơn, mà worker cũng khoá dòng
         * đơn trước khi claim + mở case. Worker xong trước ⇒ câu đọc dưới đây (READ COMMITTED,
         * ảnh chụp mới mỗi câu) thấy case nó vừa mở; worker tới sau ⇒ nó chờ khoá rồi claim trượt
         * vì đơn đã `active`. Không có khe nào để case mọc ra sau lượt xác nhận.
         */
        if (type === HANDOVER_TYPE.PICKUP) {
          await this.resolveHandoverUnconfirmedWithinTx(tx, {
            tenantId,
            bookingId,
            bookingCode: booking.code,
            userId,
            by: 'host',
          });
        }

        // KM vừa nhảy → tính lại mốc bảo dưỡng và mở việc-cần-làm nếu tới hạn.
        if (type === HANDOVER_TYPE.RETURN && odometerKm !== null) {
          await this.maintenance.ensureDueTaskWithinTx(tx, {
            tenantId,
            vehicleId: booking.vehicleId,
            userId,
            reason: `trả xe đơn ${booking.code}`,
          });
        }

        await this.audit.record(
          {
            tenantId,
            actorUserId: userId,
            actorScope: 'tenant',
            action: `booking.handover.${type}.confirm`,
            targetType: 'vehicle_handover',
            targetId: handover.id,
            before: { status: handover.status },
            after: {
              status: HANDOVER_STATUS.CONFIRMED,
              bookingId,
              vehicleId: booking.vehicleId,
              odometerKm,
              odometerMissing: odometerKm === null,
              suspiciousAcknowledged: Boolean(dto.acknowledgeSuspicious),
              // Cùng một mốc với biên bản và với `actual_*_at` của đơn — audit không được
              // kể một giờ khác với thứ nó đang ghi nhận. Ghi CẢ HAI mốc: giờ vận hành do
              // người dùng khai, giờ ghi nhận do server sinh — lệch nhau là dữ liệu, không lỗi.
              occurredAt: occurredAt.toISOString(),
              confirmedAt: confirmedAt.toISOString(),
            },
          },
          tx,
        );
      });
    } catch (err) {
      if (!(err instanceof HandoverClaimLost)) throw err;
      // Thua cuộc đua: nếu người kia đã xác nhận xong thì kết quả cuối cùng đúng như mong
      // muốn của cả hai — trả về, không báo lỗi. Còn lại là sửa đè thật sự.
      const latest = await this.findActive(tenantId, bookingId, type);
      if (latest?.status === HANDOVER_STATUS.CONFIRMED) {
        return this.context(tenantId, bookingId, scope);
      }
      throw stale();
    }

    return this.context(tenantId, bookingId, scope);
  }

  /**
   * Tiền của lượt nhận lại xe (hộp "Xác nhận đã nhận lại xe", 06/11/2026): các khoản phát sinh gõ
   * trong hộp, rồi — nếu ô "Đã thu tiền" bật — MỘT phiếu thu tiền thuê cho số khách còn phải trả.
   *
   * Chạy TRONG transaction xác nhận: lỗi ở đây rollback cả biên bản, không có "xe đã nhận mà phụ phí
   * mất" hay "đã thu mà đơn vẫn đang thuê". Dòng đơn khoá TRƯỚC khi đọc công nợ: một lượt Thu tiền
   * song song hoặc xong trước (lượt này đọc số mới ⇒ lệch ⇒ 409), hoặc chờ lượt này xong — không có
   * khe để hai lượt cùng thu một khoản. Mỗi bảng vẫn một writer: phụ phí qua `SettlementService`,
   * phiếu thu qua `BookingPaymentWriter`.
   */
  private async settleReturnMoneyWithinTx(
    tx: Prisma.TransactionClient,
    args: {
      tenantId: string;
      userId: string;
      booking: {
        id: string;
        code: string;
        vehicleId: string;
        serviceType: string;
        tenantCustomerId: string | null;
      };
      dto: ConfirmHandoverDto;
      occurredAt: Date;
    },
  ): Promise<void> {
    const { tenantId, userId, booking, dto } = args;
    await tx.$queryRaw`SELECT 1 FROM "public"."bookings" WHERE "id" = ${booking.id} FOR UPDATE`;

    if (dto.surcharges?.length) {
      await this.settlement.addSurchargesWithinTx(tx, {
        tenantId,
        bookingId: booking.id,
        serviceType: booking.serviceType,
        userId,
        items: dto.surcharges,
      });
    }
    if (!dto.collectPayment) return;

    // Đọc SAU khi ghi phụ phí — cùng transaction nên thấy chính các dòng vừa ghi.
    const due = await this.settlement.collectableAmount(tx, tenantId, booking.id);
    if (!due.equals(new Prisma.Decimal(dto.collectPayment.amount))) {
      throw new ConflictException({
        code: API_ERROR_CODE.HANDOVER_COLLECT_AMOUNT_CHANGED,
        message: 'Số tiền còn phải thu vừa thay đổi - kiểm tra lại rồi xác nhận',
        details: { collectableAmount: due.toFixed(2) },
      });
    }
    if (due.lessThanOrEqualTo(0)) return;

    await this.payments.recordWithinTx(tx, {
      tenantId,
      userId,
      booking,
      amount: due,
      method: dto.collectPayment.method as PaymentMethod,
      kind: PAYMENT_KIND.RENTAL,
      // Tiền đổi tay đúng lúc nhận lại xe — cùng mốc vận hành với biên bản.
      paidAt: args.occurredAt,
      description: `Thu tiền khi nhận lại xe đơn ${booking.code}`,
      via: 'return_confirm',
    });
  }

  // ── Xác nhận theo lời KHÁCH (ADR 0081) ────────────────────────────────────

  /**
   * Biên bản ra đời từ LỜI CỦA KHÁCH thay vì từ quầy gian hàng — ADR 0081:
   *  - `customer`: khách bấm "Đã nhận xe" ⇒ biên bản GIAO XE, đơn `reserved → active`;
   *  - `auto`: khách đã báo "Đã trả xe" và chủ xe im lặng quá hạn ⇒ biên bản TRẢ XE, đơn
   *    `active → completed` (quyết toán chạy như mọi lượt hoàn thành).
   *
   * CÙNG chuỗi hệ quả với `confirm` — claim biên bản → chuyển đơn qua `transitionWithinTx` → kết luận
   * case `handover_unconfirmed` → audit — chạy TRONG transaction của người gọi, người đã khoá dòng đơn
   * (`FOR UPDATE`) và kiểm điều kiện của chính lượt đó. Khác `confirm` ở ba chỗ: `confirmed_by` là
   * tài khoản KHÁCH (CHECK `vh_confirmed_has_actor` đòi một người, và khách là người duy nhất đã lên
   * tiếng), `confirm_source` nói rõ đó không phải nhân viên, và không có KM / hiện trạng nào từ lời
   * khách (§9.1). KM chỉ ghi khi GIAN HÀNG đã nhập sẵn trong bản nháp, dưới tên người đã nhập.
   *
   * Không bắn thông báo chuyển trạng thái chung (`silent`) — người gọi báo bằng câu nói đúng chuyện
   * đã xảy ra. Trả `false` khi biên bản đã được xác nhận (chủ xe vừa bấm xong): không còn việc gì.
   */
  async confirmOnCustomerWordWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      booking: { id: string; code: string; vehicleId: string; status: BookingStatus };
      type: HandoverType;
      customerUserId: string;
      source: typeof HANDOVER_CONFIRM_SOURCE.CUSTOMER | typeof HANDOVER_CONFIRM_SOURCE.AUTO;
      occurredAt: Date;
    },
  ): Promise<boolean> {
    const { tenantId, booking, type, customerUserId, source, occurredAt } = input;
    if (!isHandoverEligible(type, booking.status)) throw notEligible(type, booking.status);
    const byCustomer = source === HANDOVER_CONFIRM_SOURCE.CUSTOMER;
    const actorScope = byCustomer ? AUDIT_ACTOR_SCOPE.CUSTOMER : AUDIT_ACTOR_SCOPE.SYSTEM;

    /*
     * Chưa có biên bản thì dựng nháp ngay trong transaction này. `skipDuplicates` (= ON CONFLICT DO
     * NOTHING): chủ xe vừa mở nháp cùng lúc thì partial unique "một biên bản sống mỗi chiều" bỏ qua
     * bản của ta thay vì làm hỏng cả transaction — bản của họ được dùng tiếp.
     */
    await tx.vehicleHandover.createMany({
      data: [
        {
          id: newId(),
          tenantId,
          bookingId: booking.id,
          vehicleId: booking.vehicleId,
          type,
          status: HANDOVER_STATUS.DRAFT,
          createdBy: customerUserId,
          updatedBy: customerUserId,
        },
      ],
      skipDuplicates: true,
    });
    const handover = await tx.vehicleHandover.findFirstOrThrow({
      where: { tenantId, bookingId: booking.id, type, status: { not: HANDOVER_STATUS.CANCELED } },
      select: { id: true, status: true, odometerKm: true, createdBy: true, updatedBy: true },
    });
    if (handover.status === HANDOVER_STATUS.CONFIRMED) return false;

    const confirmedAt = new Date();
    const claimed = await tx.vehicleHandover.updateMany({
      where: {
        id: handover.id,
        tenantId,
        status: { in: [HANDOVER_STATUS.DRAFT, HANDOVER_STATUS.READY] },
      },
      data: {
        status: HANDOVER_STATUS.CONFIRMED,
        confirmedAt,
        confirmedBy: customerUserId,
        confirmSource: source,
        occurredAt,
        odometerMissing: handover.odometerKm === null,
        updatedBy: customerUserId,
        rowVersion: { increment: 1 },
      },
    });
    if (claimed.count === 0) return false;

    // KM của bản nháp GIAN HÀNG đã nhập (người viết nháp sau cùng) — không bao giờ là số khách khai.
    const keyedBy = handover.updatedBy ?? handover.createdBy;
    const staffKm =
      handover.odometerKm !== null && keyedBy !== null && keyedBy !== customerUserId
        ? { km: handover.odometerKm, userId: keyedBy }
        : null;
    if (staffKm) {
      const readingId = await this.odometer.record(tx, {
        tenantId,
        vehicleId: booking.vehicleId,
        userId: staffKm.userId,
        odometerKm: staffKm.km,
        source: sourceOf(type),
        sourceRefId: booking.id,
      });
      await tx.vehicleHandover.update({
        where: { id: handover.id },
        data: { odometerReadingId: readingId },
      });
    }

    const target = HANDOVER_CONFIRM_BOOKING_TARGET[type];
    if (target) {
      await this.bookings.transitionWithinTx(
        tx,
        tenantId,
        booking.id,
        // Lượt tự hoàn thành là của HỆ THỐNG — không gán nó cho khách hay cho ai trong gian hàng.
        byCustomer ? customerUserId : null,
        booking.status,
        target,
        {
          ...(type === HANDOVER_TYPE.PICKUP
            ? { actualPickupAt: occurredAt.toISOString() }
            : { actualReturnAt: occurredAt.toISOString() }),
          actorScope,
          silent: true,
        },
      );
    }

    if (type === HANDOVER_TYPE.PICKUP) {
      await this.resolveHandoverUnconfirmedWithinTx(tx, {
        tenantId,
        bookingId: booking.id,
        bookingCode: booking.code,
        userId: customerUserId,
        by: 'customer',
      });
    }
    if (type === HANDOVER_TYPE.RETURN && staffKm) {
      await this.maintenance.ensureDueTaskWithinTx(tx, {
        tenantId,
        vehicleId: booking.vehicleId,
        userId: staffKm.userId,
        reason: `trả xe đơn ${booking.code}`,
      });
    }

    await this.audit.record(
      {
        tenantId,
        actorUserId: byCustomer ? customerUserId : null,
        actorScope,
        action: `booking.handover.${type}.confirm`,
        targetType: 'vehicle_handover',
        targetId: handover.id,
        before: { status: handover.status },
        after: {
          status: HANDOVER_STATUS.CONFIRMED,
          bookingId: booking.id,
          vehicleId: booking.vehicleId,
          confirmSource: source,
          // Lượt `auto` không có người bấm — ghi rõ lời của AI đã dẫn tới biên bản này.
          onCustomerWordOf: customerUserId,
          odometerKm: staffKm?.km ?? null,
          occurredAt: occurredAt.toISOString(),
          confirmedAt: confirmedAt.toISOString(),
        },
      },
      tx,
    );
    return true;
  }

  /**
   * Bổ sung/sửa KM trên biên bản ĐÃ XÁC NHẬN — đường duy nhất chạm vào biên bản chỉ-đọc, và
   * chỉ chạm đúng con số KM. Bắt buộc có lý do; giảm KM cần quyền cao hơn + xác nhận có ý thức.
   */
  async resolveOdometer(
    tenantId: string,
    bookingId: string,
    type: HandoverType,
    userId: string,
    dto: ResolveHandoverOdometerDto,
    opts: { canDecrease: boolean },
    scope: HandoverViewScope,
  ): Promise<HandoverContextDto> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const handover = await this.requireActive(tenantId, bookingId, type);
    if (handover.status !== HANDOVER_STATUS.CONFIRMED) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Chỉ biên bản đã xác nhận mới cần bổ sung KM - bản nháp thì sửa trực tiếp',
      });
    }

    const pickupKm = await this.confirmedPickupKm(tenantId, bookingId, type);
    if (type === HANDOVER_TYPE.RETURN && pickupKm !== null && dto.odometerKm < pickupKm) {
      throw belowPickup(pickupKm, dto.odometerKm);
    }

    const profile = await this.prisma.vehicleMaintenanceProfile.findUnique({
      where: { vehicleId: booking.vehicleId },
      select: { currentOdometerKm: true },
    });
    const currentKm = profile?.currentOdometerKm ?? null;
    const isDecrease = currentKm !== null && dto.odometerKm < currentKm;
    if (isDecrease) {
      if (!opts.canDecrease) {
        throw new ForbiddenException({
          code: API_ERROR_CODE.ODOMETER_DECREASE_FORBIDDEN,
          message: `KM mới (${dto.odometerKm}) thấp hơn KM hiện tại (${currentKm}) - thao tác này cần quyền quản trị viên`,
          details: {
            currentKm,
            nextKm: dto.odometerKm,
            requiredPermission: 'vehicles.odometer.decrease',
          },
        });
      }
      if (!dto.confirmDecrease) {
        throw new ConflictException({
          code: API_ERROR_CODE.ODOMETER_DECREASE_FORBIDDEN,
          message: 'KM mới thấp hơn KM hiện tại - cần xác nhận trước khi giảm',
          details: { currentKm, nextKm: dto.odometerKm, requiresConfirmation: true },
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.vehicleHandover.updateMany({
        where: {
          id: handover.id,
          tenantId,
          status: HANDOVER_STATUS.CONFIRMED,
          rowVersion: dto.expectedRowVersion,
        },
        data: {
          odometerKm: dto.odometerKm,
          odometerMissing: false,
          updatedBy: userId,
          rowVersion: { increment: 1 },
        },
      });
      if (claimed.count === 0) throw stale();

      // Bổ sung số còn thiếu là ghi nhận theo NGUỒN bàn giao; sửa số đã có là ĐIỀU CHỈNH TAY.
      // Hai nguồn khác nhau vì đọc lịch sử phải phân biệt được "điền chỗ trống" với "sửa số".
      const filling = handover.odometerKm === null;
      const readingId = await this.odometer.record(tx, {
        tenantId,
        vehicleId: booking.vehicleId,
        userId,
        odometerKm: dto.odometerKm,
        source: filling ? sourceOf(type) : ODOMETER_SOURCE.MANUAL_CORRECTION,
        sourceRefId: bookingId,
        reasonCode: dto.reasonCode,
        reason: dto.reason,
        allowDecrease: isDecrease,
      });
      await tx.vehicleHandover.update({
        where: { id: handover.id },
        data: { odometerReadingId: readingId },
      });

      if (type === HANDOVER_TYPE.RETURN) {
        await this.maintenance.ensureDueTaskWithinTx(tx, {
          tenantId,
          vehicleId: booking.vehicleId,
          userId,
          reason: `bổ sung KM đơn ${booking.code}`,
        });
      }

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: filling
            ? 'booking.handover.odometer.resolve'
            : 'booking.handover.odometer.correct',
          targetType: 'vehicle_handover',
          targetId: handover.id,
          before: { odometerKm: handover.odometerKm, vehicleCurrentKm: currentKm },
          after: {
            odometerKm: dto.odometerKm,
            reasonCode: dto.reasonCode,
            isDecrease,
            bookingId,
          },
        },
        tx,
      );
    });

    return this.context(tenantId, bookingId, scope);
  }

  // ── Hàng đợi vận hành toàn gian hàng (Wave 8) ─────────────────────────────

  /**
   * Biên bản TRẢ XE đã xác nhận nhưng chưa có KM — việc tồn đọng làm KM có thẩm quyền của xe
   * bị treo, kéo theo mốc bảo dưỡng không tính được.
   *
   * Phân trang ở DB (partial index `vehicle_handovers_missing_odometer_idx` phục vụ đúng
   * truy vấn này) — gian hàng vài trăm xe vẫn chỉ trả về một trang. Giải quyết xong thì
   * `odometer_missing` thành false và việc tự rời hàng đợi, không cần dọn tay.
   */
  async missingOdometerQueue(
    tenantId: string,
    query: { q?: string; branchId?: string; page?: number; limit?: number },
    /** Chi nhánh người gọi được giao — `null` = toàn gian hàng (ADR 0052). */
    allowedBranchIds: readonly string[] | null,
  ): Promise<MissingOdometerQueueDto> {
    const paging = resolvePaging(query, 20, 100);
    const search = query.q?.trim();

    const where: Prisma.VehicleHandoverWhereInput = {
      tenantId,
      type: HANDOVER_TYPE.RETURN,
      status: HANDOVER_STATUS.CONFIRMED,
      odometerMissing: true,
      // Xe hoặc đơn đã xoá mềm thì không còn là việc phải làm. Điều kiện này phải TRÙNG với
      // phép đếm ở `MaintenanceService.boardSummary` (Wave 8.1 §6) — lệch một vế là tab hiện
      // một số còn bảng hiện số khác. Bộ lọc chi nhánh đi cùng nó vì hàng đợi này là MỘT TAB
      // của Trung tâm bảo dưỡng: ô "Chi nhánh" ở trên phải áp cho cả bốn tab, không chỉ ba.
      vehicle: { deletedAt: null, branchId: resolveBranchScope(query.branchId, allowedBranchIds) },
      booking: { deletedAt: null },
      ...(search
        ? {
            OR: [
              { vehicle: { name: { contains: search, mode: 'insensitive' } } },
              { vehicle: { plateNumber: { contains: search, mode: 'insensitive' } } },
              { booking: { code: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vehicleHandover.count({ where }),
      this.prisma.vehicleHandover.findMany({
        where,
        // Việc tồn đọng lâu nhất lên đầu — hàng đợi vận hành đọc theo tuổi, không theo mới nhất.
        orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }],
        skip: paging.skip,
        take: paging.take,
        select: {
          id: true,
          bookingId: true,
          vehicleId: true,
          confirmedAt: true,
          confirmedBy: true,
          rowVersion: true,
          vehicle: { select: { name: true, plateNumber: true } },
          booking: { select: { code: true } },
        },
      }),
    ]);

    // KM lúc giao của đúng các đơn trên TRANG NÀY — bounded theo `limit`, không N+1 toàn kho.
    const bookingIds = rows.map((row) => row.bookingId);
    const [pickups, actors] = await Promise.all([
      bookingIds.length
        ? this.prisma.vehicleHandover.findMany({
            where: {
              tenantId,
              bookingId: { in: bookingIds },
              type: HANDOVER_TYPE.PICKUP,
              status: HANDOVER_STATUS.CONFIRMED,
            },
            select: { bookingId: true, odometerKm: true },
          })
        : Promise.resolve([]),
      this.actorNames(rows as unknown as HandoverRow[]),
    ]);
    const pickupKmByBooking = new Map(pickups.map((row) => [row.bookingId, row.odometerKm]));

    return {
      data: rows.map((row) => ({
        handoverId: row.id,
        bookingId: row.bookingId,
        bookingCode: row.booking.code,
        vehicleId: row.vehicleId,
        vehicleName: row.vehicle.name,
        plateNumber: row.vehicle.plateNumber,
        // `confirmed_at` không thể null ở bản đã xác nhận (CHECK `vh_confirmed_has_actor`).
        confirmedAt: row.confirmedAt!.toISOString(),
        confirmedByName: row.confirmedBy ? (actors.get(row.confirmedBy) ?? null) : null,
        pickupOdometerKm: pickupKmByBooking.get(row.bookingId) ?? null,
        rowVersion: row.rowVersion,
      })),
      meta: paginationMeta(paging, total),
    };
  }

  /** Đếm việc tồn đọng — cùng điều kiện với `missingOdometerQueue` (Wave 8.1 §6). */
  countMissingOdometer(tenantId: string): Promise<number> {
    return this.prisma.vehicleHandover.count({
      where: {
        tenantId,
        type: HANDOVER_TYPE.RETURN,
        status: HANDOVER_STATUS.CONFIRMED,
        odometerMissing: true,
        vehicle: { deletedAt: null },
        booking: { deletedAt: null },
      },
    });
  }

  // ── Ảnh hiện trạng ────────────────────────────────────────────────────────

  async presignPhoto(
    tenantId: string,
    bookingId: string,
    type: HandoverType,
    userId: string,
    dto: PresignHandoverPhotoDto,
  ): Promise<SourceContractPresignDto> {
    const booking = await this.requireBooking(tenantId, bookingId);
    assertSlotForVehicle(booking.vehicle.vehicleType, dto.slot);
    const handover = await this.requireActive(tenantId, bookingId, type);
    if (!canAttachHandoverPhoto(handover.status as HandoverStatus)) throw photoLocked();
    // Ảnh mới cùng slot là THAY ảnh cũ nên không tính thêm; chỉ chặn khi thật sự vượt trần.
    const replacing = handover.photos.some((photo) => photo.slot === dto.slot);
    if (!replacing && handover.photos.length >= HANDOVER_MAX_PHOTOS) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: `Mỗi biên bản tối đa ${HANDOVER_MAX_PHOTOS} ảnh`,
      });
    }

    return this.files.presignFor(tenantId, handover.vehicleId, userId, dto, {
      purpose: PRIVATE_FILE_PURPOSE.HANDOVER_PHOTO,
      keyOf: (vehicleId, fileId, extension) =>
        `tenants/${tenantId}/vehicles/${vehicleId}/handovers/${handover.id}/${fileId}.${extension}`,
    });
  }

  /** Xác minh object (HEAD + magic bytes) rồi gắn vào đúng ô ảnh — cùng một transaction. */
  async attachPhoto(
    tenantId: string,
    bookingId: string,
    type: HandoverType,
    userId: string,
    fileId: string,
    slot: HandoverPhotoSlot,
    scope: HandoverViewScope,
  ): Promise<HandoverDto> {
    const booking = await this.requireBooking(tenantId, bookingId);
    assertSlotForVehicle(booking.vehicle.vehicleType, slot);
    const handover = await this.requireActive(tenantId, bookingId, type);
    if (!canAttachHandoverPhoto(handover.status as HandoverStatus)) throw photoLocked();

    await this.files.completeFor(tenantId, handover.vehicleId, userId, fileId, {
      purpose: PRIVATE_FILE_PURPOSE.HANDOVER_PHOTO,
      auditAction: 'booking.handover.photo.upload',
    });

    await this.prisma.$transaction(async (tx) => {
      // Một góc chụp một ảnh: tải lại là THAY. Xoá bản cũ trước để unique (handover, slot)
      // không chặn bản mới, và file cũ chuyển `deleted` để không còn tải về được.
      const previous = handover.photos.find((photo) => photo.slot === slot);
      if (previous) {
        await tx.vehicleHandoverPhoto.delete({ where: { id: previous.id } });
        await tx.vehiclePrivateFile.updateMany({
          where: { id: previous.privateFileId, tenantId, vehicleId: handover.vehicleId },
          data: { status: PRIVATE_FILE_STATUS.DELETED, deletedAt: new Date() },
        });
      }
      await tx.vehicleHandoverPhoto.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId: handover.vehicleId,
          handoverId: handover.id,
          privateFileId: fileId,
          slot,
          createdBy: userId,
        },
      });
    });

    return this.read(
      tenantId,
      bookingId,
      type,
      handoverEnergyKind(booking.vehicle.fuelType),
      scope,
    );
  }

  /** Gỡ ảnh khỏi bản nháp theo GÓC CHỤP — người gỡ không cần cầm id file riêng tư. */
  async removePhoto(
    tenantId: string,
    bookingId: string,
    type: HandoverType,
    userId: string,
    slot: HandoverPhotoSlot,
    scope: HandoverViewScope,
  ): Promise<HandoverDto> {
    const booking = await this.requireBooking(tenantId, bookingId);
    const handover = await this.requireActive(tenantId, bookingId, type);
    if (!canAttachHandoverPhoto(handover.status as HandoverStatus)) throw photoLocked();

    const photo = handover.photos.find((row) => row.slot === slot);
    if (photo) {
      await this.prisma.$transaction(async (tx) => {
        await tx.vehicleHandoverPhoto.delete({ where: { id: photo.id } });
        await tx.vehiclePrivateFile.updateMany({
          where: { id: photo.privateFileId, tenantId, vehicleId: handover.vehicleId },
          data: { status: PRIVATE_FILE_STATUS.DELETED, deletedAt: new Date() },
        });
        await this.audit.record(
          {
            tenantId,
            actorUserId: userId,
            actorScope: 'tenant',
            action: 'booking.handover.photo.remove',
            targetType: 'vehicle_handover',
            targetId: handover.id,
            before: { slot },
          },
          tx,
        );
      });
    }

    return this.read(
      tenantId,
      bookingId,
      type,
      handoverEnergyKind(booking.vehicle.fuelType),
      scope,
    );
  }

  /**
   * Phát signed URL ngắn hạn cho MỘT ảnh. Ảnh phải thuộc đúng biên bản của đúng đơn của đúng
   * tenant — id lạ là 404, không phân biệt "không có" với "của người khác" (chống IDOR).
   */
  async downloadPhoto(
    tenantId: string,
    bookingId: string,
    type: HandoverType,
    fileId: string,
  ): Promise<SourceContractDownloadDto> {
    const handover = await this.requireActive(tenantId, bookingId, type);
    const photo = handover.photos.find((row) => row.privateFileId === fileId);
    if (!photo) throw photoNotFound();
    return this.files.downloadFor(
      tenantId,
      handover.vehicleId,
      photo.privateFileId,
      PRIVATE_FILE_PURPOSE.HANDOVER_PHOTO,
    );
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  private async requireBooking(tenantId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, tenantId, deletedAt: null },
      select: {
        id: true,
        code: true,
        status: true,
        vehicleId: true,
        pickupAt: true,
        returnAt: true,
        // Lượt nhận lại xe ghi phụ phí (luật danh mục theo dịch vụ) và phiếu thu (gắn hồ sơ khách).
        serviceType: true,
        tenantCustomerId: true,
        vehicle: { select: { name: true, plateNumber: true, fuelType: true, vehicleType: true } },
      },
    });
    if (!booking) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy đơn thuê',
      });
    }
    return booking;
  }

  private findActive(
    tenantId: string,
    bookingId: string,
    type: HandoverType,
  ): Promise<HandoverRow | null> {
    return this.prisma.vehicleHandover.findFirst({
      where: { tenantId, bookingId, type, status: { not: HANDOVER_STATUS.CANCELED } },
      include: PHOTO_INCLUDE,
    });
  }

  /**
   * Dựng biên bản rỗng ngay trước khi xác nhận — luồng nhanh Wave 10 không bắt tạo nháp trước.
   *
   * Hai người cùng bấm: partial unique chặn bản thứ hai, người thua đọc lại bản của người thắng
   * rồi đi tiếp bình thường (điều kiện `status` trong UPDATE mới là chỗ chống xác nhận đôi).
   */
  /**
   * Tự kết luận các case `handover_unconfirmed` còn mở của đơn khi biên bản GIAO XE được xác nhận
   * (ADR 0066, lớp 3). Chỉ loại đó: tranh chấp (`dispute`) của khách — kể cả "chưa nhận được xe" —
   * KHÔNG BAO GIỜ tự đóng theo đường này, vì chủ xe xác nhận giao không phải bằng chứng khách đã
   * nhận; nó vẫn chờ nhân sự nền tảng phân xử.
   *
   * Ghi như một lượt kết luận của `SupportService.resolve`: trạng thái `resolved` + `resolution`,
   * một sự kiện RESOLUTION công khai trên dòng thời gian, và audit `support_case.resolve` mang
   * `reason = handover_confirmed`. Người thao tác là người vừa xác nhận biên bản — không có nhân
   * sự nào bấm, và sự kiện không được giả làm của nền tảng. `resolved` vẫn mở lại được
   * (`in_progress`) nếu CSKH thấy chưa ổn.
   */
  private async resolveHandoverUnconfirmedWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      bookingId: string;
      bookingCode: string;
      userId: string;
      /** Ai vừa xác nhận giao xe — chủ xe ở quầy, hay khách bấm "Đã nhận xe" (ADR 0081). */
      by: 'host' | 'customer';
    },
  ): Promise<void> {
    const open = await tx.supportCase.findMany({
      where: {
        bookingId: input.bookingId,
        ...openSupportCaseWhere([SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED]),
      },
      select: { id: true, status: true },
    });
    if (open.length === 0) return;

    const resolution =
      input.by === 'customer'
        ? `Tự động kết luận: khách đã xác nhận nhận xe của chuyến ${input.bookingCode} - ` +
          'chuyến đã diễn ra, không còn việc chờ xác minh bàn giao.'
        : `Tự động kết luận: chủ xe đã xác nhận biên bản giao xe của chuyến ${input.bookingCode} - ` +
          'chuyến đã diễn ra, không còn việc chờ xác minh bàn giao.';
    const party = input.by === 'customer' ? SUPPORT_PARTY.CUSTOMER : SUPPORT_PARTY.TENANT;
    const auditScope =
      input.by === 'customer' ? AUDIT_ACTOR_SCOPE.CUSTOMER : AUDIT_ACTOR_SCOPE.TENANT;
    const resolvedAt = new Date();
    for (const row of open) {
      // Điều kiện "còn mở" nằm trong UPDATE: nhân sự vừa đóng tay case này thì không ghi đè.
      const claimed = await tx.supportCase.updateMany({
        where: { id: row.id, status: { in: [...SUPPORT_CASE_STATUS_OPEN] } },
        data: { status: SUPPORT_CASE_STATUS.RESOLVED, resolution, resolvedAt },
      });
      if (claimed.count === 0) continue;

      await tx.supportCaseEvent.create({
        data: {
          id: newId(),
          caseId: row.id,
          actorUserId: input.userId,
          actorScope: party,
          kind: SUPPORT_CASE_EVENT_KIND.RESOLUTION,
          visibility: SUPPORT_EVENT_VISIBILITY.PUBLIC,
          body: resolution,
          fromStatus: row.status,
          toStatus: SUPPORT_CASE_STATUS.RESOLVED,
        },
      });
      await this.audit.record(
        {
          tenantId: input.tenantId,
          actorUserId: input.userId,
          actorScope: auditScope,
          action: SUPPORT_CASE_AUDIT_ACTION.RESOLVE,
          targetType: AUDIT_TARGET_TYPE.SUPPORT_CASE,
          targetId: row.id,
          before: { status: row.status },
          after: {
            status: SUPPORT_CASE_STATUS.RESOLVED,
            resolution,
            bookingId: input.bookingId,
            reason: SUPPORT_CASE_AUTO_RESOLVE_REASON.HANDOVER_CONFIRMED,
          },
        },
        tx,
      );
    }
  }

  private async createForConfirm(
    tenantId: string,
    bookingId: string,
    vehicleId: string,
    type: HandoverType,
    userId: string,
  ): Promise<HandoverRow> {
    try {
      await this.prisma.vehicleHandover.create({
        data: {
          id: newId(),
          tenantId,
          bookingId,
          vehicleId,
          type,
          status: HANDOVER_STATUS.DRAFT,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    return this.requireActive(tenantId, bookingId, type);
  }

  private async requireActive(
    tenantId: string,
    bookingId: string,
    type: HandoverType,
  ): Promise<HandoverRow> {
    const row = await this.findActive(tenantId, bookingId, type);
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Chưa có biên bản bàn giao cho bước này',
      });
    }
    return row;
  }

  private async read(
    tenantId: string,
    bookingId: string,
    type: HandoverType,
    energyKind: string,
    scope: HandoverViewScope,
  ): Promise<HandoverDto> {
    const row = await this.requireActive(tenantId, bookingId, type);
    return toDto(row, energyKind, scope, await this.actorNames([row]));
  }

  /** KM chốt ở biên bản GIAO XE đã xác nhận — mốc sàn của KM trả. */
  private async confirmedPickupKm(
    tenantId: string,
    bookingId: string,
    type: HandoverType,
  ): Promise<number | null> {
    if (type !== HANDOVER_TYPE.RETURN) return null;
    const pickup = await this.prisma.vehicleHandover.findFirst({
      where: {
        tenantId,
        bookingId,
        type: HANDOVER_TYPE.PICKUP,
        status: HANDOVER_STATUS.CONFIRMED,
      },
      select: { odometerKm: true },
    });
    return pickup?.odometerKm ?? null;
  }

  private async actorNames(rows: HandoverRow[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((row) => row.confirmedBy).filter(Boolean))] as string[];
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((user) => [user.id, user.displayName]));
  }

  /**
   * Ngưỡng "KM nghi ngờ" (KM/ngày) đang hiệu lực — CHỈ từ cấu hình gian hàng
   * `tenant_profiles.settings_json.handoverSuspiciousKmPerDay`. Không có mặc định nền tảng:
   * quãng đường hợp lý mỗi ngày khác nhau quá xa giữa các loại xe, một con số tự đặt sẽ
   * hoặc kêu oan liên tục hoặc không bao giờ kêu. Chưa cấu hình → `null` → KHÔNG kiểm.
   */
  private async suspiciousKmPerDay(tenantId: string): Promise<number | null> {
    const profile = await this.prisma.tenantProfile.findUnique({
      where: { tenantId },
      select: { settings: true },
    });
    const settings = profile?.settings as Record<string, unknown> | null;
    const value = settings?.[HANDOVER_SUSPICIOUS_KM_PER_DAY_SETTING];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  }
}

// ── Mapping ──────────────────────────────────────────────────────────────────

function toDto(
  row: HandoverRow,
  energyKind: string,
  scope: HandoverViewScope,
  nameByUserId: Map<string, string>,
): HandoverDto {
  return {
    id: row.id,
    bookingId: row.bookingId,
    vehicleId: row.vehicleId,
    type: row.type,
    status: row.status,
    odometerKm: row.odometerKm,
    odometerMissing: row.odometerMissing,
    suspiciousAcknowledged: row.suspiciousAcknowledged,
    energyKind,
    fuelLevel: row.fuelLevel,
    batteryPercent: row.batteryPercent,
    condition: row.condition,
    conditionNote: row.conditionNote,
    damageNote: row.damageNote,
    notes: row.notes,
    photos: row.photos.map((photo) => ({
      slot: photo.slot,
      uploadedAt: photo.createdAt.toISOString(),
      // Định danh file và tên file chỉ lộ cho người có quyền mở bằng chứng. Người vận hành
      // vẫn thấy góc nào đã có ảnh — đủ để biết còn thiếu gì mà không cầm được khoá kho.
      ...(scope.canViewFiles
        ? { fileId: photo.privateFileId, name: photo.privateFile.originalName }
        : {}),
    })),
    occurredAt: row.occurredAt?.toISOString() ?? null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    confirmedByName: row.confirmedBy ? (nameByUserId.get(row.confirmedBy) ?? null) : null,
    confirmSource: row.confirmSource,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    rowVersion: row.rowVersion,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * `undefined` = không đụng tới; `null` = xoá giá trị. Không nhập nhằng hai thứ đó.
 *
 * Đặt một loại năng lượng thì XOÁ loại kia: `vh_energy_exclusive` ở DB không cho tồn tại
 * bản ghi vừa khai xăng vừa khai pin, và đổi loại nhiên liệu của xe giữa chừng là chuyện có
 * thật (nhập sai rồi sửa).
 */
function patchOf(dto: SaveHandoverDto) {
  return {
    ...(dto.odometerKm !== undefined ? { odometerKm: dto.odometerKm } : {}),
    ...(dto.fuelLevel !== undefined
      ? { fuelLevel: dto.fuelLevel, ...(dto.fuelLevel ? { batteryPercent: null } : {}) }
      : {}),
    ...(dto.batteryPercent !== undefined
      ? {
          batteryPercent: dto.batteryPercent,
          ...(dto.batteryPercent != null ? { fuelLevel: null } : {}),
        }
      : {}),
    ...(dto.condition !== undefined ? { condition: dto.condition } : {}),
    ...(dto.conditionNote !== undefined ? { conditionNote: trimOrNull(dto.conditionNote) } : {}),
    ...(dto.damageNote !== undefined ? { damageNote: trimOrNull(dto.damageNote) } : {}),
    ...(dto.notes !== undefined ? { notes: trimOrNull(dto.notes) } : {}),
  };
}

function confirmedOdometerKm(row: HandoverRow | null): number | null {
  return row && row.status === HANDOVER_STATUS.CONFIRMED ? row.odometerKm : null;
}

function sourceOf(type: HandoverType): OdometerSource {
  return type === HANDOVER_TYPE.PICKUP
    ? ODOMETER_SOURCE.BOOKING_PICKUP
    : ODOMETER_SOURCE.BOOKING_RETURN;
}

/** Số ngày thuê theo đơn — làm tròn lên, tối thiểu 1 (thuê 4 tiếng vẫn là 1 ngày sử dụng). */
function rentalDaysOf(pickupAt: Date, returnAt: Date): number {
  return Math.max(1, Math.ceil((returnAt.getTime() - pickupAt.getTime()) / DAY_MS));
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// ── Lỗi ──────────────────────────────────────────────────────────────────────

/** Nội bộ: UPDATE có điều kiện không khớp dòng nào → thoát transaction để xử lý ở ngoài. */
class HandoverClaimLost extends Error {}

function assertEnergyInput(dto: SaveHandoverDto, energyKind: string): void {
  const fields: { field: string; message: string }[] = [];
  if (energyKind === HANDOVER_ENERGY_KIND.BATTERY && dto.fuelLevel) {
    fields.push({ field: 'fuelLevel', message: 'Xe điện ghi % pin, không ghi mức nhiên liệu' });
  }
  if (energyKind === HANDOVER_ENERGY_KIND.FUEL && dto.batteryPercent != null) {
    fields.push({ field: 'batteryPercent', message: 'Xe động cơ đốt trong ghi mức nhiên liệu' });
  }
  if (fields.length > 0) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Thông tin năng lượng không khớp loại xe',
      details: { fields },
    });
  }
}

/*
 * Wave 10 đã BỎ `assertRequiredPhotos`: ảnh hiện trạng là tuỳ chọn (docs/design/14 §2).
 *
 * Bắt đủ góc cho MỌI chuyến biến một việc 10 giây ở quầy thành một biểu mẫu, và kết quả thực
 * tế là nhân viên chụp bừa cho qua — bằng chứng tệ hơn không có. Ai cần bằng chứng chặt thì
 * mở `Ghi nhận hiện trạng`; ảnh cũ vẫn đọc được bình thường.
 */

function belowPickup(pickupKm: number, odometerKm: number): BadRequestException {
  return new BadRequestException({
    code: API_ERROR_CODE.HANDOVER_ODOMETER_BELOW_PICKUP,
    message: `KM nhận lại (${odometerKm}) không được nhỏ hơn KM lúc giao (${pickupKm})`,
    details: { pickupKm, odometerKm, deltaKm: odometerKm - pickupKm },
  });
}

function notEligible(type: HandoverType, bookingStatus: string): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.HANDOVER_NOT_ELIGIBLE,
    message: 'Đơn không còn ở trạng thái thực hiện được bước bàn giao này',
    details: { type, bookingStatus },
  });
}

function readOnly(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
    message: 'Biên bản đã xác nhận - chỉ đọc. Sai số KM thì dùng chức năng điều chỉnh có lý do.',
  });
}

/**
 * Ảnh chỉ bị khoá khi biên bản ĐÃ HUỶ — biên bản đã xác nhận vẫn đính bổ sung được
 * (`canAttachHandoverPhoto`, xem docblock ở `@xeprime/types`).
 */
function photoLocked(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
    message: 'Biên bản đã huỷ - không đính thêm ảnh được',
  });
}

function stale(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.CONFLICT,
    message: 'Biên bản vừa được người khác cập nhật - tải lại rồi thử lại',
  });
}

function photoNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy ảnh hiện trạng',
  });
}

/** Prisma 7 làm hỏng `instanceof` — nhận diện lỗi theo mã như các module khác trong kho. */

/**
 * Góc chụp phải thuộc bộ góc của LOẠI XE (`handoverPhotoSlotsFor`): xe máy không có ảnh trái/phải.
 * Chặn ở API chứ không chỉ ẩn ô trên giao diện — một client cũ vẫn gửi được góc đó.
 */
function assertSlotForVehicle(vehicleType: string, slot: string): void {
  if (!isHandoverPhotoSlotFor(vehicleType, slot)) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Góc chụp này không áp dụng cho loại xe của đơn',
      details: { slot, vehicleType },
    });
  }
}
