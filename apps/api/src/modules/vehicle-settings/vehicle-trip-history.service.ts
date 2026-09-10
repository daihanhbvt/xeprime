import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  VEHICLE_TRIP_HISTORY_FILTER,
  VEHICLE_TRIP_HISTORY_KIND,
  customerTripStage,
  type BookingRequestStatus,
  type BookingStatus,
  type PaginationMeta,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TRIP_HISTORY_DEFAULT_LIMIT,
  TRIP_HISTORY_MAX_LIMIT,
  VehicleTripHistoryItemDto,
  VehicleTripHistoryQueryDto,
} from './dto/vehicle-settings.dto';

/** Một dòng thô của `UNION ALL` — cột đặt tên theo DTO để map thẳng. */
interface HistoryRow {
  kind: string;
  id: string;
  booking_id: string | null;
  request_id: string | null;
  code: string | null;
  booking_status: string | null;
  request_status: string | null;
  service_type: string;
  route_type: string | null;
  pickup_at: Date | null;
  return_at: Date | null;
  long_term_package_months: number | null;
  total_amount: string | null;
  customer_name: string;
  customer_avatar_url: string | null;
  happened_at: Date;
  created_at: Date;
  decision_source: string | null;
}

/**
 * Lịch sử chuyến của MỘT xe — đơn thuê THẬT ∪ yêu cầu chưa/không thành đơn, trộn ở SQL.
 *
 * Vì sao không ghép hai danh sách ở client: mỗi bên phân trang riêng thì trang 1 của lịch sử là
 * "20 đơn mới nhất + 20 yêu cầu mới nhất" trộn lại — vừa sai thứ tự vừa sai tổng. `UNION ALL`
 * cho DB sắp một lần rồi cắt trang; `COUNT` chạy trên cùng CTE nên `total` khớp `data`.
 *
 * Một chuyến chỉ xuất hiện MỘT lần: yêu cầu đã `converted_to_booking` (hoặc có `booking_id`) bị
 * loại khỏi nhánh yêu cầu vì đơn của nó đã nằm ở nhánh đơn — nhánh đơn LEFT JOIN ngược về yêu cầu
 * để giữ avatar khách và nguồn quyết định. Đơn gian hàng tự lập không có yêu cầu vẫn hiện bình
 * thường (LEFT JOIN).
 *
 * Không N+1: ảnh khách join một lần ngay trong CTE. Không SĐT/email: thẻ chỉ cần tên và ảnh.
 */
