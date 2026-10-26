import { Injectable } from '@nestjs/common';
import { newId, type Prisma } from '@xeprime/prisma';
import { addDateKeyDays, vnDateKey, vnDayStart, type OccupancySourceType } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BUSY_DAYS_MAX_WINDOW,
  type VehicleBusyDayDto,
  type VehicleBusyDaysDto,
  type VehicleBusyPeriodDto,
} from './dto/busy-days.dto';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
   * Lịch bận của một xe theo NGÀY LỊCH Việt Nam — để hộp chọn thời gian thuê khoá thẳng ngày bận
   * thay vì để người dùng chọn rồi mới báo lỗi ở bước sau.
   *
   * MỘT phép tính cho cả hai cửa đọc: khách trên chợ (sau khi caller xác nhận xe đang công khai) và
   * gian hàng đặt hộ (sau khi caller xác nhận xe thuộc gian hàng). Hai bản viết tay là hai cách tô
   * lịch khác nhau cho cùng một chiếc xe. Caller lo PHẠM VI; ở đây chỉ còn đọc và cắt.
   *
   * Hai mức, vì hai mức có ý nghĩa khác nhau:
   *   - `fullyBusy`: bận trọn ngày → ngày đó không nhận cũng không trả xe được, lịch khoá luôn.
   *   - còn lại: bận vài giờ → vẫn nhận/trả được trong ngày, nhưng phải tránh các quãng trả về
   *     ở `periods` (FE tô màu riêng + ghi rõ giờ bận).
   *
   * Danh sách THƯA: chỉ ngày nào có lịch bận mới xuất hiện. Một cửa sổ 400 ngày của xe rảnh
   * trả về mảng rỗng, không phải 400 dòng `false`.
   *
   * ADR 0006: preview cho UX, KHÔNG phải bảo vệ — quyết định thật vẫn là constraint lúc ghi.
   */
  async listBusyDays(vehicleId: string, from: string, to: string): Promise<VehicleBusyDaysDto> {
    // Kẹp cửa sổ ở server: client gửi gì cũng không quét quá trần, và trả lại khoảng THỰC SỰ
    // đã dùng để FE biết phần ngoài trần là "chưa biết", không phải "chắc chắn rảnh".
    const startKey = from;
    const maxKey = addDateKeyDays(startKey, BUSY_DAYS_MAX_WINDOW - 1);
    const endKey = to < startKey ? startKey : to > maxKey ? maxKey : to;

    const windowStart = vnDayStart(startKey);
    const windowEnd = vnDayStart(addDateKeyDays(endKey, 1));

    const periods = await this.listBusyPeriods(vehicleId, windowStart, windowEnd);

    // Cắt mỗi quãng bận theo từng ngày VN nó phủ. Quãng không bao giờ chồng nhau (exclusion
    // constraint) nên gom theo ngày là đủ, không cần merge chống trùng.
    const byDay = new Map<string, VehicleBusyPeriodDto[]>();
    for (const p of periods) {
      const startMs = Math.max(p.startAt.getTime(), windowStart.getTime());
      const endMs = Math.min(p.endAt.getTime(), windowEnd.getTime());
      if (endMs <= startMs) continue;

      // Nửa mở `[start, end)`: kết thúc ĐÚNG nửa đêm thuộc ngày trước, không chạm ngày sau.
      let dayKey = vnDateKey(new Date(startMs));
      const lastKey = vnDateKey(new Date(endMs - 1));
      while (dayKey <= lastKey) {
        const dayStartMs = vnDayStart(dayKey).getTime();
        const dayEndMs = dayStartMs + MS_PER_DAY;
        const bucket = byDay.get(dayKey) ?? [];
        bucket.push({
          startAt: new Date(Math.max(startMs, dayStartMs)).toISOString(),
          endAt: new Date(Math.min(endMs, dayEndMs)).toISOString(),
        });
        byDay.set(dayKey, bucket);
        dayKey = addDateKeyDays(dayKey, 1);
      }
    }

    const days: VehicleBusyDayDto[] = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => {
        // Các quãng trong cùng một ngày rời nhau và đã cắt gọn trong ngày, nên tổng thời lượng
        // đúng bằng 24h ⇔ phủ kín ngày. Không cần dò từng khe.
        const covered = list.reduce(
          (sum, p) => sum + (Date.parse(p.endAt) - Date.parse(p.startAt)),
          0,
        );
        const fullyBusy = covered >= MS_PER_DAY;
        return {
          date,
          fullyBusy,
          // Ngày bận trọn thì `periods` là nhiễu — lịch khoá cả ngày, không có giờ nào để né.
          periods: fullyBusy
            ? []
            : [...list].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
        };
      });

    return { days, from: startKey, to: endKey };
  }

  /**
   * Cặp (xe, ngày) ĐANG BẬN trong một khoảng, cho cả một nhóm xe cùng lúc.
   *
   * Dùng cho thao tác "khoá toàn bộ xe trong ngày": nó phải biết TRƯỚC xe nào ngày nào không
   * khoá được, vừa để hiện bảng xem trước trung thực, vừa để chỉ ghi những dòng có cơ hội thành
   * công — một `INSERT` vi phạm `EXCLUDE USING gist` sẽ huỷ trọn transaction, kéo theo cả những
   * xe hoàn toàn rảnh.
   *
   * ADR 0006 vẫn nguyên vẹn: đây KHÔNG phải cơ chế bảo vệ, chỉ là cách CHỌN ứng viên. Constraint
   * vẫn chạy trên từng dòng ghi, và nếu có ai đặt xen vào giữa preview và lúc lưu thì transaction
   * rollback — không có trạng thái ghi dở.
   *
   * Trả về khoá `"<vehicleId>|<YYYY-MM-DD>"` (ngày local Việt Nam) để caller tra O(1).
   */
  async listBusyVehicleDays(
    tenantId: string,
    vehicleIds: readonly string[],
    startAt: Date,
    endAt: Date,
  ): Promise<Set<string>> {
    if (vehicleIds.length === 0) return new Set();

    /*
     * `generate_series` cắt khoảng bận thành từng NGÀY LOCAL: một đơn thuê 3 ngày chặn đúng 3 ô
     * lịch, không phải một ô. Ép về `Asia/Ho_Chi_Minh` ngay trong SQL vì ranh giới ngày là ranh
     * giới của người dùng, không phải của UTC.
     */
    const rows = await this.prisma.$queryRaw<Array<{ key: string }>>`
      SELECT DISTINCT o.vehicle_id || '|' || to_char(d.day, 'YYYY-MM-DD') AS key
      FROM vehicle_occupancies o
      CROSS JOIN LATERAL generate_series(
        date_trunc('day', greatest(lower(o.period), ${startAt}) AT TIME ZONE 'Asia/Ho_Chi_Minh'),
        date_trunc(
          'day',
          (least(upper(o.period), ${endAt}) - interval '1 microsecond') AT TIME ZONE 'Asia/Ho_Chi_Minh'
        ),
        interval '1 day'
      ) AS d(day)
      WHERE o.tenant_id = ${tenantId}
        AND o.vehicle_id = ANY(${[...vehicleIds]}::char(26)[])
        AND o.period && tstzrange(${startAt}, ${endAt}, '[)')
    `;

    return new Set(rows.map((r) => r.key));
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
