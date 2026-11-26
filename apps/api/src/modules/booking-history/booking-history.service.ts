import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  BOOKING_HISTORY_KIND,
  BOOKING_HISTORY_OUTCOME,
  BOOKING_HISTORY_TAB,
  BOOKING_REQUEST_STATUS,
  BOOKING_SOURCE,
  BOOKING_SOURCE_FILTER_DIRECT,
  isMarketplaceBooking,
  BOOKING_STATUS,
  CANCELLATION_PARTY,
  hostSeesCustomerContact,
  tenantUsesManagePortal,
  type BillingMode,
  type BookingHistoryKind,
  type BookingHistoryOutcome,
  type BookingHistoryTab,
  type BookingRequestStatus,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { resolveBranchScope, type BranchScope } from '../../common/dto/branch-scope';
import { piiSearch } from '../../common/support/support-search';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BOOKING_HISTORY_DEFAULT_LIMIT,
  BOOKING_HISTORY_MAX_LIMIT,
  type BookingHistoryItemDto,
  type BookingHistoryPageDto,
  type BookingHistoryQueryDto,
} from './dto/booking-history.dto';

/** Đơn đã ra khỏi vòng đời vận hành — ba trạng thái cuối của `bookings`. */
const ENDED_BOOKING_STATUSES = [
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.NO_SHOW,
] as const;

/**
 * Sáu kết cục không-thành-đơn của một yêu cầu và nhãn kết cục của chúng — cùng tập với tab "Đã
 * kết thúc" cũ của hộp thư yêu cầu (ADR 0047). `converted_to_booking` không ở đây: chuyến đó sống
 * tiếp dưới dạng ĐƠN và đã có dòng của đơn.
 */
const CLOSED_REQUEST_OUTCOME: Readonly<Partial<Record<BookingRequestStatus, BookingHistoryOutcome>>> =
  {
    [BOOKING_REQUEST_STATUS.REJECTED_BY_HOST]: BOOKING_HISTORY_OUTCOME.REQUEST_REJECTED,
    [BOOKING_REQUEST_STATUS.EXPIRED]: BOOKING_HISTORY_OUTCOME.REQUEST_EXPIRED,
    [BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER]: BOOKING_HISTORY_OUTCOME.REQUEST_WITHDRAWN,
    [BOOKING_REQUEST_STATUS.HOLD_EXPIRED]: BOOKING_HISTORY_OUTCOME.REQUEST_HOLD_EXPIRED,
    [BOOKING_REQUEST_STATUS.SLOT_TAKEN]: BOOKING_HISTORY_OUTCOME.REQUEST_SLOT_TAKEN,
    [BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST]: BOOKING_HISTORY_OUTCOME.REQUEST_CANCELLED_BY_HOST,
  };
const CLOSED_REQUEST_STATUSES = Object.keys(CLOSED_REQUEST_OUTCOME) as BookingRequestStatus[];

/**
 * Hằng của CHÍNH ta (mã trạng thái, mã kết cục) chèn vào SQL như một literal. Chỉ nhận mã dạng
 * `snake_case` — thứ gì khác (dữ liệu người dùng) luôn đi qua tham số `${…}` của `Prisma.sql`.
 */
function code(value: string): Prisma.Sql {
  if (!/^[a-z_]+$/.test(value)) throw new Error(`Mã không hợp lệ cho SQL: ${value}`);
  return Prisma.raw(`'${value}'`);
}

function codes(values: readonly string[]): Prisma.Sql {
  return Prisma.join(values.map(code));
}

