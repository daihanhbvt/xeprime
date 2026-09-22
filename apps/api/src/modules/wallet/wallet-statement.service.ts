import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  BOOKING_STATUS,
  REVIEW_STATUS,
  SUBSCRIPTION_INVOICE_STATUS,
  WALLET_STATEMENT_UNIT,
  isTaxPeriodKey,
  taxPeriodKeyVn,
  taxPeriodRangeVn,
  type BookingPriceSnapshot,
  type ServiceType,
  type WalletStatementUnit,
} from '@xeprime/types';
import { resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { HostMetricsService } from '../host-metrics/host-metrics.service';
import {
  STATEMENT_DEFAULT_LIMIT,
  STATEMENT_MAX_LIMIT,
  type WalletStatementDto,
  type WalletStatementQueryDto,
  type WalletStatementStatsDto,
  type WalletStatementTotalsDto,
  type WalletStatementTripDto,
} from './dto/wallet.dto';
import { WalletService, type WalletOwner } from './wallet.service';

const TRIP_SELECT = {
  id: true,
  code: true,
  serviceType: true,
  pickupAt: true,
  returnAt: true,
  actualReturnAt: true,
  totalAmount: true,
  taxAmount: true,
  depositAmountOnline: true,
  priceSnapshot: true,
} satisfies Prisma.BookingSelect;

type TripRow = Prisma.BookingGetPayload<{ select: typeof TRIP_SELECT }>;

/**
 * "Bảng tổng hợp giao dịch" của gian hàng — một KỲ `YYYY-MM` theo giờ Việt Nam.
 *
 * Chỉ ĐỌC, và cố ý nằm ngoài `WalletReadService`: sổ ví trả lời "tiền vào ra ví thế nào", còn
 * bảng này trả lời "tháng vừa rồi tôi làm ăn ra sao" — nó đọc `bookings`, `reviews`,
 * `booking_requests` và `subscription_invoices`, tức bốn bảng mà đường đọc ví không hề biết tới.
 *
 * ## Kỳ tính theo giờ VIỆT NAM, không phải UTC
 *
 * Dùng chung `taxPeriodRangeVn` với sổ thuế. Mỗi tháng có một khoảng bảy giờ mà giờ UTC và giờ
 * VN thuộc hai kỳ khác nhau; tính hai kiểu thì một chuyến trả xe tối 31/10 sẽ nằm ở tháng 10
 * trên bảng này và tháng 11 trên bảng kê thuế, và không ai đối chiếu nổi hai tờ.
 *
 * ## Vì sao KHÔNG có cột "phí sàn"
 *
 * Phí dịch vụ XePrime do KHÁCH trả thêm (`FEE_BEARER.CUSTOMER`, ADR 0032 điều 2) — nó không trừ
 * vào doanh thu gian hàng. Đặt nó thành một dòng khấu trừ trong bảng thu nhập của chủ xe là bịa
 * ra một khoản họ không hề mất, và CLAUDE.md cấm dùng một con số đại diện cho cả phí dịch vụ lẫn
 * thuế lẫn tiền phải trả chủ xe.
 *
 * ## Ba con số tiền KHÔNG được gộp
 *
 * `revenueTotal` là tiền thuê thu được; `balanceChangeTotal` là phần chảy qua ví XePrime
 * (`D − T`); phần còn lại `payAtPickupTotal = B − D` khách trả TAY cho chủ xe lúc nhận xe và
 * không bao giờ đi qua nền tảng. Bảng phải hiện cả ba, nếu không chủ xe đọc `balanceChange` nhỏ
 * hơn `revenue` rồi tin rằng XePrime đang giữ mất tiền của mình.
 */
@Injectable()
export class WalletStatementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    /** Tỉ lệ phản hồi / nhận chuyến — nguồn tính DUY NHẤT (ADR 0045 điều 2). */
    private readonly hostMetrics: HostMetricsService,
  ) {}

  /** Kỳ hiện tại theo giờ Việt Nam — mặc định khi client không gửi `period`. */
  currentPeriodKey(now: Date = new Date()): string {
    return taxPeriodKeyVn(now);
  }

  async tenantStatement(
    tenantId: string,
    owner: WalletOwner,
    query: WalletStatementQueryDto,
  ): Promise<WalletStatementDto> {
    const periodKey =
      query.period && isTaxPeriodKey(query.period) ? query.period : this.currentPeriodKey();
    const { start, end } = taxPeriodRangeVn(periodKey);
    const paging = resolvePaging(query, STATEMENT_DEFAULT_LIMIT, STATEMENT_MAX_LIMIT);

    /*
     * "Chuyến kết thúc trong kỳ" = `COALESCE(actual_return_at, return_at)` thuộc `[start, end)`.
     * Viết bằng `OR` thay vì SQL thô để giữ kiểu của Prisma; hai nhánh loại trừ nhau nên không
     * đơn nào bị đếm hai lần.
     */
    const where: Prisma.BookingWhereInput = {
      tenantId,
      deletedAt: null,
      status: BOOKING_STATUS.COMPLETED,
      OR: [
        { actualReturnAt: { gte: start, lt: end } },
        { actualReturnAt: null, returnAt: { gte: start, lt: end } },
      ],
    };

    const walletId = await this.wallet.findWalletId(owner);

    const [aggregate, rows, stats, subscriptionFeeTotal, balanceChangeTotal] = await Promise.all([
      this.prisma.booking.aggregate({
        where,
        _count: { _all: true },
        _sum: { totalAmount: true, taxAmount: true, depositAmountOnline: true },
      }),
      this.prisma.booking.findMany({
        where,
        select: TRIP_SELECT,
        // Mới nhất trước — cùng nhịp với sổ ví ngay bên dưới trên cùng màn hình.
        orderBy: [{ returnAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
      }),
      this.periodStats(tenantId, start, end),
      this.subscriptionFeeInPeriod(tenantId, start, end),
      this.balanceChangeTotal(walletId, tenantId, start, end),
    ]);

    const balanceByBooking = await this.balanceChangeByBooking(
      walletId,
      rows.map((row) => row.id),
    );

    const zero = new Prisma.Decimal(0);
    const revenueTotal = aggregate._sum.totalAmount ?? zero;
    const taxTotal = aggregate._sum.taxAmount ?? zero;
    const depositOnlineTotal = aggregate._sum.depositAmountOnline ?? zero;

    const totals: WalletStatementTotalsDto = {
      revenueTotal: revenueTotal.toFixed(0),
      taxTotal: taxTotal.toFixed(0),
      payAtPickupTotal: revenueTotal.minus(depositOnlineTotal).toFixed(0),
      balanceChangeTotal: balanceChangeTotal.toFixed(0),
      subscriptionFeeTotal: subscriptionFeeTotal.toFixed(0),
      ownerIncome: revenueTotal.minus(taxTotal).minus(subscriptionFeeTotal).toFixed(0),
    };

    const total = aggregate._count._all;
    return {
      periodKey,
      stats: { ...stats, completedTripCount: total },
      totals,
      items: rows.map((row) => toTripDto(row, balanceByBooking.get(row.id) ?? zero)),
      total,
      page: paging.page,
      limit: paging.limit,
      hasNext: paging.page * paging.limit < total,
    };
  }

  /**
   * Đánh giá và tỉ lệ phản hồi CỦA KỲ.
   *
   * Cả hai theo kỳ chứ không lấy số luỹ kế của gian hàng: cả bảng này nói về một tháng, và một
   * con số toàn thời gian đứng giữa những con số của tháng là thứ không ai đọc đúng được. Kỳ
   * chưa có đánh giá nào ⇒ `ratingAvg = null` (hiện dấu gạch), không phải 0 sao.
   */
  private async periodStats(
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<Omit<WalletStatementStatsDto, 'completedTripCount'>> {
    const [reviews, metrics] = await Promise.all([
      this.prisma.review.aggregate({
        where: {
          tenantId,
          status: REVIEW_STATUS.PUBLISHED,
          deletedAt: null,
          createdAt: { gte: start, lt: end },
        },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      /*
       * Tỉ lệ phản hồi đi qua CÙNG nguồn với trang công khai (ADR 0045 điều 2) — chỉ khác hai
       * tham số TRÌNH BÀY, còn phép phân loại thì y hệt. Trước đợt này hai nơi tự cộng lấy hai
       * bộ mảng trạng thái và đã bắt đầu trôi khỏi nhau; một gian hàng đọc hai con số khác nhau
       * về chính mình thì không tin con số nào nữa.
       *
       *   · CỬA SỔ — đúng kỳ của bảng này, không phải 90 ngày. Một con số 90 ngày đứng giữa
       *     những con số của tháng 4 là thứ không ai đọc đúng được.
       *   · NGƯỠNG — hạ về 1. Ngưỡng `HOST_METRIC_MIN_SAMPLES` bảo vệ người LẠ khỏi kết luận từ
       *     một lần tung đồng xu; chủ xe đọc tháng của CHÍNH MÌNH đã sống qua cả ba yêu cầu đó,
       *     và bảng in `responseSampleCount` ngay cạnh. Giấu "2/3" khỏi họ không bảo vệ ai.
       */
      this.hostMetrics.forTenant(tenantId, { since: start, until: end, minSamples: 1 }),
    ]);

    const ratingCount = reviews._count._all;
    return {
      // `_avg` trả `null` khi không có dòng nào — giữ nguyên `null`, đừng ép về 0.
      ratingAvg:
        ratingCount === 0 || reviews._avg.rating === null
          ? null
          : Math.round(reviews._avg.rating * 10) / 10,
      ratingCount,
      responseRatePercent: metrics.responseRatePercent,
      responseSampleCount: metrics.sampleCount,
      acceptKeepRatePercent: metrics.acceptKeepRatePercent,
    };
  }

  /**
   * Phí gói ĐÃ TRẢ trong kỳ — mốc là `paid_at`, không phải kỳ hiệu lực của gói.
   *
   * Một gói 6 tháng trả một lần thì toàn bộ số tiền rơi vào tháng trả; rải đều ra sáu tháng là
   * kế toán dồn tích, còn bảng này là bảng TIỀN MẶT của chủ gian hàng. Tuyến hoa hồng không có
   * hoá đơn gói nào ⇒ 0.
   *
   * Cố ý KHÔNG đọc `payments`: tiền gói là doanh thu của XePrime, và ADR 0022 điều 6 cấm nối nó
   * vào phiếu thu của chính tenant.
   */
  private async subscriptionFeeInPeriod(
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<Prisma.Decimal> {
    const agg = await this.prisma.subscriptionInvoice.aggregate({
      where: {
        tenantId,
        status: SUBSCRIPTION_INVOICE_STATUS.PAID,
        paidAt: { gte: start, lt: end },
      },
      _sum: { paidAmount: true },
    });
    return agg._sum.paidAmount ?? new Prisma.Decimal(0);
  }

  /**
   * Ví nhúc nhích bao nhiêu vì từng chuyến — đọc từ SỔ, không tính lại từ `owner_payable_amount`.
   *
   * Hai con số đó bằng nhau ở đường đi bình thường, nhưng một lần đảo bút toán (chuyển hụt, admin
   * điều chỉnh) chỉ hiện ra ở sổ. Tính lại nghĩa là bảng vẫn hiện số cũ trong khi số dư đã đổi.
   */
  private async balanceChangeByBooking(
    walletId: string | null,
    bookingIds: string[],
  ): Promise<Map<string, Prisma.Decimal>> {
    if (!walletId || bookingIds.length === 0) return new Map();
    const grouped = await this.prisma.walletEntry.groupBy({
      by: ['bookingId'],
      where: { walletId, bookingId: { in: bookingIds } },
      _sum: { amount: true },
    });
    const map = new Map<string, Prisma.Decimal>();
    for (const row of grouped) {
      if (row.bookingId === null) continue;
      map.set(row.bookingId, row._sum.amount ?? new Prisma.Decimal(0));
    }
    return map;
  }

  /**
   * Tổng thay đổi số dư của CẢ KỲ.
   *
   * SQL thô vì phép này bắc qua hai bảng: các dòng sổ phải lọc theo chuyến KẾT THÚC trong kỳ, mà
   * `COALESCE(actual_return_at, return_at)` nằm ở `bookings`. Cách còn lại là kéo hết id chuyến
   * của kỳ về Node rồi truyền vào `IN (...)` — với gian hàng 40 xe đó là vài trăm id đi qua bộ
   * nhớ mỗi lần mở màn hình, để đổi lấy đúng một con số.
   */
  private async balanceChangeTotal(
    walletId: string | null,
    tenantId: string,
    start: Date,
    end: Date,
  ): Promise<Prisma.Decimal> {
    if (!walletId) return new Prisma.Decimal(0);
    const rows = await this.prisma.$queryRaw<Array<{ amount: Prisma.Decimal | null }>>`
      SELECT COALESCE(SUM(we.amount), 0) AS amount
        FROM wallet_entries we
        JOIN bookings b ON b.id = we.booking_id
       WHERE we.wallet_id = ${walletId}
         AND b.tenant_id = ${tenantId}
         AND b.deleted_at IS NULL
         AND b.status = ${BOOKING_STATUS.COMPLETED}
         AND COALESCE(b.actual_return_at, b.return_at) >= ${start}
         AND COALESCE(b.actual_return_at, b.return_at) < ${end}
    `;
    return new Prisma.Decimal(rows[0]?.amount ?? 0);
  }
}

// ── Hàm thuần ───────────────────────────────────────────────────────────────

function toTripDto(row: TripRow, balanceChange: Prisma.Decimal): WalletStatementTripDto {
  const unit = unitPriceOf(row);
  const depositOnline = row.depositAmountOnline ?? new Prisma.Decimal(0);
  return {
    bookingId: row.id,
    code: row.code,
    serviceType: row.serviceType as ServiceType,
    pickupAt: row.pickupAt.toISOString(),
    // Ngày về THỰC TẾ khi đã có — đó mới là lúc chuyến kết thúc, và cũng là mốc xếp nó vào kỳ.
    returnAt: (row.actualReturnAt ?? row.returnAt).toISOString(),
    unitAmount: unit?.amount ?? null,
    unitKind: unit?.kind ?? null,
    revenueAmount: row.totalAmount.toFixed(0),
    taxAmount: row.taxAmount.toFixed(0),
    payAtPickupAmount: row.totalAmount.minus(depositOnline).toFixed(0),
    balanceChange: balanceChange.toFixed(0),
  };
}

/**
 * Đơn giá một đơn vị thuê, đọc từ SNAPSHOT giá đã đóng băng trên đơn (ADR 0024).
 *
 * Đơn dài hạn trả giá THÁNG (`effectiveMonthlyAmount` — đã gồm ưu đãi cam kết thời hạn), đơn
 * theo ngày trả `totalAmount / days`. Chia cho `30` để suy giá ngày của một gói tháng là điều
 * CLAUDE.md cấm thẳng (ADR 0011), và chia cho `days` của một đơn không có `days` thì ra `Infinity`.
 *
 * Snapshot thiếu (đơn cũ, hoặc đơn gian hàng nhập tay không kèm bảng kê) ⇒ `null`: cột hiện dấu
 * gạch. Suy ngược một đơn giá từ tổng là bịa ra con số mà chủ xe chưa từng công bố.
 */
function unitPriceOf(row: TripRow): { amount: string; kind: WalletStatementUnit } | null {
  const snapshot = row.priceSnapshot as BookingPriceSnapshot | null;
  if (!snapshot) return null;

  if (snapshot.longTerm) {
    return {
      amount: new Prisma.Decimal(snapshot.longTerm.effectiveMonthlyAmount).toFixed(0),
      kind: WALLET_STATEMENT_UNIT.MONTH,
    };
  }

  const days = snapshot.days ?? 0;
  if (days <= 0) return null;
  return {
    amount: new Prisma.Decimal(snapshot.totalAmount).dividedBy(days).toFixed(0),
    kind: WALLET_STATEMENT_UNIT.DAY,
  };
}
