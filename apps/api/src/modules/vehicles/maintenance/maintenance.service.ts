import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  MAINTENANCE_DUE_SOON_KM_DEFAULT,
  MAINTENANCE_DUE_STATUS,
  MAINTENANCE_STATUS,
  MAINTENANCE_STATUS_HOLDING_SCHEDULE,
  MAINTENANCE_TYPE,
  MAINTENANCE_TYPES_RESET_OIL_CHANGE,
  OCCUPANCY_SOURCE_TYPE,
  ODOMETER_SOURCE,
  PRIVATE_FILE_PURPOSE,
  PRIVATE_FILE_STATUS,
  isMaintenanceTransitionAllowed,
  vehicleMaintenanceSchedule,
  type MaintenanceDueStatus,
  type MaintenanceStatus,
  type MaintenanceType,
  type PaginationMeta,
} from '@xeprime/types';
import { AuditService } from '../../audit/audit.service';
import { OccupancyService } from '../../calendar/occupancy.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { VehicleContractsService } from '../vehicle-contracts.service';
import { OdometerService } from './odometer.service';
import {
  CompleteMaintenanceDto,
  MaintenanceBoardItemDto,
  MaintenanceBoardQueryDto,
  MaintenanceBoardSummaryDto,
  MaintenanceProfileDto,
  MaintenanceRecordDto,
  PresignMaintenanceFileDto,
  SaveMaintenanceProfileDto,
  SaveMaintenanceRecordDto,
} from './dto/vehicle-maintenance.dto';
import { SourceContractDownloadDto, SourceContractPresignDto } from '../dto/vehicle-source.dto';

/** Người gọi thấy được gì — controller kiểm quyền rồi truyền xuống, service không tự đọc. */
export interface MaintenanceViewScope {
  canViewCost: boolean;
  canViewFiles: boolean;
}

const DEFAULT_LIMIT = 20;

