import { BadRequestException, Injectable } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  BULK_PRICE_MODE,
  PRICE_PERCENT_MAX,
  PRICE_PERCENT_MIN,
  PRICE_ROUND_STEP_DEFAULT,
  listDateKeys,
  planBulkDayPrices,
  type BulkPriceMode,
} from '@xeprime/domain';
import { API_ERROR_CODE, OCCUPANCY_SOURCE_TYPE } from '@xeprime/types';
import { toDateOnly } from '../../common/date-only';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OccupancyService } from './occupancy.service';
import {
  BulkDayBlockDto,
  BulkDayBlockResultDto,
  BulkDayPreviewDto,
  BulkDayPriceDto,
  BulkDayPriceResultDto,
  BulkDayQueryDto,
  BulkDayReleaseResultDto,
} from './dto/bulk-day.dto';

/** Khoảng xem lớn nhất của lưới lịch — thao tác hàng loạt không cần rộng hơn thứ nhìn thấy. */
const MAX_RANGE_DAYS = 62;

/**
 * Trần số dòng ghi cho MỘT lệnh (xe × ngày).
 *
 * 1.000 xe × 62 ngày = 62.000 dòng trong một transaction sẽ giữ khoá bảng đủ lâu để mọi request
 * khác của gian hàng đó cảm nhận được. Trần này biến một lệnh vô ý thành lỗi 400 đọc được, thay
 * vì một sự cố.
 */
const MAX_WRITE_ROWS = 5_000;

/** UTC+7 cố định, không DST. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1_000;

/** 00:00 giờ VN của một ngày `YYYY-MM-DD`, dưới dạng mốc tuyệt đối. */
function vnDayStart(dateKey: string): Date {
  return new Date(new Date(`${dateKey}T00:00:00.000Z`).getTime() - VN_OFFSET_MS);
}

/** Khoá tra `"<vehicleId>|<YYYY-MM-DD>"` — khớp `OccupancyService.listBusyVehicleDays`. */
function busyKey(vehicleId: string, dateKey: string): string {
  return `${vehicleId}|${dateKey}`;
}

function validationError(message: string, field?: string): BadRequestException {
  return new BadRequestException({
    code: API_ERROR_CODE.VALIDATION_FAILED,
    message,
    ...(field ? { details: { field } } : {}),
  });
}

/**
 * Thao tác HÀNG LOẠT trên một khoảng ngày của lịch: khoá toàn bộ xe, đặt giá toàn bộ xe.
 *
 * Ba điều làm nên tính năng này, và cả ba đều là quyết định chứ không phải chi tiết:
 *
 *  1. **Khoá hàng loạt LUÔN thất bại một phần, và đó là hành vi đúng.** Xe đang có đơn thì
 *     `EXCLUDE USING gist` từ chối (ADR 0006). Một lệnh "tất-cả-hoặc-không" sẽ hỏng ở mọi gian
 *     hàng đang hoạt động, vì luôn có xe đang chạy. Nên: lọc trước bằng
 *     `listBusyVehicleDays`, chỉ ghi những cặp (xe, ngày) rảnh, và BÁO LẠI chính xác cái gì bị
 *     bỏ qua. Constraint vẫn là chốt chặn cuối — nếu ai đó đặt xen vào giữa, transaction
 *     rollback và KHÔNG có trạng thái ghi dở.
 *  2. **Gỡ lại được.** Mỗi lượt khoá mang một `bulkBatchId`; công tắc trên lịch tắt đi thì gỡ
 *     đúng lô đó, không đụng lịch khoá ai đó đặt tay vì lý do thật.
 *  3. **Giá tính bằng hàm THUẦN dùng chung với frontend** (`planBulkDayPrices`). Bảng xem trước
 *     và dòng ghi xuống DB không thể lệch nhau vì chúng chạy CÙNG một hàm.
 *
 * KHÔNG phải writer của `vehicle_occupancies` — mọi giữ chỗ vẫn đi qua `OccupancyService`.
 */
