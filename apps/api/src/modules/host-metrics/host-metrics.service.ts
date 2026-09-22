import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  BOOKING_REQUEST_DECISION_SOURCE,
  BOOKING_REQUEST_STATUS,
  EMPTY_HOST_METRICS,
  HOST_METRIC_MIN_SAMPLES,
  HOST_METRIC_WINDOW_DAYS,
  hostMetricPercent,
  hostReliabilityScore,
  type HostMetrics,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';

/** Một hàng thô từ phép gộp — mọi con số đã đếm ở Postgres, Node chỉ chia. */
interface HostMetricRow {
  tenant_id: string;
  samples: number;
  responded: number;
  kept: number;
  instant: number;
  response_minutes_median: number | null;
}

/**
 * Cửa sổ quan sát + ngưỡng "đủ dữ liệu" của MỘT lần hỏi.
 *
 * `minSamples` để mở vì ngưỡng là một quyết định TRÌNH BÀY, không phải một phép đo. Nó tồn tại
 * để một NGƯỜI LẠ không kết luận từ một lần tung đồng xu — nên nó áp cho trang công khai. Gian
 * hàng đọc sổ ví của chính mình thì đã biết tháng đó có bao nhiêu yêu cầu, và bảng in số mẫu
 * ngay cạnh: giấu "2/3" khỏi chính người đã sống qua cả ba yêu cầu đó không bảo vệ được ai.
 */
interface MetricWindow {
  since?: Date;
  until?: Date;
  minSamples?: number;
}

/**
 * BA CHỈ SỐ CÔNG KHAI của một gian hàng — **nguồn tính DUY NHẤT** (ADR 0045 điều 2).
 *
 * Bốn bề mặt đọc ba con số này: trang gian hàng công khai, khối chủ xe ở trang chi tiết xe, sổ
 * ví của chính gian hàng, và điểm xếp hạng chợ. Trước đợt này mỗi bề mặt tự cộng lấy một bộ mảng
 * trạng thái, và hai bản đã bắt đầu trôi khỏi nhau — `hold_expired` được một bên tính là "đã trả
 * lời" còn bên kia không. Một gian hàng nhìn thấy hai con số khác nhau về chính mình là cách
 * nhanh nhất để không ai tin con số nào.
 *
 * ## Vì sao là SQL thô chứ không phải `groupBy` của Prisma
 *
 * Phép phân loại một mẫu cần đọc **ba cột cùng lúc** (`status`, `decided_at`, `decision_source`)
 * và một phép LEFT JOIN sang `booking_cancellations`. `groupBy` chỉ gộp được theo cột, nên diễn
 * đạt nó bằng Prisma sẽ thành năm truy vấn rồi cộng ở Node — và mỗi phép cộng ở Node là một chỗ
 * để định nghĩa mẫu số trôi đi lần nữa.
 *
 * ## Phân loại (xem `@xeprime/types/host-metrics` cho lý do từng dòng)
 *
 * ```
 * NGOÀI mẫu  : slot_taken
 *            | cancelled_by_customer  AND decided_at IS NULL   (khách rút trước khi ai quyết)
 *            | hold_expired           AND decided_at IS NULL   (LEGACY ADR 0039)
 *            | pending_host_approval  AND respond_by > now()   (chưa ai chậm trễ)
 * MẪU        : còn lại
 *   responded: decided_at IS NOT NULL
 *   kept     : decided_at IS NOT NULL AND status <> rejected_by_host AND KHÔNG bị chính gian
 *              hàng huỷ (`booking_cancellations.counts_against_host`)
 * ```
 *
 * ⚠️ `responded` đọc `decided_at`, KHÔNG đọc `status = rejected_by_host`. Worker
 * `expirePaidAwaitingAccept` (dữ liệu LEGACY) cũng ghi `rejected_by_host` khi gian hàng **không**
 * phản hồi — và nó cố ý để trống `decided_at`. Hỏi status ở đây là trao điểm phản hồi cho đúng
 * nhóm không phản hồi.
 */