/** `ILIKE` khớp CHUỖI CON như `contains` + `mode: 'insensitive'` của Prisma — thoát `%`, `_`, `\`. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

interface PageRow {
  kind: BookingHistoryKind;
  id: string;
  outcome: BookingHistoryOutcome;
  ended_at: Date;
}

interface CountRow {
  completed: bigint;
  cancelled: bigint;
  not_converted: bigint;
}

/**
 * "Đơn đã kết thúc" của site partner (05/11/2026) — MỘT danh sách xếp theo lúc kết thúc, gộp đơn
 * đã đóng và yêu cầu không thành đơn. Module không sở hữu bảng nào: nó CHỈ ĐỌC `bookings`,
 * `booking_requests`, `booking_cancellations`.
 *
 * ## Vì sao SQL viết tay
 *
 * Thứ tự là "lúc kết thúc", và lúc đó nằm ở cột KHÁC NHAU theo kết cục: trả xe thật
 * (`actual_return_at`), lượt huỷ (`booking_cancellations.cancelled_at`), lượt từ chối (`decided_at`),
 * hạn phản hồi (`respond_by`), hạn thanh toán (`booking_holds.expires_at`). Prisma không xếp theo một
 * biểu thức, cũng không phân trang được qua HAI bảng. Một `UNION ALL` có `ORDER BY … LIMIT` phân
 * trang ở database — không tải hai bảng về rồi cắt ở Node — và số đếm các ngăn đọc từ CÙNG khối
 * `ended` đó nên không bao giờ lệch với trang.
 *
 * Bộ lọc tìm kiếm chép đúng nghĩa của `searchOr` (đơn) và `searchWhere` (yêu cầu), kể cả luật SĐT
 * khớp đủ số trong phiên hỗ trợ (`piiSearch`, ADR 0050 §11). Spec của module khoá điều đó.
 */
