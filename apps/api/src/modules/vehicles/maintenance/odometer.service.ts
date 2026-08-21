import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  ODOMETER_MAX_KM,
  ODOMETER_SOURCE,
  type OdometerSource,
} from '@xeprime/types';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CorrectOdometerDto,
  MAINTENANCE_DEFAULT_LIMIT,
  MAINTENANCE_MAX_LIMIT,
  OdometerHistoryDto,
  OdometerReadingDto,
} from './dto/vehicle-maintenance.dto';
import { paginationMeta, resolvePaging } from '../../../common/pagination';

export interface RecordOdometerInput {
  tenantId: string;
  vehicleId: string;
  userId: string;
  odometerKm: number;
  source: OdometerSource;
  sourceRefId?: string | null;
  reasonCode?: string | null;
  reason?: string | null;
  /**
   * Cho phép hạ KM có thẩm quyền. CHỈ đúng khi người gọi vừa kiểm
   * `vehicles.odometer.decrease` VÀ người dùng đã xác nhận có ý thức — service không tự
   * suy ra quyền, caller phải nói rõ.
   */
  allowDecrease?: boolean;
}

/**
 * Số KM có thẩm quyền của xe (Wave 6) — writer DUY NHẤT của `vehicle_odometer_readings`
 * và của các cột `current_odometer_*` trên `vehicle_maintenance_profiles`.
 *
 * Vì sao một writer: lịch sử KM là CHỈ-THÊM và cột "hiện tại" là bản dẫn xuất của nó. Hai
 * đường ghi là hai cách để hai thứ đó lệch nhau, và lúc đó không ai biết số nào đúng.
 *
 * Luật chốt (docs/design/12 §9.1):
 *  - dữ liệu KHÁCH tự khai không bao giờ đi qua đây (chỉ bàn giao đã xác nhận — Wave 7);
 *  - cập nhật thường KHÔNG được làm KM giảm;
 *  - chỉnh tay bắt buộc có lý do (CHECK ở DB là chốt cuối, không chỉ ở app);
 *  - giảm KM cần quyền cao hơn + xác nhận, và luôn để lại vết audit.
 */
