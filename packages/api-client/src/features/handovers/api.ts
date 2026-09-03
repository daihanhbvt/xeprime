import type { components, HandoverPhotoSlot, HandoverType } from '@xeprime/types';
import { getApiClient, type Paged } from '../../client';
import type { QueryParams } from '../../url';

type Schemas = components['schemas'];

export type HandoverContext = Schemas['HandoverContextDto'];
export type Handover = Schemas['HandoverDto'];
export type HandoverPhoto = Schemas['HandoverPhotoDto'];
export type SaveHandoverInput = Schemas['SaveHandoverDto'];
export type ConfirmHandoverInput = Schemas['ConfirmHandoverDto'];
export type ResolveOdometerInput = Schemas['ResolveHandoverOdometerDto'];
export type MissingOdometerItem = Schemas['MissingOdometerItemDto'];
export type HandoverPresign = Schemas['SourceContractPresignDto'];
export type HandoverDownload = Schemas['SourceContractDownloadDto'];

/** Metadata file gửi lên bước presign — RN không có `File`, nên nơi gọi tự khai ba giá trị này. */
export interface HandoverUploadMeta {
  fileName: string;
  contentType: string;
  fileSize: number;
}

/** Chi tiết kèm lỗi 409 "KM bất thường" — server tính, UI chỉ hiển thị. */
export interface HandoverSuspicionDetails {
  suspicious: boolean;
  expectedMinKm: number;
  deltaKm: number;
  rentalDays: number;
  thresholdKmPerDay: number;
}

/** Chi tiết kèm lỗi "KM trả nhỏ hơn KM giao". */
export interface HandoverBelowPickupDetails {
  pickupKm: number;
  odometerKm: number;
  deltaKm: number;
}

/**
 * Bàn giao xe nối vào chính route đơn thuê — không có "đơn" thứ hai.
 *
 * Ảnh hiện trạng là TÀI LIỆU RIÊNG TƯ: presign → PUT thẳng bucket riêng → server xác minh rồi
 * gắn → xem qua signed URL ngắn hạn xin lại từng lần bấm. Không URL nào nằm trong state hay DB.
 */
const base = (bookingId: string) => `/bookings/${encodeURIComponent(bookingId)}/handovers`;

export const handoversApi = {
  context(bookingId: string): Promise<HandoverContext> {
    return getApiClient().get<HandoverContext>(base(bookingId));
  },

  saveDraft(bookingId: string, type: HandoverType, body: SaveHandoverInput): Promise<Handover> {
    return getApiClient().put<Handover>(`${base(bookingId)}/${type}`, body);
  },

  /** Xác nhận — ĐIỂM KHÔNG QUAY LẠI: đổi trạng thái đơn trong cùng transaction. */
  confirm(
    bookingId: string,
    type: HandoverType,
    body: ConfirmHandoverInput,
  ): Promise<HandoverContext> {
    return getApiClient().post<HandoverContext>(`${base(bookingId)}/${type}/confirm`, body);
  },

  cancel(
    bookingId: string,
    type: HandoverType,
    expectedRowVersion: number,
  ): Promise<HandoverContext> {
    return getApiClient().post<HandoverContext>(`${base(bookingId)}/${type}/cancel`, {
      expectedRowVersion,
    });
  },

  /** Sửa KM sau khi đã xác nhận — đường riêng, bắt buộc có lý do + quyền riêng. */
  resolveOdometer(
    bookingId: string,
    type: HandoverType,
    body: ResolveOdometerInput,
  ): Promise<HandoverContext> {
    return getApiClient().post<HandoverContext>(`${base(bookingId)}/${type}/odometer`, body);
  },

  presignPhoto(
    bookingId: string,
    type: HandoverType,
    slot: HandoverPhotoSlot,
    file: HandoverUploadMeta,
  ): Promise<HandoverPresign> {
    return getApiClient().post<HandoverPresign>(`${base(bookingId)}/${type}/photos/presign`, {
      ...file,
      slot,
    });
  },

  attachPhoto(
    bookingId: string,
    type: HandoverType,
    fileId: string,
    slot: HandoverPhotoSlot,
  ): Promise<Handover> {
    return getApiClient().post<Handover>(`${base(bookingId)}/${type}/photos`, { fileId, slot });
  },

  removePhoto(
    bookingId: string,
    type: HandoverType,
    slot: HandoverPhotoSlot,
  ): Promise<Handover> {
    return getApiClient().delete<Handover>(`${base(bookingId)}/${type}/photos/${slot}`);
  },

  /** Gác bằng quyền RIÊNG `handovers.view_files` — người lập biên bản không đương nhiên đọc lại được. */
  photoUrl(bookingId: string, type: HandoverType, fileId: string): Promise<HandoverDownload> {
    return getApiClient().get<HandoverDownload>(
      `${base(bookingId)}/${type}/photos/${encodeURIComponent(fileId)}/download`,
    );
  },

  /** Hàng đợi "Thiếu KM trả" toàn gian hàng — phân trang ở server. */
  missingOdometer(params: QueryParams): Promise<Paged<MissingOdometerItem>> {
    return getApiClient().fetchPage<MissingOdometerItem>(
      '/handovers/missing-odometer',
      params,
      Number(params.limit) || 20,
    );
  },
};