/**
 * Bảo dưỡng xe (Wave 6) — writer DUY NHẤT của `vehicle_maintenance_records` và của
 * occupancy loại `maintenance`. docs/design/12 §9.
 *
 * Nguyên tắc đóng đinh:
 *  - Lịch bảo dưỡng còn hiệu lực GIỮ CHỖ thật trên `vehicle_occupancies` (ADR 0006) — đặt xe
 *    trùng khoảng đó bị exclusion constraint chặn. Đổi nhãn `operation_status` là KHÔNG đủ và
 *    service này không dùng nhãn thay cho lịch.
 *  - Ghi lịch/nhả lịch luôn CÙNG transaction với việc đổi trạng thái phiếu; không có trạng
 *    thái "đã hủy nhưng vẫn chiếm lịch".
 *  - Chỉ phiếu THAY NHỚT hoàn tất mới dời mốc thay nhớt; sửa chữa/thay lốp thì không
 *    (`MAINTENANCE_TYPES_RESET_OIL_CHANGE`).
 *  - Mọi thay đổi KM đi qua `OdometerService` — không ghi thẳng cột KM ở đây.
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occupancy: OccupancyService,
    private readonly odometer: OdometerService,
    private readonly files: VehicleContractsService,
    private readonly audit: AuditService,
  ) {}

  // ── Hồ sơ bảo dưỡng của một xe ────────────────────────────────────────────

  async getProfile(tenantId: string, vehicleId: string): Promise<MaintenanceProfileDto> {
    await this.assertVehicle(tenantId, vehicleId);
    const [profile, dueSoonKm] = await Promise.all([
      this.prisma.vehicleMaintenanceProfile.findUnique({ where: { vehicleId } }),
      this.dueSoonKm(tenantId),
    ]);
    const refLabel = profile?.currentOdometerReadingId
      ? await this.odometerRefLabel(profile.currentOdometerReadingId)
      : null;
    return toProfileDto(profile, dueSoonKm, refLabel);
  }

  /** Lưu cấu hình chu kỳ. KM hiện tại KHÔNG sửa được ở đây — phải đi đường điều chỉnh có lý do. */
  async saveProfile(
    tenantId: string,
    vehicleId: string,
    userId: string,
    dto: SaveMaintenanceProfileDto,
  ): Promise<MaintenanceProfileDto> {
    await this.assertVehicle(tenantId, vehicleId);

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.vehicleMaintenanceProfile.findUnique({ where: { vehicleId } });
      const patch = {
        ...(dto.oilChangeIntervalKm !== undefined
          ? { oilChangeIntervalKm: dto.oilChangeIntervalKm }
          : {}),
        ...(dto.lastServiceKm !== undefined ? { lastServiceKm: dto.lastServiceKm } : {}),
        ...(dto.lastServiceAt !== undefined ? { lastServiceAt: toDate(dto.lastServiceAt) } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      };

      if (!current) {
        await tx.vehicleMaintenanceProfile.create({
          data: { vehicleId, tenantId, ...patch },
        });
      } else {
        if (dto.expectedRowVersion == null) {
          throw new BadRequestException({
            code: API_ERROR_CODE.VALIDATION_FAILED,
            message: 'Thiếu expectedRowVersion — cần cho phát hiện sửa đè',
          });
        }
        // Optimistic concurrency: 0 dòng khớp = ai đó vừa lưu bản khác.
        const result = await tx.vehicleMaintenanceProfile.updateMany({
          where: { vehicleId, tenantId, rowVersion: dto.expectedRowVersion },
          data: { ...patch, rowVersion: { increment: 1 } },
        });
        if (result.count === 0) throw staleProfile();
      }

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'vehicle.maintenance.config.update',
          targetType: 'vehicle',
          targetId: vehicleId,
          before: current
            ? {
                oilChangeIntervalKm: current.oilChangeIntervalKm,
                lastServiceKm: current.lastServiceKm,
              }
            : null,
          after: {
            oilChangeIntervalKm: patch.oilChangeIntervalKm ?? current?.oilChangeIntervalKm ?? null,
            lastServiceKm: patch.lastServiceKm ?? current?.lastServiceKm ?? null,
          },
        },
        tx,
      );
    });

    return this.getProfile(tenantId, vehicleId);
  }

  // ── Phiếu bảo dưỡng của một xe ────────────────────────────────────────────

  async listForVehicle(
    tenantId: string,
    vehicleId: string,
    scope: MaintenanceViewScope,
  ): Promise<MaintenanceRecordDto[]> {
    await this.assertVehicle(tenantId, vehicleId);
    const rows = await this.prisma.vehicleMaintenanceRecord.findMany({
      where: { tenantId, vehicleId },
      include: RECORD_INCLUDE,
      orderBy: [{ completedAt: 'desc' }, { plannedStartAt: 'desc' }, { createdAt: 'desc' }],
      // Lịch sử một xe hữu hạn trong thực tế; chặn trần để một xe bất thường không kéo sập trang.
      take: 200,
    });
    return rows.map((row) => toRecordDto(row, scope));
  }

  async createRecord(
    tenantId: string,
    vehicleId: string,
    userId: string,
    dto: SaveMaintenanceRecordDto,
    scope: MaintenanceViewScope,
  ): Promise<MaintenanceRecordDto> {
    await this.assertVehicle(tenantId, vehicleId);
    assertRecordInput(dto);

    const id = newId();
    const plannedStartAt = toDateTime(dto.plannedStartAt);
    const plannedEndAt = toDateTime(dto.plannedEndAt);

    await this.runWithScheduleConflict(vehicleId, plannedStartAt, plannedEndAt, async () => {
      await this.prisma.$transaction(async (tx) => {
        await tx.vehicleMaintenanceRecord.create({
          data: {
            id,
            tenantId,
            vehicleId,
            type: dto.type,
            customTypeName: dto.type === MAINTENANCE_TYPE.OTHER ? trimOrNull(dto.customTypeName) : null,
            title: trimOrNull(dto.title),
            status: MAINTENANCE_STATUS.SCHEDULED,
            plannedStartAt,
            plannedEndAt,
            odometerKm: dto.odometerKm ?? null,
            providerName: trimOrNull(dto.providerName),
            cost: dto.cost ?? null,
            receiptCode: trimOrNull(dto.receiptCode),
            notes: trimOrNull(dto.notes),
            createdBy: userId,
            updatedBy: userId,
          },
        });

        await this.attachFiles(tx, tenantId, vehicleId, id, userId, dto.attachmentFileIds ?? []);

        // Có khoảng thời gian → giữ chỗ THẬT trên lịch xe (ADR 0006), không chỉ đổi nhãn.
        if (plannedStartAt && plannedEndAt) {
          await this.occupancy.reserve(tx, {
            tenantId,
            vehicleId,
            sourceType: OCCUPANCY_SOURCE_TYPE.MAINTENANCE,
            sourceId: id,
            startAt: plannedStartAt,
            endAt: plannedEndAt,
          });
        }

        await this.audit.record(
          {
            tenantId,
            actorUserId: userId,
            actorScope: 'tenant',
            action: 'vehicle.maintenance.create',
            targetType: 'vehicle_maintenance_record',
            targetId: id,
            after: {
              vehicleId,
              type: dto.type,
              plannedStartAt: plannedStartAt?.toISOString() ?? null,
              plannedEndAt: plannedEndAt?.toISOString() ?? null,
            },
          },
          tx,
        );
      });
    });

    return this.readRecord(tenantId, vehicleId, id, scope);
  }

  async updateRecord(
    tenantId: string,
    vehicleId: string,
    userId: string,
    recordId: string,
    dto: SaveMaintenanceRecordDto,
    scope: MaintenanceViewScope,
  ): Promise<MaintenanceRecordDto> {
    await this.assertVehicle(tenantId, vehicleId);
    assertRecordInput(dto);
    if (dto.expectedRowVersion == null) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Thiếu expectedRowVersion — cần cho phát hiện sửa đè',
      });
    }

    const current = await this.requireRecord(tenantId, vehicleId, recordId);
    if (isClosed(current.status as MaintenanceStatus)) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Phiếu đã hoàn tất hoặc đã hủy — không sửa được nữa',
      });
    }

    const plannedStartAt =
      dto.plannedStartAt !== undefined ? toDateTime(dto.plannedStartAt) : current.plannedStartAt;
    const plannedEndAt =
      dto.plannedEndAt !== undefined ? toDateTime(dto.plannedEndAt) : current.plannedEndAt;

    await this.runWithScheduleConflict(vehicleId, plannedStartAt, plannedEndAt, async () => {
      await this.prisma.$transaction(async (tx) => {
        const result = await tx.vehicleMaintenanceRecord.updateMany({
          where: { id: recordId, tenantId, vehicleId, rowVersion: dto.expectedRowVersion! },
          data: {
            type: dto.type,
            customTypeName:
              dto.type === MAINTENANCE_TYPE.OTHER ? trimOrNull(dto.customTypeName) : null,
            ...(dto.title !== undefined ? { title: trimOrNull(dto.title) } : {}),
            plannedStartAt,
            plannedEndAt,
            ...(dto.odometerKm !== undefined ? { odometerKm: dto.odometerKm } : {}),
            ...(dto.providerName !== undefined
              ? { providerName: trimOrNull(dto.providerName) }
              : {}),
            ...(dto.cost !== undefined ? { cost: dto.cost } : {}),
            ...(dto.receiptCode !== undefined ? { receiptCode: trimOrNull(dto.receiptCode) } : {}),
            ...(dto.notes !== undefined ? { notes: trimOrNull(dto.notes) } : {}),
            updatedBy: userId,
            rowVersion: { increment: 1 },
          },
        });
        if (result.count === 0) throw staleRecord();

        if (dto.attachmentFileIds !== undefined) {
          await this.replaceAttachments(
            tx,
            tenantId,
            vehicleId,
            recordId,
            userId,
            dto.attachmentFileIds,
          );
        }

        // Lịch đổi → dời/nhả/giữ chỗ tương ứng, cùng transaction với phiếu.
        await this.syncOccupancy(tx, {
          tenantId,
          vehicleId,
          recordId,
          status: current.status as MaintenanceStatus,
          hadSchedule: Boolean(current.plannedStartAt && current.plannedEndAt),
          startAt: plannedStartAt,
          endAt: plannedEndAt,
        });

        await this.audit.record(
          {
            tenantId,
            actorUserId: userId,
            actorScope: 'tenant',
            action: 'vehicle.maintenance.update',
            targetType: 'vehicle_maintenance_record',
            targetId: recordId,
            before: {
              plannedStartAt: current.plannedStartAt?.toISOString() ?? null,
              plannedEndAt: current.plannedEndAt?.toISOString() ?? null,
              status: current.status,
            },
            after: {
              plannedStartAt: plannedStartAt?.toISOString() ?? null,
              plannedEndAt: plannedEndAt?.toISOString() ?? null,
            },
          },
          tx,
        );
      });
    });

    return this.readRecord(tenantId, vehicleId, recordId, scope);
  }

  /** Bắt đầu thực hiện — giữ nguyên chỗ đã đặt trên lịch, chỉ đổi trạng thái. */
  async startRecord(
    tenantId: string,
    vehicleId: string,
    userId: string,
    recordId: string,
    expectedRowVersion: number,
    scope: MaintenanceViewScope,
  ): Promise<MaintenanceRecordDto> {
    await this.transition(tenantId, vehicleId, userId, recordId, expectedRowVersion, {
      to: MAINTENANCE_STATUS.IN_PROGRESS,
      action: 'vehicle.maintenance.start',
    });
    return this.readRecord(tenantId, vehicleId, recordId, scope);
  }

  /**
   * Hoàn tất phiếu — MỘT transaction cho tất cả: đổi trạng thái, nhả chỗ trên lịch, ghi KM
   * (qua OdometerService), và CHỈ với phiếu thay nhớt thì dời mốc thay nhớt. Fail ở bất kỳ
   * bước nào → rollback trọn gói, phiếu vẫn ở trạng thái cũ và lịch vẫn nguyên.
   */
  async completeRecord(
    tenantId: string,
    vehicleId: string,
    userId: string,
    recordId: string,
    dto: CompleteMaintenanceDto,
    scope: MaintenanceViewScope,
  ): Promise<MaintenanceRecordDto> {
    await this.assertVehicle(tenantId, vehicleId);
    const current = await this.requireRecord(tenantId, vehicleId, recordId);
    assertTransition(current.status as MaintenanceStatus, MAINTENANCE_STATUS.COMPLETED);

    const completedAt = toDateTime(dto.completedAt) ?? new Date();
    const odometerKm = dto.odometerKm ?? current.odometerKm ?? null;

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.vehicleMaintenanceRecord.updateMany({
        where: { id: recordId, tenantId, vehicleId, rowVersion: dto.expectedRowVersion },
        data: {
          status: MAINTENANCE_STATUS.COMPLETED,
          completedAt,
          ...(dto.odometerKm !== undefined ? { odometerKm: dto.odometerKm } : {}),
          ...(dto.cost !== undefined ? { cost: dto.cost } : {}),
          ...(dto.receiptCode !== undefined ? { receiptCode: trimOrNull(dto.receiptCode) } : {}),
          ...(dto.notes !== undefined ? { notes: trimOrNull(dto.notes) } : {}),
          updatedBy: userId,
          rowVersion: { increment: 1 },
        },
      });
      if (result.count === 0) throw staleRecord();

      // Xong việc thì trả lịch — xe nhận đơn lại được ngay, không phải chờ ai dọn tay.
      await this.occupancy.release(tx, OCCUPANCY_SOURCE_TYPE.MAINTENANCE, recordId);

      if (odometerKm !== null) {
        // KM đi qua OdometerService: append lịch sử + chặn tụt số + audit riêng.
        await this.odometer.record(tx, {
          tenantId,
          vehicleId,
          userId,
          odometerKm,
          source: ODOMETER_SOURCE.MAINTENANCE,
          sourceRefId: recordId,
        });
      }

      // CHỈ thay nhớt mới dời mốc thay nhớt — sửa chữa/thay lốp hoàn tất không đụng tới nó.
      if (MAINTENANCE_TYPES_RESET_OIL_CHANGE.includes(current.type as MaintenanceType)) {
        const lastServiceFields = {
          ...(odometerKm !== null ? { lastServiceKm: odometerKm } : {}),
          lastServiceAt: startOfUtcDay(completedAt),
        };
        const updated = await tx.vehicleMaintenanceProfile.updateMany({
          where: { vehicleId, tenantId },
          data: { ...lastServiceFields, rowVersion: { increment: 1 } },
        });
        if (updated.count === 0) {
          await tx.vehicleMaintenanceProfile.create({
            data: { vehicleId, tenantId, ...lastServiceFields },
          });
        }
      }

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'vehicle.maintenance.complete',
          targetType: 'vehicle_maintenance_record',
          targetId: recordId,
          before: { status: current.status },
          after: {
            status: MAINTENANCE_STATUS.COMPLETED,
            completedAt: completedAt.toISOString(),
            odometerKm,
            resetOilChange: MAINTENANCE_TYPES_RESET_OIL_CHANGE.includes(
              current.type as MaintenanceType,
            ),
          },
        },
        tx,
      );
    });

    return this.readRecord(tenantId, vehicleId, recordId, scope);
  }

  /** Hủy lịch — NHẢ chỗ trên lịch xe trong cùng transaction (yêu cầu Wave 6 §3). */
  async cancelRecord(
    tenantId: string,
    vehicleId: string,
    userId: string,
    recordId: string,
    expectedRowVersion: number,
    scope: MaintenanceViewScope,
  ): Promise<MaintenanceRecordDto> {
    await this.transition(tenantId, vehicleId, userId, recordId, expectedRowVersion, {
      to: MAINTENANCE_STATUS.CANCELED,
      action: 'vehicle.maintenance.cancel',
      releaseSchedule: true,
    });
    return this.readRecord(tenantId, vehicleId, recordId, scope);
  }

  // ── Cảnh báo đến hạn sinh ra từ nghiệp vụ khác ────────────────────────────

  /**
   * Sau khi KM của xe vừa nhảy (bàn giao trả xe đã xác nhận — Wave 7), tính lại mốc bảo dưỡng
   * và mở MỘT phiếu chờ nếu xe đã tới/quá hạn. Chạy TRONG transaction của bên gọi để "KM mới"
   * và "cảnh báo bảo dưỡng" hoặc cùng có, hoặc cùng không.
   *
   * Idempotent: xe đang có phiếu mở (`scheduled`/`in_progress`) thì không mở thêm — trả xe
   * mười chuyến liên tiếp vẫn chỉ một việc cần làm, không phải mười phiếu rác.
   *
   * Phiếu sinh ra CỐ Ý không có khoảng thời gian: đây là việc-cần-xếp-lịch, chưa phải lịch.
   * Có mốc thời gian mới giữ chỗ trên `vehicle_occupancies` — tự ý khoá xe của khách vì một
   * cảnh báo là hành vi không ai cho phép.
   */
  async ensureDueTaskWithinTx(
    tx: Prisma.TransactionClient,
    args: { tenantId: string; vehicleId: string; userId: string; reason: string },
  ): Promise<{ recordId: string; dueStatus: MaintenanceDueStatus } | null> {
    const profile = await tx.vehicleMaintenanceProfile.findUnique({
      where: { vehicleId: args.vehicleId },
      select: { currentOdometerKm: true, lastServiceKm: true, oilChangeIntervalKm: true },
    });
    if (!profile) return null;

    const schedule = vehicleMaintenanceSchedule({
      currentKm: profile.currentOdometerKm,
      lastServiceKm: profile.lastServiceKm,
      intervalKm: profile.oilChangeIntervalKm,
      dueSoonKm: await this.dueSoonKm(args.tenantId, tx),
    });
    const needsTask =
      schedule.status === MAINTENANCE_DUE_STATUS.OVERDUE ||
      schedule.status === MAINTENANCE_DUE_STATUS.DUE_SOON;
    if (!needsTask) return null;

    const open = await tx.vehicleMaintenanceRecord.findFirst({
      where: {
        tenantId: args.tenantId,
        vehicleId: args.vehicleId,
        status: { in: [...MAINTENANCE_STATUS_HOLDING_SCHEDULE] },
      },
      select: { id: true },
    });
    if (open) return { recordId: open.id, dueStatus: schedule.status };

    const id = newId();
    await tx.vehicleMaintenanceRecord.create({
      data: {
        id,
        tenantId: args.tenantId,
        vehicleId: args.vehicleId,
        type: MAINTENANCE_TYPE.OIL_CHANGE,
        title:
          schedule.status === MAINTENANCE_DUE_STATUS.OVERDUE
            ? `Quá hạn bảo dưỡng — ${args.reason}`
            : `Sắp đến hạn bảo dưỡng — ${args.reason}`,
        status: MAINTENANCE_STATUS.SCHEDULED,
        notes: schedule.nextMaintenanceKm
          ? `Mốc bảo dưỡng: ${schedule.nextMaintenanceKm} km · KM hiện tại: ${profile.currentOdometerKm} km`
          : null,
        createdBy: args.userId,
        updatedBy: args.userId,
      },
    });

    await this.audit.record(
      {
        tenantId: args.tenantId,
        actorUserId: args.userId,
        actorScope: 'tenant',
        action: 'vehicle.maintenance.due_task.create',
        targetType: 'vehicle_maintenance_record',
        targetId: id,
        after: {
          vehicleId: args.vehicleId,
          dueStatus: schedule.status,
          remainingKm: schedule.remainingKm,
          trigger: args.reason,
        },
      },
      tx,
    );

    return { recordId: id, dueStatus: schedule.status };
  }

  // ── Chứng từ riêng tư ─────────────────────────────────────────────────────

  async presignAttachment(
    tenantId: string,
    vehicleId: string,
    userId: string,
    recordId: string,
    dto: PresignMaintenanceFileDto,
  ): Promise<SourceContractPresignDto> {
    await this.assertVehicle(tenantId, vehicleId);
    await this.requireRecord(tenantId, vehicleId, recordId);
    return this.files.presignFor(tenantId, vehicleId, userId, dto, {
      purpose: PRIVATE_FILE_PURPOSE.MAINTENANCE_RECORD,
      keyOf: (vId, fileId, extension) =>
        `tenants/${tenantId}/vehicles/${vId}/maintenance/${recordId}/${fileId}.${extension}`,
    });
  }

  /** Hoàn tất upload (HEAD + magic bytes) rồi đính vào phiếu — cùng một transaction. */
  async attachUploadedFile(
    tenantId: string,
    vehicleId: string,
    userId: string,
    recordId: string,
    fileId: string,
    scope: MaintenanceViewScope,
  ): Promise<MaintenanceRecordDto> {
    await this.assertVehicle(tenantId, vehicleId);
    await this.requireRecord(tenantId, vehicleId, recordId);
    await this.files.completeFor(tenantId, vehicleId, userId, fileId, {
      purpose: PRIVATE_FILE_PURPOSE.MAINTENANCE_RECORD,
      auditAction: 'vehicle.maintenance.attachment.upload',
    });
    await this.prisma.$transaction(async (tx) => {
      await this.attachFiles(tx, tenantId, vehicleId, recordId, userId, [fileId]);
    });
    return this.readRecord(tenantId, vehicleId, recordId, scope);
  }

  async downloadAttachment(
    tenantId: string,
    vehicleId: string,
    recordId: string,
    fileId: string,
  ): Promise<SourceContractDownloadDto> {
    await this.assertVehicle(tenantId, vehicleId);
    // Chứng từ phải thuộc ĐÚNG phiếu của ĐÚNG xe — id lạ là 404, không phân biệt "không có"
    // với "của người khác" (chống IDOR, cùng kỷ luật Wave 4.1).
    const attachment = await this.prisma.vehicleMaintenanceAttachment.findFirst({
      where: { privateFileId: fileId, recordId, tenantId, vehicleId },
      select: { privateFileId: true },
    });
    if (!attachment) throw recordNotFound();
    return this.files.downloadFor(
      tenantId,
      vehicleId,
      attachment.privateFileId,
      PRIVATE_FILE_PURPOSE.MAINTENANCE_RECORD,
    );
  }

  // ── Trung tâm bảo dưỡng (toàn đội xe) ─────────────────────────────────────

  /**
   * Danh sách xe theo việc-cần-làm. Lọc/sắp xếp/phân trang CHẠY Ở DATABASE: trạng thái đến
   * hạn là biểu thức trên KM nên dùng SQL thật thay vì kéo cả đội xe về Node rồi cắt —
   * gian hàng vài trăm xe vẫn chỉ trả về một trang.
   */
  async board(
    tenantId: string,
    query: MaintenanceBoardQueryDto,
    scope: MaintenanceViewScope,
  ): Promise<{ data: MaintenanceBoardItemDto[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? DEFAULT_LIMIT));
    const dueSoonKm = await this.dueSoonKm(tenantId);
    const today = startOfUtcDay(new Date());

    const rows = await this.prisma.$queryRaw<BoardRow[]>`
      WITH scored AS (
        SELECT
          v.id, v.name, v.code, v.plate_number, v.operation_status, v.main_image_url, v.updated_at,
          p.current_odometer_km, p.current_odometer_at, p.oil_change_interval_km,
          p.last_service_km,
          CASE WHEN p.oil_change_interval_km IS NOT NULL AND p.last_service_km IS NOT NULL
               THEN p.last_service_km + p.oil_change_interval_km END AS next_km,
          CASE WHEN p.oil_change_interval_km IS NOT NULL AND p.last_service_km IS NOT NULL
                    AND p.current_odometer_km IS NOT NULL
               THEN p.last_service_km + p.oil_change_interval_km - p.current_odometer_km
          END AS remaining_km,
          ar.id AS active_record_id,
          ar.status AS active_record_status,
          ar.type AS active_record_type,
          ar.planned_start_at AS active_planned_start_at,
          lc.last_completed_at,
          COALESCE(doc.expiring_count, 0)::int AS expiring_document_count
        FROM vehicles v
        LEFT JOIN vehicle_maintenance_profiles p ON p.vehicle_id = v.id
        LEFT JOIN LATERAL (
          SELECT r.id, r.status, r.type, r.planned_start_at
          FROM vehicle_maintenance_records r
          WHERE r.vehicle_id = v.id AND r.status IN ('scheduled', 'in_progress')
          ORDER BY (r.status = 'in_progress') DESC, r.planned_start_at ASC NULLS LAST
          LIMIT 1
        ) ar ON true
        LEFT JOIN LATERAL (
          SELECT max(r2.completed_at) AS last_completed_at
          FROM vehicle_maintenance_records r2
          WHERE r2.vehicle_id = v.id AND r2.status = 'completed'
        ) lc ON true
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS expiring_count
          FROM vehicle_documents d
          WHERE d.vehicle_id = v.id AND d.archived_at IS NULL
            AND d.expires_at IS NOT NULL AND d.expires_at <= ${today}::date
        ) doc ON true
        WHERE v.tenant_id = ${tenantId}::char(26) AND v.deleted_at IS NULL
      ),
      classified AS (
        SELECT *, CASE
          WHEN remaining_km IS NULL THEN 'unknown'
          WHEN remaining_km <= 0 THEN 'overdue'
          WHEN remaining_km <= ${dueSoonKm} THEN 'due_soon'
          ELSE 'ok' END AS due_status
        FROM scored
      ),
      filtered AS (
        SELECT * FROM classified
        WHERE
          (${query.filter ?? 'all'} = 'all'
            OR (${query.filter ?? 'all'} = 'overdue' AND due_status = 'overdue')
            OR (${query.filter ?? 'all'} = 'due_soon' AND due_status = 'due_soon')
            OR (${query.filter ?? 'all'} = 'in_progress' AND active_record_status = 'in_progress')
            OR (${query.filter ?? 'all'} = 'missing_odometer' AND current_odometer_km IS NULL)
            OR (${query.filter ?? 'all'} = 'upcoming' AND active_record_status = 'scheduled')
            OR (${query.filter ?? 'all'} = 'history' AND last_completed_at IS NOT NULL))
          AND (${query.q ?? null}::text IS NULL
            OR name ILIKE '%' || ${query.q ?? ''} || '%'
            OR code ILIKE '%' || ${query.q ?? ''} || '%'
            OR coalesce(plate_number, '') ILIKE '%' || ${query.q ?? ''} || '%')
          AND (${query.type ?? null}::text IS NULL OR active_record_type = ${query.type ?? null})
          AND (${query.from ? new Date(query.from) : null}::timestamptz IS NULL
            OR active_planned_start_at >= ${query.from ? new Date(query.from) : null})
          AND (${query.to ? new Date(query.to) : null}::timestamptz IS NULL
            OR active_planned_start_at <= ${query.to ? new Date(query.to) : null})
      )
      SELECT *, count(*) OVER()::int AS total_count
      FROM filtered
      ORDER BY
        CASE WHEN ${query.sort ?? 'remaining_asc'} = 'remaining_asc'
             THEN remaining_km END ASC NULLS LAST,
        CASE WHEN ${query.sort ?? 'remaining_asc'} = 'remaining_desc'
             THEN remaining_km END DESC NULLS LAST,
        CASE WHEN ${query.sort ?? 'remaining_asc'} = 'name_asc' THEN name END ASC,
        CASE WHEN ${query.sort ?? 'remaining_asc'} = 'updated_desc' THEN updated_at END DESC,
        name ASC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`;

    const total = rows[0]?.total_count ?? 0;
    // Phiếu đang mở của đúng trang này — bounded theo `limit`, không phải N+1 toàn đội xe.
    const activeIds = rows.map((row) => row.active_record_id).filter(Boolean) as string[];
    const activeRecords = activeIds.length
      ? await this.prisma.vehicleMaintenanceRecord.findMany({
          where: { id: { in: activeIds }, tenantId },
          include: RECORD_INCLUDE,
        })
      : [];
    const recordById = new Map(activeRecords.map((row) => [row.id, toRecordDto(row, scope)]));

    return {
      data: rows.map((row) => toBoardItem(row, dueSoonKm, recordById)),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  /** Đếm theo từng nhóm việc — dải tab đầu trang, độc lập với trang/bộ lọc hiện tại. */
  async boardSummary(tenantId: string): Promise<MaintenanceBoardSummaryDto> {
    const dueSoonKm = await this.dueSoonKm(tenantId);
    const today = startOfUtcDay(new Date());
    const [row] = await this.prisma.$queryRaw<
      {
        total: number;
        overdue: number;
        due_soon: number;
        in_progress: number;
        missing_odometer: number;
        upcoming: number;
        expiring_documents: number;
      }[]
    >`
      WITH scored AS (
        SELECT
          v.id,
          p.current_odometer_km,
          CASE WHEN p.oil_change_interval_km IS NOT NULL AND p.last_service_km IS NOT NULL
                    AND p.current_odometer_km IS NOT NULL
               THEN p.last_service_km + p.oil_change_interval_km - p.current_odometer_km
          END AS remaining_km,
          ar.status AS active_status,
          COALESCE(doc.expiring_count, 0) AS expiring_count
        FROM vehicles v
        LEFT JOIN vehicle_maintenance_profiles p ON p.vehicle_id = v.id
        LEFT JOIN LATERAL (
          SELECT r.status FROM vehicle_maintenance_records r
          WHERE r.vehicle_id = v.id AND r.status IN ('scheduled', 'in_progress')
          ORDER BY (r.status = 'in_progress') DESC LIMIT 1
        ) ar ON true
        LEFT JOIN LATERAL (
          SELECT count(*) AS expiring_count FROM vehicle_documents d
          WHERE d.vehicle_id = v.id AND d.archived_at IS NULL
            AND d.expires_at IS NOT NULL AND d.expires_at <= ${today}::date
        ) doc ON true
        WHERE v.tenant_id = ${tenantId}::char(26) AND v.deleted_at IS NULL
      )
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE remaining_km IS NOT NULL AND remaining_km <= 0)::int AS overdue,
        count(*) FILTER (
          WHERE remaining_km IS NOT NULL AND remaining_km > 0 AND remaining_km <= ${dueSoonKm}
        )::int AS due_soon,
        count(*) FILTER (WHERE active_status = 'in_progress')::int AS in_progress,
        count(*) FILTER (WHERE current_odometer_km IS NULL)::int AS missing_odometer,
        count(*) FILTER (WHERE active_status = 'scheduled')::int AS upcoming,
        count(*) FILTER (WHERE expiring_count > 0)::int AS expiring_documents
      FROM scored`;

    return {
      total: row?.total ?? 0,
      overdue: row?.overdue ?? 0,
      dueSoon: row?.due_soon ?? 0,
      inProgress: row?.in_progress ?? 0,
      missingOdometer: row?.missing_odometer ?? 0,
      upcoming: row?.upcoming ?? 0,
      expiringDocuments: row?.expiring_documents ?? 0,
    };
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  /** Đổi trạng thái + (tuỳ chọn) nhả lịch, trong một transaction. */
  private async transition(
    tenantId: string,
    vehicleId: string,
    userId: string,
    recordId: string,
    expectedRowVersion: number,
    opts: { to: MaintenanceStatus; action: string; releaseSchedule?: boolean },
  ): Promise<void> {
    await this.assertVehicle(tenantId, vehicleId);
    const current = await this.requireRecord(tenantId, vehicleId, recordId);
    assertTransition(current.status as MaintenanceStatus, opts.to);

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.vehicleMaintenanceRecord.updateMany({
        where: { id: recordId, tenantId, vehicleId, rowVersion: expectedRowVersion },
        data: { status: opts.to, updatedBy: userId, rowVersion: { increment: 1 } },
      });
      if (result.count === 0) throw staleRecord();

      if (opts.releaseSchedule) {
        await this.occupancy.release(tx, OCCUPANCY_SOURCE_TYPE.MAINTENANCE, recordId);
      }

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: opts.action,
          targetType: 'vehicle_maintenance_record',
          targetId: recordId,
          before: { status: current.status },
          after: { status: opts.to },
        },
        tx,
      );
    });
  }

  /** Đồng bộ chỗ trên lịch theo khoảng thời gian mới của phiếu (giữ/dời/nhả). */
  private async syncOccupancy(
    tx: Prisma.TransactionClient,
    args: {
      tenantId: string;
      vehicleId: string;
      recordId: string;
      status: MaintenanceStatus;
      hadSchedule: boolean;
      startAt: Date | null;
      endAt: Date | null;
    },
  ): Promise<void> {
    const shouldHold =
      MAINTENANCE_STATUS_HOLDING_SCHEDULE.includes(args.status) &&
      Boolean(args.startAt && args.endAt);

    if (!shouldHold) {
      await this.occupancy.release(tx, OCCUPANCY_SOURCE_TYPE.MAINTENANCE, args.recordId);
      return;
    }
    if (args.hadSchedule) {
      await this.occupancy.reschedule(
        tx,
        OCCUPANCY_SOURCE_TYPE.MAINTENANCE,
        args.recordId,
        args.startAt!,
        args.endAt!,
      );
      return;
    }
    await this.occupancy.reserve(tx, {
      tenantId: args.tenantId,
      vehicleId: args.vehicleId,
      sourceType: OCCUPANCY_SOURCE_TYPE.MAINTENANCE,
      sourceId: args.recordId,
      startAt: args.startAt!,
      endAt: args.endAt!,
    });
  }

  /**
   * Chạy thao tác có ghi lịch và dịch va chạm của exclusion constraint (ADR 0006) thành
   * 409 kèm KHOẢNG bị trùng — người dùng cần biết vướng cái gì để đổi ngày, không phải một
   * dòng "lỗi hệ thống". Constraint vẫn là lớp bảo vệ; đây chỉ là lớp diễn giải.
   */
  private async runWithScheduleConflict(
    vehicleId: string,
    startAt: Date | null,
    endAt: Date | null,
    operation: () => Promise<void>,
  ): Promise<void> {
    try {
      await operation();
    } catch (err) {
      if (!isExclusionViolation(err) || !startAt || !endAt) throw err;
      const conflicts = await this.occupancy.findOverlapping(vehicleId, startAt, endAt);
      const detailed = await this.describeConflicts(conflicts);
      throw new ConflictException({
        code: API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT,
        message: 'Xe đã có lịch khác trùng khoảng thời gian này',
        details: { conflicts: detailed },
      });
    }
  }

  /** Khoảng bị trùng kèm nhãn nguồn — đủ để UI nói "vướng đơn nào / lịch nào". */
  private async describeConflicts(
    conflicts: Array<{ id: string; sourceType: string; sourceId: string }>,
  ): Promise<Array<{ sourceType: string; startAt: string; endAt: string; label: string }>> {
    if (conflicts.length === 0) return [];
    const rows = await this.prisma.vehicleOccupancy.findMany({
      where: { id: { in: conflicts.map((c) => c.id) } },
      select: { sourceType: true, sourceId: true, startAt: true, endAt: true },
      orderBy: { startAt: 'asc' },
    });
    const bookingIds = rows
      .filter((row) => row.sourceType === OCCUPANCY_SOURCE_TYPE.BOOKING)
      .map((row) => row.sourceId);
    const bookings = bookingIds.length
      ? await this.prisma.booking.findMany({
          where: { id: { in: bookingIds } },
          select: { id: true, code: true },
        })
      : [];
    const codeById = new Map(bookings.map((b) => [b.id, b.code]));

    return rows.map((row) => ({
      sourceType: row.sourceType,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      label:
        row.sourceType === OCCUPANCY_SOURCE_TYPE.BOOKING
          ? `Đơn thuê ${codeById.get(row.sourceId) ?? ''}`.trim()
          : row.sourceType === OCCUPANCY_SOURCE_TYPE.MAINTENANCE
            ? 'Lịch bảo dưỡng khác'
            : 'Xe bị khóa',
    }));
  }

  /** Đính file đã xác minh vào phiếu; DB chặn file của tenant/xe khác bằng composite FK. */
  private async attachFiles(
    tx: Prisma.TransactionClient,
    tenantId: string,
    vehicleId: string,
    recordId: string,
    userId: string,
    fileIds: string[],
  ): Promise<void> {
    if (fileIds.length === 0) return;
    const unique = [...new Set(fileIds)];
    const rows = await tx.vehiclePrivateFile.findMany({
      where: {
        id: { in: unique },
        tenantId,
        vehicleId,
        purpose: PRIVATE_FILE_PURPOSE.MAINTENANCE_RECORD,
        status: PRIVATE_FILE_STATUS.READY,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (rows.length !== unique.length) {
      const found = new Set(rows.map((row) => row.id));
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Chứng từ không hợp lệ hoặc chưa sẵn sàng để đính vào phiếu',
        details: { invalid: unique.filter((id) => !found.has(id)) },
      });
    }
    await tx.vehicleMaintenanceAttachment.createMany({
      data: unique.map((privateFileId) => ({
        id: newId(),
        tenantId,
        vehicleId,
        recordId,
        privateFileId,
        createdBy: userId,
      })),
      skipDuplicates: true,
    });
  }

  /** Thay toàn bộ danh sách chứng từ: file bị gỡ chuyển `deleted` (object không xoá tự động). */
  private async replaceAttachments(
    tx: Prisma.TransactionClient,
    tenantId: string,
    vehicleId: string,
    recordId: string,
    userId: string,
    fileIds: string[],
  ): Promise<void> {
    const existing = await tx.vehicleMaintenanceAttachment.findMany({
      where: { recordId, tenantId, vehicleId },
      select: { privateFileId: true },
    });
    const keep = new Set(fileIds);
    const removed = existing.map((row) => row.privateFileId).filter((id) => !keep.has(id));

    if (removed.length > 0) {
      await tx.vehicleMaintenanceAttachment.deleteMany({
        where: { recordId, tenantId, privateFileId: { in: removed } },
      });
      await tx.vehiclePrivateFile.updateMany({
        where: { id: { in: removed }, tenantId, vehicleId },
        data: { status: PRIVATE_FILE_STATUS.DELETED, deletedAt: new Date() },
      });
    }

    const existingIds = new Set(existing.map((row) => row.privateFileId));
    const added = fileIds.filter((id) => !existingIds.has(id));
    await this.attachFiles(tx, tenantId, vehicleId, recordId, userId, added);
  }

  private async readRecord(
    tenantId: string,
    vehicleId: string,
    recordId: string,
    scope: MaintenanceViewScope,
  ): Promise<MaintenanceRecordDto> {
    const row = await this.prisma.vehicleMaintenanceRecord.findFirst({
      where: { id: recordId, tenantId, vehicleId },
      include: RECORD_INCLUDE,
    });
    if (!row) throw recordNotFound();
    return toRecordDto(row, scope);
  }

  private async requireRecord(tenantId: string, vehicleId: string, recordId: string) {
    const row = await this.prisma.vehicleMaintenanceRecord.findFirst({
      where: { id: recordId, tenantId, vehicleId },
    });
    if (!row) throw recordNotFound();
    return row;
  }

  private async assertVehicle(tenantId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy xe',
      });
    }
  }

  /** Nhãn nguồn của lần ghi KM hiện tại — để header nói được "KM từ đơn nào". */
  private async odometerRefLabel(readingId: string): Promise<string | null> {
    const reading = await this.prisma.vehicleOdometerReading.findUnique({
      where: { id: readingId },
      select: { source: true, sourceRefId: true },
    });
    if (!reading?.sourceRefId) return null;
    if (
      reading.source === ODOMETER_SOURCE.BOOKING_RETURN ||
      reading.source === ODOMETER_SOURCE.BOOKING_PICKUP
    ) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: reading.sourceRefId },
        select: { code: true },
      });
      return booking ? `Đơn ${booking.code}` : null;
    }
    if (reading.source === ODOMETER_SOURCE.MAINTENANCE) {
      const record = await this.prisma.vehicleMaintenanceRecord.findUnique({
        where: { id: reading.sourceRefId },
        select: { type: true, customTypeName: true },
      });
      return record ? (record.customTypeName ?? 'Phiếu bảo dưỡng') : null;
    }
    return null;
  }

  /**
   * Ngưỡng "sắp đến hạn" (KM) đang hiệu lực: cấu hình gian hàng
   * `tenant_profiles.settings_json.maintenanceDueSoonKm`, không có thì dùng mặc định nền tảng
   * đã đặt tên ở `@xeprime/types` — KHÔNG có hằng số vô danh nằm trong UI.
   */
  private async dueSoonKm(
    tenantId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<number> {
    const profile = await db.tenantProfile.findUnique({
      where: { tenantId },
      select: { settings: true },
    });
    const settings = profile?.settings as { maintenanceDueSoonKm?: unknown } | null;
    const value = settings?.maintenanceDueSoonKm;
    return typeof value === 'number' && Number.isInteger(value) && value > 0
      ? value
      : MAINTENANCE_DUE_SOON_KM_DEFAULT;
  }
}