@Injectable()
export class BulkDayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occupancy: OccupancyService,
    private readonly audit: AuditService,
  ) {}

  /** Kiểm khoảng ngày và trả về danh sách ngày local. */
  private dateKeys(from: string, to: string): string[] {
    const keys = listDateKeys(from, to, MAX_RANGE_DAYS + 1);
    if (keys.length === 0)
      throw validationError('Khoảng ngày không hợp lệ: "to" phải từ "from" trở đi', 'to');
    if (keys.length > MAX_RANGE_DAYS) {
      throw validationError(`Khoảng ngày tối đa ${MAX_RANGE_DAYS} ngày`, 'to');
    }
    return keys;
  }

  /**
   * Bảng xem trước: những xe nào đang được nhắm tới, giá niêm yết bao nhiêu, bận ngày nào.
   *
   * Một endpoint phục vụ CẢ hai dialog (khoá + giá) vì chúng hỏi cùng một câu — "tập xe nào, và
   * mỗi chiếc đang thế nào". Tách đôi chỉ tạo ra hai câu query gần giống nhau và hai cơ hội để
   * chúng lệch nhau.
   */
  async preview(tenantId: string, query: BulkDayQueryDto): Promise<BulkDayPreviewDto> {
    const keys = this.dateKeys(query.from, query.to);
    const startAt = vnDayStart(query.from);
    const endAt = vnDayStart(keys[keys.length - 1]!);
    endAt.setTime(endAt.getTime() + 24 * 60 * 60 * 1_000);

    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.vehicleType ? { vehicleType: query.vehicleType } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' } },
                { plateNumber: { contains: query.q, mode: 'insensitive' } },
                { code: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        plateNumber: true,
        vehicleType: true,
        weekdayPrice: true,
        weekendPrice: true,
      },
      orderBy: [{ vehicleType: 'asc' }, { name: 'asc' }],
    });

    const ids = vehicles.map((v) => v.id);
    const busy = await this.occupancy.listBusyVehicleDays(tenantId, ids, startAt, endAt);

    /*
     * Lô đang phủ ĐÚNG khoảng này — quyết định công tắc trên lịch đang bật hay tắt. So bằng
     * chính khoảng của dòng khoá, không phải bằng "có dòng nào trong ngày không": một lịch khoá
     * lẻ do người dùng đặt tay không được làm công tắc hàng loạt sáng lên.
     */
    const batch = await this.prisma.vehicleBlock.findFirst({
      where: {
        tenantId,
        bulkBatchId: { not: null },
        startAt: { gte: startAt, lt: endAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { bulkBatchId: true },
    });

    return {
      from: query.from,
      to: query.to,
      dayCount: keys.length,
      activeBlockBatchId: batch?.bulkBatchId ?? null,
      vehicles: vehicles.map((v) => ({
        vehicleId: v.id,
        name: v.name,
        plateNumber: v.plateNumber,
        vehicleType: v.vehicleType,
        weekdayPrice: v.weekdayPrice?.toFixed(0) ?? null,
        weekendPrice: v.weekendPrice?.toFixed(0) ?? null,
        busyDates: keys.filter((key) => busy.has(busyKey(v.id, key))),
      })),
    };
  }

  /** Xe thuộc gian hàng, chưa xoá — chặn id đoán được của shop khác. */
  private async ownedVehicles(
    tenantId: string,
    vehicleIds: readonly string[],
  ): Promise<
    Array<{ id: string; weekdayPrice: Prisma.Decimal | null; weekendPrice: Prisma.Decimal | null }>
  > {
    const rows = await this.prisma.vehicle.findMany({
      where: { tenantId, deletedAt: null, id: { in: [...vehicleIds] } },
      select: { id: true, weekdayPrice: true, weekendPrice: true },
    });
    if (rows.length === 0)
      throw validationError('Không có xe hợp lệ nào trong danh sách', 'vehicleIds');
    return rows;
  }

  /**
   * Khoá mọi cặp (xe, ngày) đang RẢNH trong khoảng.
   *
   * Một dòng khoá cho mỗi NGÀY, không phải một dòng dài trọn khoảng. Vì sao: xe rảnh 31/08 và
   * 02/09 nhưng có khách ngày 01/09 vẫn nên được khoá hai ngày kia. Một dòng dài sẽ đâm vào
   * đúng ngày bận và khiến cả chiếc xe đó bị bỏ qua — tức là hai ngày lễ bỏ ngỏ cho khách đặt.
   */
  async blockAll(
    tenantId: string,
    userId: string,
    dto: BulkDayBlockDto,
  ): Promise<BulkDayBlockResultDto> {
    const keys = this.dateKeys(dto.from, dto.to);
    const vehicles = await this.ownedVehicles(tenantId, dto.vehicleIds);

    const startAt = vnDayStart(dto.from);
    const endAt = new Date(vnDayStart(keys[keys.length - 1]!).getTime() + 24 * 60 * 60 * 1_000);
    const busy = await this.occupancy.listBusyVehicleDays(
      tenantId,
      vehicles.map((v) => v.id),
      startAt,
      endAt,
    );

    const batchId = newId();
    const note = dto.note?.trim() || null;
    const rows: Array<{ id: string; vehicleId: string; startAt: Date; endAt: Date }> = [];
    let fully = 0;
    let partially = 0;
    let skipped = 0;

    for (const vehicle of vehicles) {
      const free = keys.filter((key) => !busy.has(busyKey(vehicle.id, key)));
      if (free.length === 0) skipped += 1;
      else if (free.length === keys.length) fully += 1;
      else partially += 1;

      for (const key of free) {
        const dayStart = vnDayStart(key);
        rows.push({
          id: newId(),
          vehicleId: vehicle.id,
          startAt: dayStart,
          endAt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1_000),
        });
      }
    }

    if (rows.length > MAX_WRITE_ROWS) {
      throw validationError(
        `Lệnh này sẽ tạo ${rows.length} lịch khoá, vượt trần ${MAX_WRITE_ROWS}. Thu hẹp khoảng ngày hoặc bộ lọc xe.`,
      );
    }

    if (rows.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.vehicleBlock.createMany({
          data: rows.map((row) => ({
            id: row.id,
            tenantId,
            vehicleId: row.vehicleId,
            startAt: row.startAt,
            endAt: row.endAt,
            reason: dto.reason,
            note,
            bulkBatchId: batchId,
            createdBy: userId,
          })),
        });

        /*
         * Giữ chỗ qua `OccupancyService` như mọi block lẻ — constraint chạy trên TỪNG dòng. Một
         * cuộc đua với người đang đặt xe sẽ ném ở đây và huỷ trọn transaction: không có lô nào
         * ghi được một nửa.
         */
        for (const row of rows) {
          await this.occupancy.reserve(tx, {
            tenantId,
            vehicleId: row.vehicleId,
            sourceType: OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE,
            sourceId: row.id,
            startAt: row.startAt,
            endAt: row.endAt,
          });
        }

        await this.audit.record(
          {
            tenantId,
            actorUserId: userId,
            actorScope: 'tenant',
            action: 'vehicle.block.bulk_create',
            targetType: 'vehicle_block_batch',
            targetId: batchId,
            after: {
              from: dto.from,
              to: dto.to,
              reason: dto.reason,
              blockedDays: rows.length,
              vehicles: { fully, partially, skipped },
            },
          },
          tx,
        );
      });
    }

    return {
      batchId,
      blockedDays: rows.length,
      fullyBlockedVehicles: fully,
      partiallyBlockedVehicles: partially,
      skippedVehicles: skipped,
    };
  }

  /**
   * Gỡ trọn một lô khoá.
   *
   * Xoá theo `bulkBatchId` — đúng những dòng lần bật đã tạo, không hơn.
   *
   * Chỗ giữ trên `vehicle_occupancies` phải NHẢ TƯỜNG MINH qua `OccupancyService`: bảng đó trỏ
   * về nguồn bằng cặp `(source_type, source_id)` chứ không có khoá ngoại, nên xoá `vehicle_blocks`
   * không kéo theo occupancy. Bỏ bước này thì lịch xe vẫn bận vĩnh viễn dù lịch khoá đã biến mất
   * — và không ai tìm ra nguyên nhân vì trên giao diện không còn gì để bấm vào.
   */
  async releaseBatch(
    tenantId: string,
    userId: string,
    batchId: string,
  ): Promise<BulkDayReleaseResultDto> {
    const blocks = await this.prisma.vehicleBlock.findMany({
      where: { tenantId, bulkBatchId: batchId },
      select: { id: true },
    });
    if (blocks.length === 0) return { released: 0 };

    await this.prisma.$transaction(async (tx) => {
      for (const block of blocks) {
        await this.occupancy.release(tx, OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE, block.id);
      }
      await tx.vehicleBlock.deleteMany({ where: { tenantId, bulkBatchId: batchId } });

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'vehicle.block.bulk_release',
          targetType: 'vehicle_block_batch',
          targetId: batchId,
          before: { blockedDays: blocks.length },
        },
        tx,
      );
    });

    return { released: blocks.length };
  }

  /**
   * Đặt giá riêng cho mọi xe được chọn, trên mọi ngày trong khoảng.
   *
   * Giá tính bằng `planBulkDayPrices` — CHÍNH hàm frontend dùng để dựng bảng xem trước. Xe chưa
   * cấu hình giá gốc bị bỏ qua ở chế độ `percent`: không có gốc thì không có phần trăm, và đặt
   * đại 0₫ cho một chiếc xe trong ngày lễ là một lỗi tốn tiền thật.
   */
  async priceAll(
    tenantId: string,
    userId: string,
    dto: BulkDayPriceDto,
  ): Promise<BulkDayPriceResultDto> {
    const keys = this.dateKeys(dto.from, dto.to);
    const mode = dto.mode as BulkPriceMode;

    if (mode === BULK_PRICE_MODE.PERCENT) {
      if (dto.percent === undefined) throw validationError('Thiếu phần trăm điều chỉnh', 'percent');
      if (dto.percent < PRICE_PERCENT_MIN || dto.percent > PRICE_PERCENT_MAX) {
        throw validationError(
          `Phần trăm phải nằm trong khoảng ${PRICE_PERCENT_MIN}% đến ${PRICE_PERCENT_MAX}%`,
          'percent',
        );
      }
    } else if (!dto.fixedPrice) {
      throw validationError('Thiếu số tiền cho chế độ đồng giá', 'fixedPrice');
    }

    const vehicles = await this.ownedVehicles(tenantId, dto.vehicleIds);
    const inputs = vehicles.map((v) => ({
      vehicleId: v.id,
      weekdayPrice: v.weekdayPrice?.toFixed(0) ?? null,
      weekendPrice: v.weekendPrice?.toFixed(0) ?? null,
    }));

    const writes: Array<{ vehicleId: string; dateKey: string; price: string }> = [];
    for (const key of keys) {
      for (const row of planBulkDayPrices(inputs, key, {
        mode,
        percent: dto.percent,
        fixedPrice: dto.fixedPrice,
        roundStep: dto.roundStep ?? PRICE_ROUND_STEP_DEFAULT,
      })) {
        if (row.nextPrice === null) continue;
        writes.push({ vehicleId: row.vehicleId, dateKey: key, price: row.nextPrice });
      }
    }

    if (writes.length > MAX_WRITE_ROWS) {
      throw validationError(
        `Lệnh này sẽ ghi ${writes.length} mức giá, vượt trần ${MAX_WRITE_ROWS}. Thu hẹp khoảng ngày hoặc bộ lọc xe.`,
      );
    }

    const touched = new Set(writes.map((w) => w.vehicleId));

    if (writes.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const write of writes) {
          const price = new Prisma.Decimal(write.price);
          // Upsert theo unique (vehicle_id, date) — mô hình tất định, chạy lại không nhân dòng.
          await tx.vehicleDailyPrice.upsert({
            where: {
              vehicleId_date: { vehicleId: write.vehicleId, date: toDateOnly(write.dateKey) },
            },
            create: {
              id: newId(),
              tenantId,
              vehicleId: write.vehicleId,
              date: toDateOnly(write.dateKey),
              dailyPrice: price,
              createdBy: userId,
              updatedBy: userId,
            },
            update: { dailyPrice: price, updatedBy: userId },
          });
        }

        await this.audit.record(
          {
            tenantId,
            actorUserId: userId,
            actorScope: 'tenant',
            action: 'vehicle.daily_price.bulk_set',
            targetType: 'vehicle_daily_price_batch',
            targetId: `${dto.from}_${dto.to}`,
            after: {
              from: dto.from,
              to: dto.to,
              mode,
              percent: dto.percent ?? null,
              fixedPrice: dto.fixedPrice ?? null,
              updatedDays: writes.length,
              updatedVehicles: touched.size,
            },
          },
          tx,
        );
      });
    }

    return {
      updatedDays: writes.length,
      updatedVehicles: touched.size,
      skippedVehicles: vehicles.length - touched.size,
    };
  }

  /** Khôi phục giá mặc định: xoá bản ghi đè của những xe được chọn trong khoảng. */
  async restorePrices(
    tenantId: string,
    userId: string,
    dto: BulkDayPriceDto,
  ): Promise<BulkDayPriceResultDto> {
    const keys = this.dateKeys(dto.from, dto.to);
    const vehicles = await this.ownedVehicles(tenantId, dto.vehicleIds);

    const deleted = await this.prisma.$transaction(async (tx) => {
      const result = await tx.vehicleDailyPrice.deleteMany({
        where: {
          tenantId,
          vehicleId: { in: vehicles.map((v) => v.id) },
          date: { gte: toDateOnly(keys[0]!), lte: toDateOnly(keys[keys.length - 1]!) },
        },
      });

      if (result.count > 0) {
        await this.audit.record(
          {
            tenantId,
            actorUserId: userId,
            actorScope: 'tenant',
            action: 'vehicle.daily_price.bulk_clear',
            targetType: 'vehicle_daily_price_batch',
            targetId: `${dto.from}_${dto.to}`,
            before: { from: dto.from, to: dto.to, removed: result.count },
          },
          tx,
        );
      }
      return result.count;
    });

    return { updatedDays: deleted, updatedVehicles: vehicles.length, skippedVehicles: 0 };
  }
}