@Injectable()
export class BookingHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenant: {
      tenantId: string;
      allowedBranchIds: readonly string[] | null;
      billingMode: BillingMode | null;
    },
    query: BookingHistoryQueryDto,
    /** Người xem có `booking_requests.view` — vắng thì không có dòng yêu cầu nào. */
    includeRequests: boolean,
  ): Promise<BookingHistoryPageDto> {
    const paging = resolvePaging(query, BOOKING_HISTORY_DEFAULT_LIMIT, BOOKING_HISTORY_MAX_LIMIT);
    const tab = query.tab ?? BOOKING_HISTORY_TAB.ALL;
    const ended = this.endedSql(tenant.tenantId, query, tenant.allowedBranchIds, includeRequests);

    const narrow = Prisma.sql`${tabWhere(tab)}${
      query.outcome ? Prisma.sql` AND outcome = ${code(query.outcome)}` : Prisma.empty
    }`;

    const [pageRows, totalRows, countRows] = await this.prisma.$transaction([
      this.prisma.$queryRaw<PageRow[]>`
        WITH ended AS (${ended})
        SELECT kind, id, outcome, ended_at FROM ended
         WHERE ${narrow}
         ORDER BY ended_at DESC, id DESC
         LIMIT ${paging.take} OFFSET ${paging.skip}
      `,
      this.prisma.$queryRaw<{ total: bigint }[]>`
        WITH ended AS (${ended})
        SELECT count(*)::bigint AS total FROM ended WHERE ${narrow}
      `,
      this.prisma.$queryRaw<CountRow[]>`
        WITH ended AS (${ended})
        SELECT
          count(*) FILTER (WHERE outcome = ${code(BOOKING_HISTORY_OUTCOME.COMPLETED)})::bigint AS completed,
          count(*) FILTER (WHERE kind = ${code(BOOKING_HISTORY_KIND.BOOKING)}
                             AND outcome <> ${code(BOOKING_HISTORY_OUTCOME.COMPLETED)})::bigint AS cancelled,
          count(*) FILTER (WHERE kind = ${code(BOOKING_HISTORY_KIND.REQUEST)})::bigint AS not_converted
        FROM ended
      `,
    ]);

    const counts = countRows[0];
    const completed = Number(counts?.completed ?? 0);
    const cancelled = Number(counts?.cancelled ?? 0);
    const notConverted = Number(counts?.not_converted ?? 0);
    const total = Number(totalRows[0]?.total ?? 0);

    const packageTrack = tenantUsesManagePortal({ billingMode: tenant.billingMode });
    const data = await this.hydrate(tenant.tenantId, pageRows, packageTrack);

    return {
      data,
      meta: {
        ...paginationMeta(paging, total),
        tabCounts: { all: completed + cancelled + notConverted, completed, cancelled, notConverted },
        includesRequests: includeRequests,
      },
    };
  }

  /**
   * Khối `ended`: mỗi dòng là (kind, id, outcome, ended_at) đã qua tenant + chi nhánh + dịch vụ +
   * tìm kiếm. Không có lọc NGĂN ở đây — ngăn đọc khối này để đếm cả bốn ô.
   */
  private endedSql(
    tenantId: string,
    query: BookingHistoryQueryDto,
    allowedBranchIds: readonly string[] | null,
    includeRequests: boolean,
  ): Prisma.Sql {
    const branch = branchSql(resolveBranchScope(query.branchId, allowedBranchIds));
    const service = query.serviceType
      ? (alias: string) => Prisma.sql` AND ${Prisma.raw(alias)}.service_type = ${query.serviceType}`
      : () => Prisma.empty;
    const term = query.q?.trim();
    // Nguồn đơn (ADR 0110): `direct` = mọi nguồn ngoài sàn. Mã đến từ union đã validate ở DTO.
    const sourceFilter = query.source;
    const bookingSource =
      sourceFilter === BOOKING_SOURCE_FILTER_DIRECT
        ? Prisma.sql` AND b.source <> ${BOOKING_SOURCE.XEPRIME}`
        : sourceFilter
          ? Prisma.sql` AND b.source = ${sourceFilter}`
          : Prisma.empty;
    // Yêu cầu không thành đơn là của SÀN — lọc một nguồn ngoài sàn thì không còn dòng yêu cầu nào.
    const requestsInScope = !sourceFilter || isMarketplaceBooking(sourceFilter);

    const bookings = Prisma.sql`
      SELECT ${code(BOOKING_HISTORY_KIND.BOOKING)}::text AS kind,
             b.id,
             (CASE
                WHEN b.status = ${code(BOOKING_STATUS.COMPLETED)} THEN ${code(BOOKING_HISTORY_OUTCOME.COMPLETED)}
                WHEN b.status = ${code(BOOKING_STATUS.NO_SHOW)} THEN ${code(BOOKING_HISTORY_OUTCOME.NO_SHOW)}
                WHEN bc.responsible_party = ${code(CANCELLATION_PARTY.CUSTOMER)} THEN ${code(BOOKING_HISTORY_OUTCOME.CANCELLED_BY_CUSTOMER)}
                WHEN bc.responsible_party = ${code(CANCELLATION_PARTY.HOST)} THEN ${code(BOOKING_HISTORY_OUTCOME.CANCELLED_BY_HOST)}
                ELSE ${code(BOOKING_HISTORY_OUTCOME.CANCELLED_OTHER)}
              END)::text AS outcome,
             (CASE
                WHEN b.status = ${code(BOOKING_STATUS.COMPLETED)} THEN COALESCE(b.actual_return_at, b.return_at)
                ELSE COALESCE(bc.cancelled_at, b.updated_at)
              END) AS ended_at
        FROM "public"."bookings" b
        JOIN "public"."vehicles" v ON v.id = b.vehicle_id
        LEFT JOIN "public"."booking_cancellations" bc ON bc.booking_id = b.id
       WHERE b.tenant_id = ${tenantId}
         AND b.deleted_at IS NULL
         AND b.status IN (${codes(ENDED_BOOKING_STATUSES)})
         ${branch}${service('b')}${bookingSource}${term ? Prisma.sql` AND ${bookingSearchSql(term)}` : Prisma.empty}`;

    if (!includeRequests || !requestsInScope) return bookings;

    const requestOutcome = Prisma.join(
      CLOSED_REQUEST_STATUSES.map(
        (status) =>
          Prisma.sql`WHEN ${code(status)} THEN ${code(CLOSED_REQUEST_OUTCOME[status] as string)}`,
      ),
      ' ',
    );

    const requests = Prisma.sql`
      SELECT ${code(BOOKING_HISTORY_KIND.REQUEST)}::text AS kind,
             r.id,
             (CASE r.status ${requestOutcome} END)::text AS outcome,
             (CASE r.status
                WHEN ${code(BOOKING_REQUEST_STATUS.REJECTED_BY_HOST)} THEN COALESCE(r.decided_at, r.updated_at)
                WHEN ${code(BOOKING_REQUEST_STATUS.EXPIRED)} THEN r.respond_by
                WHEN ${code(BOOKING_REQUEST_STATUS.HOLD_EXPIRED)} THEN COALESCE(h.expires_at, r.updated_at)
                ELSE COALESCE(bc.cancelled_at, r.updated_at)
              END) AS ended_at
        FROM "public"."booking_requests" r
        JOIN "public"."vehicles" v ON v.id = r.vehicle_id
        LEFT JOIN "public"."booking_holds" h ON h.booking_request_id = r.id
        LEFT JOIN "public"."booking_cancellations" bc ON bc.booking_request_id = r.id
       WHERE r.tenant_id = ${tenantId}
         AND r.status IN (${codes(CLOSED_REQUEST_STATUSES)})
         ${branch}${service('r')}${term ? Prisma.sql` AND ${requestSearchSql(term)}` : Prisma.empty}`;

    return Prisma.sql`${bookings} UNION ALL ${requests}`;
  }

  /** Nạp đủ trường hiển thị cho đúng các dòng của trang — giữ thứ tự của câu xếp. */
  private async hydrate(
    tenantId: string,
    rows: readonly PageRow[],
    packageTrack: boolean,
  ): Promise<BookingHistoryItemDto[]> {
    const bookingIds = rows.filter((r) => r.kind === BOOKING_HISTORY_KIND.BOOKING).map((r) => r.id);
    const requestIds = rows.filter((r) => r.kind === BOOKING_HISTORY_KIND.REQUEST).map((r) => r.id);
    const vehicle = { select: { name: true, plateNumber: true, mainImageUrl: true } } as const;

    const [bookings, requests] = await Promise.all([
      bookingIds.length === 0
        ? []
        : this.prisma.booking.findMany({
            where: { tenantId, id: { in: bookingIds } },
            select: {
              id: true,
              code: true,
              serviceType: true,
              source: true,
              sourceLabel: true,
              longTermPackageMonths: true,
              vehicleId: true,
              customerName: true,
              customerPhone: true,
              pickupAt: true,
              returnAt: true,
              vehicle,
            },
          }),
      requestIds.length === 0
        ? []
        : this.prisma.bookingRequest.findMany({
            where: { tenantId, id: { in: requestIds } },
            select: {
              id: true,
              serviceType: true,
              longTermPackageMonths: true,
              vehicleId: true,
              customerName: true,
              customerPhone: true,
              pickupAt: true,
              returnAt: true,
              vehicle,
            },
          }),
    ]);
    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    const requestById = new Map(requests.map((r) => [r.id, r]));
    // Cùng cổng với hộp thư yêu cầu (ADR 0056): yêu cầu chết trước khi có đơn không mở SĐT cho chủ
    // xe tuyến hoa hồng — mọi dòng yêu cầu ở đây đều chưa từng có đơn.
    const requestContactVisible = hostSeesCustomerContact({ engaged: false, packageTrack });

    const items: BookingHistoryItemDto[] = [];
    for (const row of rows) {
      const base = { kind: row.kind, id: row.id, outcome: row.outcome, endedAt: row.ended_at.toISOString() };
      if (row.kind === BOOKING_HISTORY_KIND.BOOKING) {
        const b = bookingById.get(row.id);
        if (!b) continue;
        items.push({
          ...base,
          code: b.code,
          serviceType: b.serviceType,
          source: b.source,
          sourceLabel: b.sourceLabel,
          longTermPackageMonths: b.longTermPackageMonths,
          vehicleId: b.vehicleId,
          vehicleName: b.vehicle.name,
          vehiclePlate: b.vehicle.plateNumber,
          vehicleImageUrl: b.vehicle.mainImageUrl,
          customerName: b.customerName,
          customerPhone: b.customerPhone,
          pickupAt: b.pickupAt.toISOString(),
          returnAt: b.returnAt.toISOString(),
        });
        continue;
      }
      const r = requestById.get(row.id);
      if (!r) continue;
      items.push({
        ...base,
        code: null,
        serviceType: r.serviceType,
        source: BOOKING_SOURCE.XEPRIME,
        sourceLabel: null,
        longTermPackageMonths: r.longTermPackageMonths,
        vehicleId: r.vehicleId,
        vehicleName: r.vehicle.name,
        vehiclePlate: r.vehicle.plateNumber,
        vehicleImageUrl: r.vehicle.mainImageUrl,
        customerName: r.customerName,
        customerPhone: requestContactVisible ? r.customerPhone : null,
        pickupAt: r.pickupAt?.toISOString() ?? null,
        returnAt: r.returnAt?.toISOString() ?? null,
      });
    }
    return items;
  }
}