@Injectable()
export class VehicleTripHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    vehicleId: string,
    query: VehicleTripHistoryQueryDto,
  ): Promise<{ data: VehicleTripHistoryItemDto[]; meta: PaginationMeta }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException({ code: API_ERROR_CODE.NOT_FOUND, message: 'Không tìm thấy xe' });
    }

    const paging = resolvePaging(query, TRIP_HISTORY_DEFAULT_LIMIT, TRIP_HISTORY_MAX_LIMIT);
    const filter = query.filter ?? VEHICLE_TRIP_HISTORY_FILTER.ALL;

    /*
     * `happened_at` là lần XỬ LÝ gần nhất: với đơn là `updated_at` (đổi trạng thái), với yêu cầu là
     * lúc quyết định (`decided_at`) hoặc lần cập nhật cuối. `sort_at` xếp theo mốc chuyến — đơn/
     * yêu cầu có lịch xếp theo giờ nhận, yêu cầu dài hạn chưa chốt xếp theo lúc gửi; tie-break
     * bằng id để hai trang không lặp nhau.
     */
    const items = Prisma.sql`
      SELECT
        ${VEHICLE_TRIP_HISTORY_KIND.BOOKING}::text AS kind,
        b.id                                  AS id,
        b.id                                  AS booking_id,
        br.id                                 AS request_id,
        b.code                                AS code,
        b.status                              AS booking_status,
        br.status                             AS request_status,
        b.service_type                        AS service_type,
        b.route_type                          AS route_type,
        b.pickup_at                           AS pickup_at,
        b.return_at                           AS return_at,
        b.long_term_package_months            AS long_term_package_months,
        b.total_amount::text                  AS total_amount,
        b.customer_name                       AS customer_name,
        u.avatar_url                          AS customer_avatar_url,
        b.updated_at                          AS happened_at,
        b.created_at                          AS created_at,
        br.decision_source                    AS decision_source,
        b.pickup_at                           AS sort_at
      FROM bookings b
      LEFT JOIN booking_requests br ON br.booking_id = b.id
      LEFT JOIN users u ON u.id = br.customer_user_id
      WHERE b.tenant_id = ${tenantId} AND b.vehicle_id = ${vehicleId} AND b.deleted_at IS NULL
      UNION ALL
      SELECT
        ${VEHICLE_TRIP_HISTORY_KIND.REQUEST}::text,
        r.id,
        NULL::char(26),
        r.id,
        NULL::varchar,
        NULL::varchar,
        r.status,
        r.service_type,
        r.route_type,
        r.pickup_at,
        r.return_at,
        r.long_term_package_months,
        NULL::text,
        r.customer_name,
        u.avatar_url,
        COALESCE(r.decided_at, r.updated_at),
        r.created_at,
        r.decision_source,
        COALESCE(r.pickup_at, r.created_at)
      FROM booking_requests r
      LEFT JOIN users u ON u.id = r.customer_user_id
      WHERE r.tenant_id = ${tenantId}
        AND r.vehicle_id = ${vehicleId}
        AND r.booking_id IS NULL
        AND r.status <> ${BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING}
    `;

    const where =
      filter === VEHICLE_TRIP_HISTORY_FILTER.COMPLETED
        ? Prisma.sql`WHERE kind = ${VEHICLE_TRIP_HISTORY_KIND.BOOKING} AND booking_status = ${BOOKING_STATUS.COMPLETED}`
        : filter === VEHICLE_TRIP_HISTORY_FILTER.CANCELLED
          ? Prisma.sql`WHERE (kind = ${VEHICLE_TRIP_HISTORY_KIND.BOOKING} AND booking_status IN (${BOOKING_STATUS.CANCELLED}, ${BOOKING_STATUS.NO_SHOW}))
               OR (kind = ${VEHICLE_TRIP_HISTORY_KIND.REQUEST} AND request_status IN (${BOOKING_REQUEST_STATUS.REJECTED_BY_HOST}, ${BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER}, ${BOOKING_REQUEST_STATUS.EXPIRED}, ${BOOKING_REQUEST_STATUS.HOLD_EXPIRED}))`
          : Prisma.empty;

    const [rows, counted] = await this.prisma.$transaction([
      this.prisma.$queryRaw<HistoryRow[]>`
        WITH items AS (${items})
        SELECT * FROM items ${where}
        ORDER BY sort_at DESC, id DESC
        LIMIT ${paging.take} OFFSET ${paging.skip}
      `,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`
        WITH items AS (${items})
        SELECT COUNT(*)::bigint AS total FROM items ${where}
      `,
    ]);

    return {
      data: rows.map(toItem),
      meta: paginationMeta(paging, Number(counted[0]?.total ?? 0)),
    };
  }
}

function toItem(r: HistoryRow): VehicleTripHistoryItemDto {
  const bookingStatus = (r.booking_status as BookingStatus | null) ?? null;
  // Đơn tự lập không có yêu cầu: trạng thái yêu cầu chỉ là chỗ đứng — `customerTripStage` ưu tiên đơn.
  const requestStatus =
    (r.request_status as BookingRequestStatus | null) ?? BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING;
  return {
    key: `${r.kind}:${r.id}`,
    kind: r.kind,
    bookingId: r.booking_id,
    requestId: r.request_id,
    code: r.code,
    bookingStatus,
    requestStatus: r.request_status,
    stage: customerTripStage({ requestStatus, bookingStatus }),
    serviceType: r.service_type,
    routeType: r.route_type,
    pickupAt: r.pickup_at?.toISOString() ?? null,
    returnAt: r.return_at?.toISOString() ?? null,
    longTermPackageMonths: r.long_term_package_months,
    // `numeric::text` giữ 2 số lẻ ("1560000.00"); bỏ phần lẻ 0 cho khớp các DTO tiền khác.
    totalAmount: r.total_amount == null ? null : normalizeMoney(r.total_amount),
    customerName: r.customer_name,
    customerAvatarUrl: r.customer_avatar_url,
    happenedAt: r.happened_at.toISOString(),
    createdAt: r.created_at.toISOString(),
    decisionSource: r.decision_source,
  };
}

function normalizeMoney(value: string): string {
  return value.replace(/\.00$/, '');
}