// ── Mapping ──────────────────────────────────────────────────────────────────

const RECORD_INCLUDE = {
  attachments: { include: { privateFile: true }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.VehicleMaintenanceRecordInclude;

type RecordRow = Prisma.VehicleMaintenanceRecordGetPayload<{ include: typeof RECORD_INCLUDE }>;
type ProfileRow = Prisma.VehicleMaintenanceProfileGetPayload<Record<string, never>>;

interface BoardRow {
  id: string;
  name: string;
  code: string;
  plate_number: string | null;
  operation_status: string;
  main_image_url: string | null;
  updated_at: Date;
  current_odometer_km: number | null;
  current_odometer_at: Date | null;
  oil_change_interval_km: number | null;
  last_service_km: number | null;
  next_km: number | null;
  remaining_km: number | null;
  due_status: string;
  active_record_id: string | null;
  last_completed_at: Date | null;
  expiring_document_count: number;
  total_count: number;
}

/**
 * Chi phí và tên file CHỈ có mặt khi người gọi đủ quyền. Vắng mặt (`undefined`) khác hẳn
 * `null` (có quyền nhưng phiếu chưa nhập) — FE phân biệt được "bị ẩn" với "chưa có".
 */
function toRecordDto(row: RecordRow, scope: MaintenanceViewScope): MaintenanceRecordDto {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    type: row.type,
    customTypeName: row.customTypeName,
    title: row.title,
    status: row.status,
    plannedStartAt: row.plannedStartAt?.toISOString() ?? null,
    plannedEndAt: row.plannedEndAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    odometerKm: row.odometerKm,
    providerName: row.providerName,
    ...(scope.canViewCost
      ? { cost: row.cost === null ? null : String(row.cost), receiptCode: row.receiptCode }
      : {}),
    notes: row.notes,
    ...(scope.canViewFiles
      ? {
          attachments: row.attachments.map((attachment) => ({
            id: attachment.privateFile.id,
            name: attachment.privateFile.originalName,
            mimeType: attachment.privateFile.mimeType,
            size: attachment.privateFile.sizeBytes,
          })),
        }
      : {}),
    attachmentCount: row.attachments.length,
    rowVersion: row.rowVersion,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toProfileDto(
  row: ProfileRow | null,
  dueSoonKm: number,
  currentOdometerRefLabel: string | null,
): MaintenanceProfileDto {
  const schedule = vehicleMaintenanceSchedule({
    currentKm: row?.currentOdometerKm ?? null,
    lastServiceKm: row?.lastServiceKm ?? null,
    intervalKm: row?.oilChangeIntervalKm ?? null,
    dueSoonKm,
  });
  return {
    currentOdometerKm: row?.currentOdometerKm ?? null,
    currentOdometerSource: row?.currentOdometerSource ?? null,
    currentOdometerAt: row?.currentOdometerAt?.toISOString() ?? null,
    currentOdometerRefLabel,
    oilChangeIntervalKm: row?.oilChangeIntervalKm ?? null,
    lastServiceKm: row?.lastServiceKm ?? null,
    lastServiceAt: row?.lastServiceAt ? row.lastServiceAt.toISOString().slice(0, 10) : null,
    notes: row?.notes ?? null,
    nextMaintenanceKm: schedule.nextMaintenanceKm,
    remainingKm: schedule.remainingKm,
    usedKm: schedule.usedKm,
    usedPercent: schedule.usedPercent,
    dueStatus: schedule.status,
    dueSoonKm,
    rowVersion: row?.rowVersion ?? 0,
    updatedAt: (row?.updatedAt ?? new Date()).toISOString(),
  };
}

function toBoardItem(
  row: BoardRow,
  dueSoonKm: number,
  recordById: Map<string, MaintenanceRecordDto>,
): MaintenanceBoardItemDto {
  return {
    vehicleId: row.id,
    vehicleName: row.name,
    vehicleCode: row.code,
    plateNumber: row.plate_number,
    operationStatus: row.operation_status,
    mainImageUrl: row.main_image_url,
    currentOdometerKm: row.current_odometer_km,
    currentOdometerAt: row.current_odometer_at?.toISOString() ?? null,
    oilChangeIntervalKm: row.oil_change_interval_km,
    nextMaintenanceKm: row.next_km,
    remainingKm: row.remaining_km,
    dueStatus: row.due_status,
    dueSoonKm,
    activeRecord: row.active_record_id ? (recordById.get(row.active_record_id) ?? null) : null,
    lastCompletedAt: row.last_completed_at?.toISOString() ?? null,
    expiringDocumentCount: row.expiring_document_count,
    updatedAt: row.updated_at.toISOString(),
  };
}

// ── Tiện ích ─────────────────────────────────────────────────────────────────

function assertRecordInput(dto: SaveMaintenanceRecordDto): void {
  const fields: { field: string; message: string }[] = [];
  if (dto.type !== MAINTENANCE_TYPE.OTHER && dto.customTypeName) {
    fields.push({ field: 'customTypeName', message: 'Tên tuỳ chỉnh chỉ dùng cho hạng mục khác' });
  }
  if (dto.type === MAINTENANCE_TYPE.OTHER && !dto.customTypeName?.trim()) {
    fields.push({ field: 'customTypeName', message: 'Hạng mục khác cần có tên' });
  }
  const start = toDateTime(dto.plannedStartAt);
  const end = toDateTime(dto.plannedEndAt);
  if (start && end && end <= start) {
    fields.push({ field: 'plannedEndAt', message: 'Thời điểm kết thúc phải sau thời điểm bắt đầu' });
  }
  // Một đầu mốc không có nghĩa cho việc giữ chỗ trên lịch — đòi đủ cặp hoặc không có gì.
  if (Boolean(start) !== Boolean(end)) {
    fields.push({
      field: start ? 'plannedEndAt' : 'plannedStartAt',
      message: 'Cần đủ cả thời điểm bắt đầu và kết thúc để giữ lịch xe',
    });
  }
  if (fields.length > 0) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Thông tin phiếu bảo dưỡng không hợp lệ',
      details: { fields },
    });
  }
}

