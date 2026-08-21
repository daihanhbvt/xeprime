import type { components, HandoverPhotoSlot, HandoverType } from '@xeprime/types';
import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type {
  ConfirmHandoverInput,
  Handover,
  HandoverContext,
  MissingOdometerItem,
  ResolveOdometerInput,
  SaveHandoverInput,
} from './types';

type Presign = components['schemas']['SourceContractPresignDto'];
type Download = components['schemas']['SourceContractDownloadDto'];

/**
 * Bàn giao xe (Wave 7) nối vào chính route đơn thuê — không có "đơn" thứ hai.
 *
 * Ảnh hiện trạng là TÀI LIỆU RIÊNG TƯ, đi nguyên flow Wave 4.1: presign → PUT thẳng bucket
 * riêng tư → server xác minh rồi gắn → xem qua signed URL ngắn hạn xin lại từng lần bấm.
 * Không URL nào nằm trong state hay DB.
 */
const base = (bookingId: string) => `/bookings/${bookingId}/handovers`;

export const fetchHandoverContext = (bookingId: string): Promise<HandoverContext> =>
  apiGet<HandoverContext>(base(bookingId));

export const saveHandoverDraft = (
  bookingId: string,
  type: HandoverType,
  body: SaveHandoverInput,
): Promise<Handover> => apiPut<Handover>(`${base(bookingId)}/${type}`, body);

export const confirmHandover = (
  bookingId: string,
  type: HandoverType,
  body: ConfirmHandoverInput,
): Promise<HandoverContext> =>
  apiPost<HandoverContext>(`${base(bookingId)}/${type}/confirm`, body);

export const cancelHandover = (
  bookingId: string,
  type: HandoverType,
  expectedRowVersion: number,
): Promise<HandoverContext> =>
  apiPost<HandoverContext>(`${base(bookingId)}/${type}/cancel`, { expectedRowVersion });

export const resolveHandoverOdometer = (
  bookingId: string,
  type: HandoverType,
  body: ResolveOdometerInput,
): Promise<HandoverContext> =>
  apiPost<HandoverContext>(`${base(bookingId)}/${type}/odometer`, body);

export const presignHandoverPhoto = (
  bookingId: string,
  type: HandoverType,
  slot: HandoverPhotoSlot,
  file: File,
): Promise<Presign> =>
  apiPost<Presign>(`${base(bookingId)}/${type}/photos/presign`, {
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
    slot,
  });

export const attachHandoverPhoto = (
  bookingId: string,
  type: HandoverType,
  fileId: string,
  slot: HandoverPhotoSlot,
): Promise<Handover> =>
  apiPost<Handover>(`${base(bookingId)}/${type}/photos`, { fileId, slot });

export const removeHandoverPhoto = (
  bookingId: string,
  type: HandoverType,
  slot: HandoverPhotoSlot,
): Promise<Handover> => apiDelete<Handover>(`${base(bookingId)}/${type}/photos/${slot}`);

/**
 * Hàng đợi "Thiếu KM trả" toàn gian hàng (Wave 8) — phân trang ở server, không kéo cả kho về
 * rồi lọc ở client.
 */
export const fetchMissingOdometerQueue = (
  params: QueryParams,
): Promise<Paged<MissingOdometerItem>> =>
  fetchPage<MissingOdometerItem>(
    '/handovers/missing-odometer',
    params,
    Number(params.limit) || DEFAULT_PAGE_SIZE,
  );

export const fetchHandoverPhotoUrl = (
  bookingId: string,
  type: HandoverType,
  fileId: string,
): Promise<Download> =>
  apiGet<Download>(`${base(bookingId)}/${type}/photos/${fileId}/download`);