@Injectable()
export class HostMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Chỉ số của NHIỀU gian hàng trong MỘT truy vấn — hình dạng bắt buộc của mọi nơi gọi.
   *
   * Thẻ kết quả tìm kiếm và danh sách gian hàng hiển thị hàng chục chủ xe một lúc; gọi hàm một
   * tenant trong vòng lặp là đúng cái N+1 mà ADR 0045 cấm. Nơi nào chỉ cần một tenant thì gọi
   * `forTenant` — nó là một lớp mỏng trên chính hàm này, không phải một phép tính thứ hai.
   *
   * `tenantIds` rỗng ⇒ trả map rỗng, không chạm database.
   *
   * ## `window` — cùng một LUẬT, hai câu hỏi khác nhau
   *
   * Bỏ trống là cửa sổ công khai (`HOST_METRIC_WINDOW_DAYS` ngày gần nhất): "gian hàng này dạo
   * này thế nào", câu mà khách đang cân nhắc cần trả lời.
   *
   * Sổ ví của chính gian hàng truyền một KỲ (một tháng) vì cả bảng đó nói về một tháng, và một
   * con số 90 ngày đứng giữa những con số của tháng là thứ không ai đọc đúng được. Cửa sổ khác
   * nhau nhưng **phép phân loại thì không** — và đó mới là thứ ADR 0045 điều 2 gọi là một nguồn:
   * một định nghĩa "mẫu là gì", một định nghĩa "đã phản hồi", một định nghĩa "đã giữ chuyến".
   */
  async forTenants(
    tenantIds: string[],
    window: MetricWindow = {},
  ): Promise<Map<string, HostMetrics>> {
    const rows = await this.aggregate(tenantIds, window);
    const result = new Map<string, HostMetrics>();
    for (const [tenantId, row] of rows) {
      result.set(tenantId, toMetrics(row, window.minSamples ?? HOST_METRIC_MIN_SAMPLES));
    }
    return result;
  }

  /**
   * Phép ĐẾM thô — nguồn của cả con số hiển thị lẫn điểm xếp hạng.
   *
   * Tách khỏi `forTenants` vì hai đường đọc cần hai thứ khác nhau từ CÙNG một phép đếm: hiển
   * thị cần ngưỡng "đủ dữ liệu" (dưới ngưỡng thì im lặng), xếp hạng cần con số thô để làm mượt.
   * Nếu điểm xếp hạng đọc lại `HostMetrics` đã bị chặn ngưỡng thì một gian hàng giữ đúng 3/3
   * chuyến sẽ vào công thức như thể giữ 0/3 — phạt đúng người làm đúng, vì một lý do thuần kỹ
   * thuật.
   */
  private async aggregate(
    tenantIds: string[],
    window: MetricWindow = {},
  ): Promise<Map<string, HostMetricRow>> {
    const result = new Map<string, HostMetricRow>();
    const unique = [...new Set(tenantIds.filter(Boolean))];
    if (unique.length === 0) return result;

    const since =
      window.since ?? new Date(Date.now() - HOST_METRIC_WINDOW_DAYS * 24 * 3600_000);
    // `until` bỏ trống ⇒ tới hiện tại. Một mốc xa trong tương lai đơn giản là không loại ai.
    const until = window.until ?? new Date(Date.now() + 60_000);
    const rows = await this.prisma.$queryRaw<HostMetricRow[]>`
      WITH sample AS (
        SELECT r."tenant_id",
               (r."decided_at" IS NOT NULL) AS responded,
               (
                 r."decided_at" IS NOT NULL
                 AND r."status" <> ${BOOKING_REQUEST_STATUS.REJECTED_BY_HOST}
                 AND COALESCE(c."counts_against_host", false) = false
               ) AS kept,
               (r."decision_source" = ${BOOKING_REQUEST_DECISION_SOURCE.SYSTEM}) AS instant,
               /*
                * Thời gian phản hồi chỉ đếm quyết định của NGƯỜI. Xe bật "Đặt ngay" quyết trong
                * vài mili-giây; trộn vào trung vị là quảng cáo một tốc độ trả lời thủ công không
                * có thật (ADR 0045 điều 2).
                */
               CASE
                 WHEN r."decided_at" IS NOT NULL
                  AND r."decision_source" = ${BOOKING_REQUEST_DECISION_SOURCE.HOST}
                 THEN EXTRACT(EPOCH FROM (r."decided_at" - r."created_at")) / 60
                 ELSE NULL
               END AS decision_minutes
          FROM "booking_requests" r
          LEFT JOIN "booking_cancellations" c ON c."booking_request_id" = r."id"
         WHERE r."tenant_id" = ANY(${unique}::char(26)[])
           AND r."created_at" >= ${since}
           AND r."created_at" < ${until}
           -- Ba nhóm NGOÀI mẫu số: gian hàng không có cơ hội hoặc không có nghĩa vụ quyết định.
           AND r."status" <> ${BOOKING_REQUEST_STATUS.SLOT_TAKEN}
           AND NOT (
                 r."status" = ${BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER}
             AND r."decided_at" IS NULL
           )
           AND NOT (
                 r."status" = ${BOOKING_REQUEST_STATUS.HOLD_EXPIRED}
             AND r."decided_at" IS NULL
           )
           AND NOT (
                 r."status" = ${BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL}
             AND r."respond_by" > now()
           )
      )
      SELECT "tenant_id",
             COUNT(*)::int                                       AS samples,
             COUNT(*) FILTER (WHERE responded)::int              AS responded,
             COUNT(*) FILTER (WHERE kept)::int                   AS kept,
             COUNT(*) FILTER (WHERE instant)::int                AS instant,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY decision_minutes)
                                                                 AS response_minutes_median
        FROM sample
       GROUP BY "tenant_id"
    `;

    for (const row of rows) {
      result.set(row.tenant_id, row);
    }
    // Gian hàng KHÔNG có yêu cầu nào trong cửa sổ vẫn phải có một mục — nếu không, nơi gọi phải
    // tự nhớ rằng "thiếu khoá" nghĩa là "chưa có dữ liệu", và sớm muộn có chỗ quên.
    for (const tenantId of unique) {
      if (!result.has(tenantId)) {
        result.set(tenantId, {
          tenant_id: tenantId,
          samples: 0,
          responded: 0,
          kept: 0,
          instant: 0,
          response_minutes_median: null,
        });
      }
    }
    return result;
  }

  /** Một gian hàng — lớp mỏng trên `forTenants`, không phải một phép tính thứ hai. */
  async forTenant(tenantId: string, window: MetricWindow = {}): Promise<HostMetrics> {
    const map = await this.forTenants([tenantId], window);
    return map.get(tenantId) ?? EMPTY_HOST_METRICS;
  }

  /**
   * Điểm uy tín [0,1] để đưa vào XẾP HẠNG — khác con số HIỂN THỊ.
   *
   * Hiển thị thì thà không nói còn hơn nói sai (`null` khi chưa đủ mẫu); xếp hạng thì buộc phải
   * cho mọi xe một con số để so, nên nó được làm mượt về mức nền trung tính. Hai đường đọc cùng
   * một phép đếm nhưng hai cách trình bày — và cả hai đều ở đây để không ai dựng bản thứ ba.
   */
  async reliabilityFor(tenantIds: string[]): Promise<Map<string, number>> {
    const rows = await this.aggregate(tenantIds);
    const out = new Map<string, number>();
    for (const [tenantId, row] of rows) {
      out.set(tenantId, hostReliabilityScore(row.kept, row.samples));
    }
    return out;
  }
}

/** Hàng thô → ba chỉ số. Phép chia và ngưỡng "đủ dữ liệu" nằm ở `@xeprime/types`. */
function toMetrics(row: HostMetricRow, minSamples: number): HostMetrics {
  return {
    sampleCount: row.samples,
    responseRatePercent: hostMetricPercent(row.responded, row.samples, minSamples),
    acceptKeepRatePercent: hostMetricPercent(row.kept, row.samples, minSamples),
    /*
     * Trung vị trả về `Decimal` từ `PERCENTILE_CONT`; làm tròn về PHÚT ở đây chứ không ở giao
     * diện — hai client làm tròn khác nhau là hai con số khác nhau cho cùng một gian hàng.
     */
    responseMinutesMedian:
      row.response_minutes_median == null ? null : Math.round(Number(row.response_minutes_median)),
    instantBook: row.instant > 0,
  };
}

/** Kiểu `Prisma` được nhắc tới ở docblock trên — giữ import để đường SQL thô còn kiểu. */
export type { Prisma };