function assertTransition(from: MaintenanceStatus, to: MaintenanceStatus): void {
  if (!isMaintenanceTransitionAllowed(from, to)) {
    throw new ConflictException({
      code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
      message: 'Trạng thái phiếu bảo dưỡng không cho phép thao tác này',
      details: { from, to },
    });
  }
}

function isClosed(status: MaintenanceStatus): boolean {
  return status === MAINTENANCE_STATUS.COMPLETED || status === MAINTENANCE_STATUS.CANCELED;
}

/** Va chạm exclusion constraint đến qua Prisma (P2010/meta) hoặc thông điệp tên constraint. */
function isExclusionViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  const meta = (err as { meta?: { code?: unknown } }).meta;
  if (code === '23P01' || (code === 'P2010' && String(meta?.code) === '23P01')) return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' && message.includes('vehicle_occupancies_no_overlap');
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function toDateTime(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function startOfUtcDay(value: Date): Date {
  return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function recordNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy phiếu bảo dưỡng',
  });
}

function staleRecord(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.CONFLICT,
    message: 'Phiếu bảo dưỡng vừa được người khác cập nhật — tải lại rồi thử lại',
  });
}

function staleProfile(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.CONFLICT,
    message: 'Hồ sơ bảo dưỡng vừa được người khác cập nhật — tải lại rồi thử lại',
  });
}
