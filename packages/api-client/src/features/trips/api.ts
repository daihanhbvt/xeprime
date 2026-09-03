import type { components, PaginationMeta } from '@xeprime/types';
import { getApiClient } from '../../client';
import type { QueryParams } from '../../url';

type Schemas = components['schemas'];

export type CustomerTrip = Schemas['CustomerTripListItemDto'];
export type CustomerTripDetail = Schemas['CustomerTripDetailDto'];
export type CustomerTripFinance = Schemas['CustomerTripFinanceDto'];
export type CustomerTripCounts = Schemas['CustomerTripCountsDto'];
export type CustomerSurcharge = Schemas['CustomerSurchargeDto'];
export type CustomerTripReview = Schemas['CustomerTripReviewDto'];

/**
 * Biên bản bàn giao mà KHÁCH được xem — bản của khách, không phải `HandoverDto` của gian hàng.
 *
 * Khác biệt nằm ở những gì KHÔNG có: không `fileId`, không tên file gốc, không ghi chú nội bộ,
 * không tên người xác nhận, không `rowVersion`. Đó là chủ ý ở backend, và dùng đúng type này
 * (thay vì mượn tạm type của gian hàng) là cách để một lần "tiện thể hiển thị thêm" không lọt
 * qua typecheck.
 */
export type CustomerTripHandoverEvidence = Schemas['CustomerTripHandoverEvidenceDto'];
export type CustomerTripHandoverEvidencePhoto = Schemas['CustomerTripHandoverEvidencePhotoDto'];
/** Vé xem ảnh riêng tư: URL ký + hạn dùng. Dùng chung shape với kho tài liệu. */
export type PrivateFileTicket = Schemas['SourceContractDownloadDto'];

export const TRIPS_DEFAULT_LIMIT = 10;

export interface TripsResult {
  items: CustomerTrip[];
  meta: PaginationMeta;
  counts: CustomerTripCounts;
}

const EMPTY_COUNTS: CustomerTripCounts = {
  all: 0,
  pending: 0,
  upcoming: 0,
  active: 0,
  completed: 0,
  cancelled: 0,
};

export function tripsToParams(filter: string, page: number): QueryParams {
  return { filter, page, limit: TRIPS_DEFAULT_LIMIT };
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

export const tripsApi = {
  async list(filter: string, page: number): Promise<TripsResult> {
    const res = (await getApiClient().request<CustomerTrip[]>('/trips', {
      query: tripsToParams(filter, page),
    })) as TripsEnvelope;

    return {
      items: res.data,
      meta: res.meta ?? {
        page,
        limit: TRIPS_DEFAULT_LIMIT,
        total: res.data.length,
        hasNext: false,
      },
      counts: res.counts ?? EMPTY_COUNTS,
    };
  },

  /** Nhận CẢ id yêu cầu lẫn id đơn — một màn phục vụ hai giai đoạn của cùng một chuyến. */
  detail(id: string): Promise<CustomerTripDetail> {
    return getApiClient().get<CustomerTripDetail>(`/trips/${encodeURIComponent(id)}`);
  },

  /**
   * Biên bản giao/nhận xe ĐÃ XÁC NHẬN của chuyến này.
   *
   * Mảng rỗng là câu trả lời hợp lệ (chuyến chưa được duyệt, hoặc gian hàng chưa xác nhận bàn
   * giao nào) — không phải lỗi, và giao diện không được biến nó thành thông báo hỏng.
   */
  handoverEvidence(id: string): Promise<CustomerTripHandoverEvidence[]> {
    return getApiClient().get<CustomerTripHandoverEvidence[]>(
      `/trips/${encodeURIComponent(id)}/handover-evidence`,
    );
  },

  /**
   * Vé xem MỘT ảnh hiện trạng — xin lại cho từng cú bấm.
   *
   * URL ký sống vài phút, nên không bản nào được giữ trong state, trong cache hay trong DOM lâu
   * hơn lần xem đang diễn ra.
   */
  handoverPhotoUrl(id: string, type: string, slot: string): Promise<PrivateFileTicket> {
    return getApiClient().get<PrivateFileTicket>(
      `/trips/${encodeURIComponent(id)}/handover-evidence/${encodeURIComponent(type)}/photos/${encodeURIComponent(slot)}/download`,
    );
  },

  /**
   * Khách tự huỷ chuyến của mình — ĐƯỜNG GHI DUY NHẤT của khách.
   *
   * Phát sinh, hoàn cọc, đổi lịch đều thuộc luồng chủ xe. Mở thêm đường ghi cho khách là dựng
   * một máy trạng thái thứ hai chạy song song với máy đã có.
   *
   * Trả về chính chuyến đó sau khi huỷ (đã đổi chặng), nên nơi gọi ghi thẳng vào cache thay vì
   * đọc lần thứ hai chỉ để biết kết quả của việc mình vừa làm.
   */
  cancel(id: string): Promise<CustomerTripDetail> {
    return getApiClient().post<CustomerTripDetail>(`/trips/${encodeURIComponent(id)}/cancel`);
  },
};
