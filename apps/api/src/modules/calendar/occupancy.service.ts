import { Injectable } from '@nestjs/common';
import { newId, type Prisma } from '@xeprime/prisma';
import type { OccupancySourceType } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';

export interface ReserveInput {
  tenantId: string;
  vehicleId: string;
  sourceType: OccupancySourceType;
  sourceId: string;
  startAt: Date;
  endAt: Date;
  /** Thời gian chuẩn bị giữa 2 đơn, lấy từ tenant_settings. */
  bufferMinutes?: number;
}

/**
 * Đường ghi lịch xe DUY NHẤT — ADR 0006.
 *
 * CLAUDE.md mục 5 cấm module khác ghi thẳng vào `vehicle_occupancies`. Lý do: ràng buộc
 * chống trùng nằm ở exclusion constraint của Postgres, và constraint chỉ bảo vệ được nếu
 * mọi khoảng thời gian thật sự đi vào bảng đó. Một chỗ ghi tắt là một lỗ.
 *
 * Điểm quan trọng: service này KHÔNG tự kiểm tra trùng lịch bằng SELECT rồi INSERT — kiểu
 * đó luôn có khe hở giữa hai câu lệnh. Nó cứ INSERT, và để Postgres từ chối. Đó là khác
 * biệt giữa "hầu như không trùng" và "không thể trùng".
 */
@Injectable()
export class OccupancyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Giữ chỗ. Ném lỗi Postgres `23P01` nếu trùng — `AllExceptionsFilter` dịch thành
   * `BOOKING_SCHEDULE_CONFLICT` / HTTP 409.
   *
   * `tx` là bắt buộc: giữ chỗ và tạo bản ghi nghiệp vụ phải cùng một transaction, nếu
   * không sẽ có lúc booking tồn tại mà lịch chưa bị giữ.
   */
  async reserve(tx: Prisma.TransactionClient, input: ReserveInput): Promise<string> {
    const id = newId();
    await tx.vehicleOccupancy.create({
      data: {
        id,
        tenantId: input.tenantId,
        vehicleId: input.vehicleId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        startAt: input.startAt,
        endAt: input.endAt,
        bufferMinutes: input.bufferMinutes ?? 0,
      },
    });
    return id;
  }

  /** Đổi khung giờ của một nguồn đã giữ chỗ. Vẫn do constraint quyết định hợp lệ hay không. */
  async reschedule(
    tx: Prisma.TransactionClient,
    sourceType: OccupancySourceType,
    sourceId: string,
    startAt: Date,
    endAt: Date,
    bufferMinutes?: number,
  ): Promise<void> {
    await tx.vehicleOccupancy.update({
      where: { sourceType_sourceId: { sourceType, sourceId } },
      data: { startAt, endAt, ...(bufferMinutes === undefined ? {} : { bufferMinutes }) },
    });
  }

  /**
   * Trả lịch. Dùng deleteMany chứ không delete: huỷ một booking chưa từng giữ chỗ
   * (ví dụ đơn đã ở trạng thái cancelled) là hợp lệ, không nên ném lỗi.
   */
  async release(
    tx: Prisma.TransactionClient,
    sourceType: OccupancySourceType,
    sourceId: string,
  ): Promise<void> {
    await tx.vehicleOccupancy.deleteMany({ where: { sourceType, sourceId } });
  }

  /**
   * Các quãng CHIẾM CHỖ THẬT của một xe trong cửa sổ `[from, to)` — để tô ngày bận lên lịch
   * trước khi khách chọn.
   *
   * Đọc `period` chứ không phải `start_at`/`end_at`: buffer chuẩn bị ở đuôi cũng chặn đơn kế
   * tiếp y hệt giờ thuê, nên lịch phải tô đúng thứ mà constraint sẽ từ chối. Không lộ nguồn
   * chiếm chỗ (đơn của ai, bảo dưỡng hay khoá tay) — khách chỉ cần biết BẬN.
   *
   * Số dòng bị chặn bởi độ dài cửa sổ (caller kẹp): các quãng không bao giờ chồng nhau nên
   * không có chuyện một xe có vô hạn bản ghi trong cùng một khoảng. Truy vấn đi đúng index
   * gist của chính exclusion constraint (`vehicle_id`, `period`).
   *
   * ADR 0006: chỉ ĐỌC, và như mọi preview thì có thể cũ ngay khi vừa trả về.
   */
  async listBusyPeriods(
    vehicleId: string,
    from: Date,
    to: Date,
  ): Promise<Array<{ startAt: Date; endAt: Date }>> {
    return this.prisma.$queryRaw<Array<{ startAt: Date; endAt: Date }>>`
      SELECT lower(period) AS "startAt", upper(period) AS "endAt"
      FROM vehicle_occupancies
      WHERE vehicle_id = ${vehicleId}
        AND period && tstzrange(${from}, ${to}, '[)')
      ORDER BY lower(period)
    `;
  }

  /**
   * Preview trùng lịch cho UX (`POST /calendar/check-conflict`).
   *
   * ADR 0006: đây KHÔNG phải cơ chế bảo vệ. Kết quả có thể cũ ngay khi vừa trả về —
   * người khác đặt xen vào giữa lúc hiển thị và lúc bấm lưu. Bảo vệ thật là constraint.
   */
  async findOverlapping(
    vehicleId: string,
    startAt: Date,
    endAt: Date,
    excludeSourceId?: string,
  ): Promise<Array<{ id: string; sourceType: string; sourceId: string }>> {
    return this.prisma.$queryRaw<Array<{ id: string; sourceType: string; sourceId: string }>>`
      SELECT id, source_type AS "sourceType", source_id AS "sourceId"
      FROM vehicle_occupancies
      WHERE vehicle_id = ${vehicleId}
        AND period && tstzrange(${startAt}, ${endAt}, '[)')
        AND (${excludeSourceId ?? null}::text IS NULL OR source_id <> ${excludeSourceId ?? null})
    `;
  }
}
