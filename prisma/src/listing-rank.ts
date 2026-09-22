import { BOOKING_STATUS, LISTING_STATUS } from '@xeprime/types';
import { Prisma } from '../generated/client';
import type { PrismaClient } from '../generated/client';

/**
 * Điểm xếp hạng "phù hợp" của một xe trên chợ — nguồn ghi DUY NHẤT của `public_listings.rank_score`.
 *
 * ## Vì sao nằm ở `@xeprime/prisma` chứ không ở `apps/api`
 *
 * Cùng lý do với `badges.ts` và `push-outbox.ts`: HAI tiến trình phải nói cùng một công thức.
 * `ListingsService` cập nhật điểm của một xe ngay trong transaction đã duyệt/sửa xe, còn worker
 * quét lại toàn bảng mỗi ngày (thành phần ĐỘ MỚI phai theo thời gian, không có sự kiện nào báo
 * "hôm nay xe này cũ hơn hôm qua"). Worker cố ý không kéo runtime Nest vào nên không gọi được
 * `ListingsService`; nếu công thức nằm ở đó thì worker phải chép lại nó, và hai bản sẽ trôi khỏi
 * nhau đúng vào lúc không ai nhìn.
 *
 * ## Điểm này ĐO cái gì
 *
 * Bốn thành phần, mỗi thành phần chuẩn hoá về [0,1] rồi nhân trọng số — tổng trọng số bằng 1
 * nên `rank_score` cũng nằm trong [0,1] và so sánh được giữa hai xe bất kỳ.
 *
 *   · **Chất lượng** (0,45) — trung bình BAYES chứ không phải `rating_avg` trần. Một xe 5,0 sao
 *     với một đánh giá KHÔNG được thắng một xe 4,8 sao với hai trăm đánh giá; trung bình trần
 *     không phân biệt được "tốt" với "chưa ai chấm", Bayes thì có.
 *   · **Số chuyến đã chạy** (0,25) — thang log: chuyến thứ hai nói nhiều hơn chuyến thứ bốn mươi.
 *   · **Độ đầy hồ sơ** (0,18) — bốn điều kiện ĐẾM ĐƯỢC (ảnh chính, giá ngày, ≥4 ảnh, ≥3 tiện
 *     ích). Xe thiếu ảnh không nên đứng trước xe khai đủ, dù cả hai chưa có đánh giá nào.
 *   · **Độ mới** (0,12) — phai theo hàm mũ (~30 ngày). Không có vế này thì xe mới lên sàn nằm
 *     vĩnh viễn ở dưới vì chưa ai từng thuê, nên sẽ mãi mãi không ai thuê.
 *
 * ## Điểm này KHÔNG đo cái gì, và vì sao
 *
 *   · **Địa lý.** Nó khác nhau theo từng người xem nên không lưu được vào một cột; nó cộng vào
 *     lúc ĐỌC, dưới dạng bậc ưu tiên (đúng tỉnh → cùng vùng → còn lại).
 *   · **Xe còn rảnh hay không.** Cũng phụ thuộc truy vấn (khoảng ngày khách chọn) — lọc lúc đọc.
 *   · **Gian hàng đang trả gói.** ADR 0028 cho phép ưu tiên xe thuê bao TRONG NHÓM KẾT QUẢ
 *     TƯƠNG ĐƯƠNG, nhưng kèm điều kiện phải GẮN NHÃN vị trí tài trợ. Chừng nào giao diện chưa
 *     có nhãn đó thì thêm vế này vào đây là bán một vị trí quảng cáo mà không nói với người
 *     xem — nên nó cố ý vắng mặt, không phải bị quên.
 */

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Trọng số bốn thành phần. Tổng phải bằng 1 — `apps/api/test/listing-recommendations.spec.ts`
 * khoá lại điều đó, vì một tổng khác 1 làm `rank_score` không còn nằm trong thang [0,1] mà ADR
 * 0043, giao diện và hai index đang giả định.
 */
export const RANK_SCORE_WEIGHTS = {
  quality: 0.45,
  traction: 0.25,
  completeness: 0.18,
  freshness: 0.12,
} as const;

/**
 * Tham số của trung bình Bayes.
 *
 * `priorRating` là mặt bằng đánh giá của cả sàn — một xe chưa ai chấm được coi là trung bình,
 * không phải tệ nhất. `priorWeight` là "số đánh giá ảo": với 5, một xe cần khoảng chục đánh
 * giá thật thì điểm của nó mới chủ yếu là điểm của chính nó.
 *
 * Đây là hằng số SẢN PHẨM, không phải hằng số kỹ thuật: khi sàn có đủ dữ liệu, `priorRating`
 * nên được đặt lại bằng trung bình thật đo được thay vì con số ước lượng này.
 */
export const RANK_SCORE_BAYES = { priorRating: 4.6, priorWeight: 5 } as const;

