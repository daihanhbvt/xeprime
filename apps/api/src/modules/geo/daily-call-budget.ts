import type { Logger } from '@nestjs/common';
import { GeoQuotaExceededError } from './geo-provider';

/** Việt Nam không có giờ mùa hè — "ngày" của trần lượt gọi là ngày theo UTC+7 cố định. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const vnDayKey = (now: number): string => new Date(now + VN_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Cầu dao chi phí theo ngày cho một nhà cung cấp bản đồ tính tiền theo lượt (ADR 0061 điều 3).
 *
 * `/places/*` là endpoint CÔNG KHAI; `@Throttle` chặn theo IP, còn một trận quét đổi IP liên tục
 * vẫn đốt được tiền tới khi tài khoản cạn. Cái trần này chặn ở chỗ tiền thật sự đi ra: mỗi request
 * HTTP tới nhà cung cấp lấy một lượt, hết lượt thì ném {@link GeoQuotaExceededError} và `GeoService`
 * coi như "không hỏi được" (ô địa chỉ mở cho chọn "dùng địa chỉ đã gõ", phí giao về thoả thuận).
 *
 * Đếm trong bộ nhớ tiến trình, không ghi DB: đây là cầu dao, không phải sổ kế toán. Khởi động lại
 * thì đếm lại từ 0 — chấp nhận được, vì một máy API chỉ có một tiến trình và khởi động lại không
 * phải thứ kẻ quét điều khiển được. Chạy nhiều bản API thì trần nhân theo số bản.
 */
export class DailyCallBudget {
  private usage = { day: '', calls: 0, warned: false };

  constructor(
    /** Đọc mỗi lượt (không chốt lúc khởi tạo) để test và cấu hình đổi được mà không dựng lại. */
    private readonly limit: () => number,
    private readonly logger: Logger,
    private readonly label: string,
  ) {}

  /** Lấy một lượt, hoặc ném {@link GeoQuotaExceededError} — TRƯỚC khi gọi mạng. */
  take(api: string): void {
    const day = vnDayKey(Date.now());
    if (this.usage.day !== day) this.usage = { day, calls: 0, warned: false };
    const limit = this.limit();
    if (this.usage.calls >= limit) {
      if (!this.usage.warned) {
        this.usage.warned = true;
        this.logger.warn(
          `${this.label} chạm trần ${limit} lượt/ngày (${day}) — bản đồ coi như không hỏi được tới hết ngày.`,
        );
      }
      throw new GeoQuotaExceededError(`${api}: đã chạm trần GEO_DAILY_CALL_BUDGET`);
    }
    this.usage.calls += 1;
  }
}