/** Ngăn → điều kiện trên khối `ended`. */
function tabWhere(tab: BookingHistoryTab): Prisma.Sql {
  switch (tab) {
    case BOOKING_HISTORY_TAB.COMPLETED:
      return Prisma.sql`kind = ${code(BOOKING_HISTORY_KIND.BOOKING)} AND outcome = ${code(BOOKING_HISTORY_OUTCOME.COMPLETED)}`;
    case BOOKING_HISTORY_TAB.CANCELLED:
      return Prisma.sql`kind = ${code(BOOKING_HISTORY_KIND.BOOKING)} AND outcome <> ${code(BOOKING_HISTORY_OUTCOME.COMPLETED)}`;
    case BOOKING_HISTORY_TAB.NOT_CONVERTED:
      return Prisma.sql`kind = ${code(BOOKING_HISTORY_KIND.REQUEST)}`;
    default:
      return Prisma.sql`TRUE`;
  }
}

/** Phạm vi chi nhánh (`resolveBranchScope`) viết thành SQL trên bí danh xe `v`. */
function branchSql(scope: BranchScope): Prisma.Sql {
  if (scope === undefined) return Prisma.empty;
  if (typeof scope === 'string') return Prisma.sql` AND v.branch_id = ${scope}`;
  // Mảng rỗng = không được giao chi nhánh nào ⇒ không thấy gì (fail-closed, ADR 0052).
  if (scope.in.length === 0) return Prisma.sql` AND FALSE`;
  return Prisma.sql` AND v.branch_id IN (${Prisma.join(scope.in)})`;
}