@Injectable()
export class OdometerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Ghi một lần đọc KM TRONG transaction của caller (hoàn tất bảo dưỡng, bàn giao trả xe).
   * Luôn append lịch sử; cột "hiện tại" chỉ dời lên khi số mới thực sự mới hơn.
   */
  async record(tx: Prisma.TransactionClient, input: RecordOdometerInput): Promise<string> {
    assertKmBounds(input.odometerKm);

    // Khoá hồ sơ để hai lần ghi đồng thời không cùng đọc một `current` rồi cùng ghi đè.
    const locked = await tx.$queryRaw<{ currentOdometerKm: number | null }[]>`
      SELECT "current_odometer_km" AS "currentOdometerKm"
      FROM "vehicle_maintenance_profiles"
      WHERE "vehicle_id" = ${input.vehicleId} AND "tenant_id" = ${input.tenantId}
      FOR UPDATE`;
    const currentKm = locked[0]?.currentOdometerKm ?? null;
    const hasProfile = locked.length > 0;

    const isDecrease = currentKm !== null && input.odometerKm < currentKm;
    if (isDecrease && !input.allowDecrease) {
      throw decreaseForbidden(currentKm, input.odometerKm);
    }
    if (input.source === ODOMETER_SOURCE.MANUAL_CORRECTION && !input.reason?.trim()) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Điều chỉnh KM thủ công bắt buộc phải có lý do',
        details: { fields: [{ field: 'reason', message: 'Bắt buộc nhập lý do' }] },
      });
    }

    const readingId = newId();
    const recordedAt = new Date();
    await tx.vehicleOdometerReading.create({
      data: {
        id: readingId,
        tenantId: input.tenantId,
        vehicleId: input.vehicleId,
        odometerKm: input.odometerKm,
        previousKm: currentKm,
        source: input.source,
        sourceRefId: input.sourceRefId ?? null,
        reasonCode: input.reasonCode ?? null,
        reason: input.reason?.trim() || null,
        isDecrease,
        recordedAt,
        recordedBy: input.userId,
      },
    });

    // Số cũ hơn (ghi nhận hồi tố) vẫn vào lịch sử nhưng KHÔNG kéo lùi "hiện tại".
    const becomesCurrent = currentKm === null || input.odometerKm >= currentKm || isDecrease;
    if (becomesCurrent) {
      const currentFields = {
        currentOdometerKm: input.odometerKm,
        currentOdometerSource: input.source,
        currentOdometerAt: recordedAt,
        currentOdometerReadingId: readingId,
      };
      if (hasProfile) {
        await tx.vehicleMaintenanceProfile.update({
          where: { vehicleId: input.vehicleId },
          data: { ...currentFields, rowVersion: { increment: 1 } },
        });
      } else {
        await tx.vehicleMaintenanceProfile.create({
          data: { vehicleId: input.vehicleId, tenantId: input.tenantId, ...currentFields },
        });
      }
    }

    await this.audit.record(
      {
        tenantId: input.tenantId,
        actorUserId: input.userId,
        actorScope: 'tenant',
        action: isDecrease ? 'vehicle.odometer.decrease' : 'vehicle.odometer.record',
        targetType: 'vehicle',
        targetId: input.vehicleId,
        before: { odometerKm: currentKm },
        after: {
          odometerKm: input.odometerKm,
          source: input.source,
          sourceRefId: input.sourceRefId ?? null,
          reasonCode: input.reasonCode ?? null,
          becameCurrent: becomesCurrent,
        },
      },
      tx,
    );

    return readingId;
  }

  /**
   * Chỉnh tay KM hiện tại. `canDecrease` do controller truyền xuống sau khi kiểm
   * `vehicles.odometer.decrease` — service không đọc quyền, nhưng cũng không tin mặc định:
   * thiếu quyền mà số mới thấp hơn thì 403 có mã riêng để FE hướng dẫn xin phê duyệt.
   */
  async correct(
    tenantId: string,
    vehicleId: string,
    userId: string,
    dto: CorrectOdometerDto,
    opts: { canDecrease: boolean },
  ): Promise<{ readingId: string; odometerKm: number }> {
    await this.assertVehicle(tenantId, vehicleId);

    const readingId = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.vehicleMaintenanceProfile.findUnique({
        where: { vehicleId },
        select: { currentOdometerKm: true, rowVersion: true },
      });

      // Optimistic concurrency: hai người cùng mở form sửa KM, người sau phải thấy số mới.
      if (
        profile &&
        dto.expectedRowVersion != null &&
        profile.rowVersion !== dto.expectedRowVersion
      ) {
        throw staleProfile();
      }

      const currentKm = profile?.currentOdometerKm ?? null;
      const isDecrease = currentKm !== null && dto.odometerKm < currentKm;
      if (isDecrease) {
        if (!opts.canDecrease) throw decreaseForbidden(currentKm, dto.odometerKm);
        // Có quyền nhưng chưa xác nhận: không âm thầm hạ số có thẩm quyền vì một cú bấm nhầm.
        if (!dto.confirmDecrease) {
          throw new ConflictException({
            code: API_ERROR_CODE.ODOMETER_DECREASE_FORBIDDEN,
            message: 'KM mới thấp hơn KM hiện tại — cần xác nhận trước khi giảm',
            details: { currentKm, nextKm: dto.odometerKm, requiresConfirmation: true },
          });
        }
      }

      return this.record(tx, {
        tenantId,
        vehicleId,
        userId,
        odometerKm: dto.odometerKm,
        source: ODOMETER_SOURCE.MANUAL_CORRECTION,
        reasonCode: dto.reasonCode,
        reason: dto.reason,
        allowDecrease: isDecrease,
      });
    });

    return { readingId, odometerKm: dto.odometerKm };
  }

  /** Lịch sử KM, mới nhất trước — phân trang vì mỗi chuyến thuê đều sinh một dòng. */
  async history(
    tenantId: string,
    vehicleId: string,
    page: number | undefined,
    limit: number | undefined,
  ): Promise<OdometerHistoryDto> {
    await this.assertVehicle(tenantId, vehicleId);
    // Kẹp trần ở đây, không ở controller: một chỗ quyết định trần cho mọi đường vào.
    const paging = resolvePaging({ page, limit }, MAINTENANCE_DEFAULT_LIMIT, MAINTENANCE_MAX_LIMIT);
    const where = { tenantId, vehicleId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vehicleOdometerReading.count({ where }),
      this.prisma.vehicleOdometerReading.findMany({
        where,
        orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        include: { },
      }),
    ]);

    const actorIds = [...new Set(rows.map((row) => row.recordedBy).filter(Boolean))] as string[];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, displayName: true },
        })
      : [];
    const nameById = new Map(actors.map((a) => [a.id, a.displayName]));

    return {
      data: rows.map((row) => toReadingDto(row, nameById.get(row.recordedBy ?? '') ?? null)),
      meta: paginationMeta(paging, total),
    };
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
}

type ReadingRow = Prisma.VehicleOdometerReadingGetPayload<Record<string, never>>;

function toReadingDto(row: ReadingRow, recordedByName: string | null): OdometerReadingDto {
  return {
    id: row.id,
    odometerKm: row.odometerKm,
    previousKm: row.previousKm,
    source: row.source,
    sourceRefId: row.sourceRefId,
    reasonCode: row.reasonCode,
    reason: row.reason,
    isDecrease: row.isDecrease,
    recordedAt: row.recordedAt.toISOString(),
    recordedByName,
  };
}

function assertKmBounds(km: number): void {
  if (!Number.isInteger(km) || km < 0 || km > ODOMETER_MAX_KM) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: `Số KM phải là số nguyên trong khoảng 0–${ODOMETER_MAX_KM}`,
      details: { fields: [{ field: 'odometerKm', message: 'Giá trị KM không hợp lệ' }] },
    });
  }
}

/** Mã riêng (không phải VALIDATION_FAILED chung) để FE mở đúng luồng xác nhận/xin quyền. */
function decreaseForbidden(currentKm: number, nextKm: number): ForbiddenException {
  return new ForbiddenException({
    code: API_ERROR_CODE.ODOMETER_DECREASE_FORBIDDEN,
    message: `KM mới (${nextKm}) thấp hơn KM hiện tại (${currentKm}) — thao tác này cần quyền quản trị viên`,
    details: { currentKm, nextKm, requiredPermission: 'vehicles.odometer.decrease' },
  });
}

function staleProfile(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.CONFLICT,
    message: 'Hồ sơ bảo dưỡng vừa được người khác cập nhật — tải lại rồi thử lại',
  });
}
