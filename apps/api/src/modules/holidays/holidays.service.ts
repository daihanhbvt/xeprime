import { BadRequestException, Injectable } from '@nestjs/common';
import { API_ERROR_CODE } from '@xeprime/types';
import { fromDateOnly, toDateOnly } from '../../common/date-only';
import { PrismaService } from '../../prisma/prisma.service';
import { HolidayDto } from './dto/holiday.dto';

/**
 * Trần độ rộng một lần tra, tính bằng ngày.
 *
 * Lịch điều phối xem tối đa 62 ngày, nên 400 đã rộng hơn mọi nhu cầu thật (đủ cả một năm cộng
 * đệm hai đầu). Trần tồn tại vì đây là endpoint `@Public()` không cần đăng nhập: không có nó,
 * `?from=0001-01-01&to=9999-12-31` là một câu quét toàn bảng mà bất kỳ ai cũng gọi được, lặp
 * bao nhiêu lần tuỳ thích.
 */
export const HOLIDAY_MAX_QUERY_DAYS = 400;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Đọc lịch nghỉ lễ. CHỈ ĐỌC — không module nào ở `apps/api` được ghi vào `public_holidays`.
 *
 * Đường ghi duy nhất là job đồng bộ ở `apps/worker` (`jobs/holiday-sync.ts`). Cùng kỷ luật với
 * `OccupancyService` (ADR 0006) và `ListingsService` (ADR 0008), và ở đây còn dứt khoát hơn:
 * bảng này KHÔNG có `tenant_id`, nên một endpoint ghi sẽ là một endpoint mà mọi gian hàng cùng
 * chịu hậu quả.
 */
@Injectable()
export class HolidaysService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ngày lễ GIAO với khoảng `[from, to]`.
   *
   * Điều kiện là OVERLAP (`start_date <= to AND end_date >= from`), không phải "nằm gọn trong
   * khoảng": Tết kéo dài 17→23/02, và người mở lịch từ ngày 20/02 vẫn phải thấy nó. Lọc theo
   * `start_date BETWEEN from AND to` sẽ làm ngày lễ biến mất đúng lúc nó đang diễn ra.
   *
   * `end_date` trong DB đã là ngày CUỐI CÙNG (inclusive) — bẫy end-exclusive của Google đã được
   * xử lý một lần duy nhất ở tầng đồng bộ, nên ở đây không có phép `- 1` nào.
   */
  async listInRange(from: string, to: string): Promise<HolidayDto[]> {
    const fromDate = toDateOnly(from);
    const toDate = toDateOnly(to);

    if (toDate.getTime() < fromDate.getTime()) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Khoảng ngày không hợp lệ: "to" phải từ "from" trở đi',
        details: { field: 'to' },
      });
    }

    const days = Math.round((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY) + 1;
    if (days > HOLIDAY_MAX_QUERY_DAYS) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: `Khoảng ngày tối đa ${HOLIDAY_MAX_QUERY_DAYS} ngày (đang hỏi ${days} ngày)`,
        details: { field: 'to', maxDays: HOLIDAY_MAX_QUERY_DAYS },
      });
    }

    const rows = await this.prisma.publicHoliday.findMany({
      where: { startDate: { lte: toDate }, endDate: { gte: fromDate } },
      orderBy: [{ startDate: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        startDate: true,
        endDate: true,
        name: true,
        description: true,
        eventType: true,
        source: true,
        syncedAt: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      // `fromDateOnly` trả `string | null`; cột NOT NULL nên nhánh null không tồn tại ở đây.
      startDate: fromDateOnly(row.startDate)!,
      endDate: fromDateOnly(row.endDate)!,
      name: row.name,
      description: row.description,
      eventType: row.eventType,
      source: row.source,
      syncedAt: row.syncedAt.toISOString(),
    }));
  }
}