/** SĐT theo luật `piiSearch`: chuỗi con ngoài phiên hỗ trợ, đủ số trong phiên. */
function phoneSql(column: Prisma.Sql, term: string): Prisma.Sql[] {
  const pii = piiSearch(term);
  if (pii.substring) return [Prisma.sql`${column} ILIKE ${likePattern(term)}`];
  if (pii.phones.length > 0) return [Prisma.sql`${column} IN (${Prisma.join([...pii.phones])})`];
  return [];
}

/** Cùng nghĩa với `searchOr` của BookingsService: tên khách, mã đơn, SĐT, tên xe, biển số. */
function bookingSearchSql(term: string): Prisma.Sql {
  const pattern = likePattern(term);
  return Prisma.sql`(${Prisma.join(
    [
      Prisma.sql`b.customer_name ILIKE ${pattern}`,
      Prisma.sql`b.code ILIKE ${pattern}`,
      ...phoneSql(Prisma.sql`b.customer_phone`, term),
      Prisma.sql`v.name ILIKE ${pattern}`,
      Prisma.sql`v.plate_number ILIKE ${pattern}`,
    ],
    ' OR ',
  )})`;
}

/** Cùng nghĩa với `searchWhere` của BookingRequestsService: tên khách, SĐT, tên xe, biển số. */
function requestSearchSql(term: string): Prisma.Sql {
  const pattern = likePattern(term);
  return Prisma.sql`(${Prisma.join(
    [
      Prisma.sql`r.customer_name ILIKE ${pattern}`,
      ...phoneSql(Prisma.sql`r.customer_phone`, term),
      Prisma.sql`v.name ILIKE ${pattern}`,
      Prisma.sql`v.plate_number ILIKE ${pattern}`,
    ],
    ' OR ',
  )})`;
}
