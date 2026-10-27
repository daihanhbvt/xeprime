import type {
  CustomerCancellationReason,
  HandoverPhotoSlot,
  HandoverType,
  PaginationMeta,
} from '@xeprime/types';
import { startOfAppDay } from '@/lib/datetime';
import { apiGet, apiRequest, type QueryParams } from '@/services/api-client';
import type {
  CustomerTrip,
  CustomerTripCancelPreview,
  CustomerTripCounts,
  CustomerTripDetail,
  CustomerTripHandoverEvidence,
  CustomerUnpaidHolds,
  PrivateFileTicket,
  ProvideRefundAccountInput,
} from './types';

export const TRIPS_DEFAULT_LIMIT = 10;

export interface TripsResult {
  items: CustomerTrip[];
  meta: PaginationMeta;
  counts: CustomerTripCounts;
}

const EMPTY_COUNTS: CustomerTripCounts = { current: 0, history: 0 };

/**
 * Tham số truy vấn của `GET /trips`.
 *
 * `role` là chiều THỨ BA, thêm 15/09/2026: `renter` (tôi đi thuê) hoặc `host` (tôi cho thuê).
 * Nó đi lên SERVER chứ không lọc ở client — lọc một trang kết quả sẽ cho ra những trang dài
 * ngắn khác nhau và một con số tổng không khớp thứ người dùng đếm được trên màn hình.
 *
 * Bỏ trống ⇒ server trả cả hai vai, như trước.
 */
export function tripsToParams(
  filter: string,
  page: number,
  role?: string,
  narrow?: TripListNarrow,
): QueryParams {
  return {
    filter,
    page,
    limit: TRIPS_DEFAULT_LIMIT,
    ...(role ? { role } : {}),
    ...(narrow?.q ? { q: narrow.q } : {}),
    // URL giữ `YYYY-MM-DD` (giờ VN) → API nhận mốc tuyệt đối: từ 00:00 ngày đầu đến hết ngày cuối.
    ...(narrow?.from ? { dateFrom: startOfAppDay(narrow.from).toISOString() } : {}),
    ...(narrow?.to
      ? {
          dateTo: startOfAppDay(narrow.to).add(1, 'day').subtract(1, 'millisecond').toISOString(),
        }
      : {}),
  };
}

/** Ô "Tìm kiếm chuyến đi" + "Chọn khoảng thời gian" — ngày ở dạng `YYYY-MM-DD` giờ VN. */
export interface TripListNarrow {
  q?: string;
  from?: string;
  to?: string;
}

/**
 * Envelope riêng của `GET /trips`: ngoài `data`/`meta` còn mang `counts` cho các tab. Số trên
 * tab và danh sách phải đến từ CÙNG một lần đọc — tách thành request thứ hai là mở đường cho
 * tab hiện `Đang thuê (1)` trong khi danh sách trống.
 */
interface TripsEnvelope {
  data: CustomerTrip[];
  meta?: PaginationMeta;
  counts?: CustomerTripCounts;
}

export async function fetchTrips(
  filter: string,
  page: number,
  role?: string,
  narrow?: TripListNarrow,
): Promise<TripsResult> {
  const res = (await apiRequest<CustomerTrip[]>('/trips', {
    query: tripsToParams(filter, page, role, narrow),
  })) as TripsEnvelope;

  return {
    items: res.data,
    meta: res.meta ?? {
      page: 1,
      limit: TRIPS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
    counts: res.counts ?? EMPTY_COUNTS,
  };
}

/**
 * Chuyến khách đang GIỮ mà chưa trả, gấp nhất trước, và đã chạm trần chưa — chạm trần thì server từ
 * chối mọi yêu cầu đặt xe mới (`HOLD_LIMIT_REACHED`).
 */
export function fetchUnpaidHolds(): Promise<CustomerUnpaidHolds> {
  return apiGet<CustomerUnpaidHolds>('/trips/unpaid-holds');
}

export function fetchTrip(id: string): Promise<CustomerTripDetail> {
  return apiRequest<CustomerTripDetail>(`/trips/${id}`).then((res) => res.data);
}

/**
 * Biên bản giao/nhận xe ĐÃ XÁC NHẬN của chuyến này.
 *
 * Mảng rỗng là câu trả lời hợp lệ (chuyến chưa được duyệt, hoặc gian hàng chưa xác nhận bàn
 * giao nào) — không phải lỗi, và giao diện không được biến nó thành thông báo hỏng.
 */
export function fetchTripHandoverEvidence(id: string): Promise<CustomerTripHandoverEvidence[]> {
  return apiGet<CustomerTripHandoverEvidence[]>(`/trips/${id}/handover-evidence`);
}

/**
 * Vé xem MỘT ảnh hiện trạng — xin lại cho từng cú bấm.
 *
 * URL ký sống vài phút, nên không có bản nào được giữ trong state, trong cache hay trong DOM
 * lâu hơn lần xem đang diễn ra. Cùng kỷ luật với kho tài liệu riêng tư (Wave 4.1).
 */
export function fetchTripHandoverPhotoUrl(
  id: string,
  type: HandoverType,
  slot: HandoverPhotoSlot,
): Promise<PrivateFileTicket> {
  return apiGet<PrivateFileTicket>(
    `/trips/${id}/handover-evidence/${type}/photos/${slot}/download`,
  );
}

/**
 * Xem trước lượt huỷ — số được hoàn vào Ví điểm / số mất, do server tính bằng đúng luật lượt huỷ
 * thật áp (ADR 0064). Client không cộng trừ gì.
 */
export function fetchTripCancelPreview(id: string): Promise<CustomerTripCancelPreview> {
  return apiGet<CustomerTripCancelPreview>(`/trips/${id}/cancel-preview`);
}

/**
 * Khách tự huỷ chuyến của mình.
 *
 * Trả về chính chuyến đó sau khi huỷ (đã đổi chặng) nên nơi gọi ghi thẳng vào cache, không cần
 * một lượt đọc thứ hai chỉ để biết kết quả của việc mình vừa làm.
 */
export function cancelTrip(
  id: string,
  reasonCategory: CustomerCancellationReason,
): Promise<CustomerTripDetail> {
  return apiRequest<CustomerTripDetail>(`/trips/${id}/cancel`, {
    method: 'POST',
    body: { reasonCategory },
  }).then(
    (res) => res.data,
  );
}

/**
 * Khách báo "Chưa nhận được xe" — ADR 0066, lớp 1. Server mở một tranh chấp khẩn (idempotent) và
 * trả về chính chuyến đó với `openDispute = true`, như `cancelTrip`.
 */
export function reportTripNotReceived(id: string): Promise<CustomerTripDetail> {
  return apiRequest<CustomerTripDetail>(`/trips/${id}/report-not-received`, {
    method: 'POST',
  }).then((res) => res.data);
}

/**
 * Khách khai tài khoản nhận tiền hoàn khoản giữ chỗ — ADR 0033.
 *
 * Bắt buộc trước khi admin chuyển được: `markRefundPaid` từ chối một lệnh chuyển không có đích.
 * Trả về chính chuyến đó để nơi gọi ghi thẳng vào cache, giống `cancelTrip`.
 */
export function provideRefundAccount(
  id: string,
  body: ProvideRefundAccountInput,
): Promise<CustomerTripDetail> {
  return apiRequest<CustomerTripDetail>(`/trips/${id}/refund-account`, {
    method: 'POST',
    body,
  }).then((res) => res.data);
}