/** Số chuyến để thành phần "đã chạy thật" chạm trần — ngoài mốc này thêm chuyến không thêm điểm. */
export const RANK_SCORE_TRIPS_CAP = 50;

/** Hằng số phai của độ mới, tính bằng NGÀY. */
export const RANK_SCORE_FRESHNESS_DAYS = 30;

/**
 * Phạm vi tính lại. Không truyền gì = toàn bảng (nhịp ngày của worker).
 *
 * Hẹp lại theo xe/gian hàng để lối ghi trong transaction nghiệp vụ chỉ đụng đúng những dòng nó
 * vừa làm thay đổi — một lần duyệt xe không được kéo theo một lần UPDATE toàn bảng.
 */
export interface ListingRankScope {
  vehicleId?: string;
  tenantId?: string;
}

/**
 * Tính lại `rank_score` cho các listing thuộc `scope`. Trả về số dòng thực sự đổi giá trị.
 *
 * MỘT câu UPDATE, không kéo dòng nào về Node: ở nhịp ngày đây là phép quét toàn bảng, và đọc
 * ra rồi ghi lại từng dòng sẽ biến nó thành hàng chục nghìn lượt round-trip.
 *
 * Idempotent: chạy hai lần liên tiếp ra cùng giá trị (trừ phần độ mới phai theo thời gian thật),
 * và `IS DISTINCT FROM` khiến lần thứ hai không ghi gì — WAL không phình vì một job chạy lại.
 */
export async function refreshListingRankScore(
  db: Client,
  scope: ListingRankScope = {},
): Promise<number> {
  /*
   * Chỉ tính cho listing đang hiển thị. Xe đã ẩn/gỡ vẫn còn dòng trong bảng, nhưng điểm của nó
   * không ai đọc (mọi đường đọc đều lọc `status = 'active'`) — tính lại mỗi đêm cho chúng là
   * ghi WAL cho một con số không ai dùng. Khi xe được bật lại, `syncFromVehicle` gọi hàm này
   * cho chính nó nên điểm luôn tươi đúng lúc cần.
   */
  const filters: Prisma.Sql[] = [Prisma.sql`p."status" = ${LISTING_STATUS.ACTIVE}`];
  if (scope.vehicleId) filters.push(Prisma.sql`p."vehicle_id" = ${scope.vehicleId}`);
  if (scope.tenantId) filters.push(Prisma.sql`p."tenant_id" = ${scope.tenantId}`);
  const where = Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`;

  const { priorRating, priorWeight } = RANK_SCORE_BAYES;

  return db.$executeRaw`
    UPDATE "public_listings" pl
       SET "rank_score" = s."score"
      FROM (
        SELECT p."id",
               ROUND(
                   -- Chất lượng (Bayes): điểm thật của xe bị kéo về mặt bằng sàn theo số đánh
                   -- giá nó có, rồi đưa thang 1–5 về [0,1].
                   ${RANK_SCORE_WEIGHTS.quality}::numeric * GREATEST(0, LEAST(1,
                     ((p."rating_count" * COALESCE(p."rating_avg", 0)
                        + ${priorWeight}::numeric * ${priorRating}::numeric)
                       / (p."rating_count" + ${priorWeight}::numeric) - 1) / 4
                   ))
                 -- Số chuyến đã hoàn thành, thang log và có trần.
                 + ${RANK_SCORE_WEIGHTS.traction}::numeric * LEAST(1,
                     LN(1 + tr."trips"::numeric) / LN(1 + ${RANK_SCORE_TRIPS_CAP}::numeric)
                   )
                 -- Độ đầy hồ sơ: bốn điều kiện đếm được, không điều kiện nào là lời hứa.
                 + ${RANK_SCORE_WEIGHTS.completeness}::numeric * ((
                       (p."main_image_url" IS NOT NULL)::int
                     + (p."weekday_price" IS NOT NULL)::int
                     + (img."images" >= 4)::int
                     + (COALESCE(array_length(p."features", 1), 0) >= 3)::int
                   )::numeric / 4)
                 -- Độ mới, phai theo hàm mũ.
                 + ${RANK_SCORE_WEIGHTS.freshness}::numeric * EXP(-(
                     EXTRACT(EPOCH FROM (now() - p."created_at"))
                       / 86400 / ${RANK_SCORE_FRESHNESS_DAYS}::numeric
                   )::numeric)
               , 6) AS "score"
          FROM "public_listings" p
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS "trips"
              FROM "bookings" b
             WHERE b."vehicle_id" = p."vehicle_id"
               AND b."status" = ${BOOKING_STATUS.COMPLETED}
               AND b."deleted_at" IS NULL
          ) tr ON true
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS "images"
              FROM "vehicle_images" vi
             WHERE vi."vehicle_id" = p."vehicle_id"
          ) img ON true
          ${where}
      ) s
     WHERE pl."id" = s."id"
       AND pl."rank_score" IS DISTINCT FROM s."score"
  `;
}
