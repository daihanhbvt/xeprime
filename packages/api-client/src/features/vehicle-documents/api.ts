import type { components } from '@xeprime/types';
import { getApiClient } from '../../client';
import type { UploadMeta } from '../vehicles/api';

type Schemas = components['schemas'];

/** Bản TÓM TẮT (quyền `view`) — chỉ trạng thái, không PII/tên file/OCR. */
export type VehicleDocumentSummary = Schemas['VehicleDocumentSummaryDto'];
/** Bản CHI TIẾT (quyền `view_details`) — metadata nhạy cảm + bản đang hiệu lực. */
export type VehicleDocumentDetail = Schemas['VehicleDocumentDetailDto'];
export type VehicleDocumentVersion = Schemas['VehicleDocumentVersionDto'];
export type SaveVehicleDocumentInput = Schemas['SaveVehicleDocumentDto'];
export type DocumentPresign = Schemas['SourceContractPresignDto'];
export type DocumentDownload = Schemas['SourceContractDownloadDto'];
/** Một lần chạy trích xuất OCR — kết quả là BẢN NHÁP chờ đối soát, không bao giờ tự ghi đè. */
export type VehicleDocumentOcrJob = Schemas['VehicleDocumentOcrJobDto'];
export type VehicleDocumentOcrFieldResult = Schemas['VehicleDocumentOcrFieldDto'];
export type ApplyOcrFieldsInput = Schemas['ApplyOcrFieldsDto'];

const base = (vehicleId: string) => `/vehicles/${encodeURIComponent(vehicleId)}/documents`;

export const vehicleDocumentsApi = {
  list(vehicleId: string): Promise<VehicleDocumentSummary[]> {
    return getApiClient().get<VehicleDocumentSummary[]>(base(vehicleId));
  },

  detail(vehicleId: string, documentId: string): Promise<VehicleDocumentDetail> {
    return getApiClient().get<VehicleDocumentDetail>(
      `${base(vehicleId)}/${encodeURIComponent(documentId)}`,
    );
  },

  versions(vehicleId: string, documentId: string): Promise<VehicleDocumentVersion[]> {
    return getApiClient().get<VehicleDocumentVersion[]>(
      `${base(vehicleId)}/${encodeURIComponent(documentId)}/versions`,
    );
  },

  create(vehicleId: string, body: SaveVehicleDocumentInput): Promise<VehicleDocumentDetail> {
    return getApiClient().post<VehicleDocumentDetail>(base(vehicleId), body);
  },

  update(
    vehicleId: string,
    documentId: string,
    body: SaveVehicleDocumentInput,
  ): Promise<VehicleDocumentDetail> {
    return getApiClient().patch<VehicleDocumentDetail>(
      `${base(vehicleId)}/${encodeURIComponent(documentId)}`,
      body,
    );
  },

  archive(vehicleId: string, documentId: string): Promise<{ id: string }> {
    return getApiClient().post<{ id: string }>(
      `${base(vehicleId)}/${encodeURIComponent(documentId)}/archive`,
      {},
    );
  },

  presignVersion(
    vehicleId: string,
    documentId: string,
    meta: UploadMeta,
  ): Promise<DocumentPresign> {
    return getApiClient().post<DocumentPresign>(
      `${base(vehicleId)}/${encodeURIComponent(documentId)}/versions/presign`,
      meta,
    );
  },

  attachVersion(
    vehicleId: string,
    documentId: string,
    fileId: string,
  ): Promise<VehicleDocumentDetail> {
    return getApiClient().post<VehicleDocumentDetail>(
      `${base(vehicleId)}/${encodeURIComponent(documentId)}/versions`,
      { fileId },
    );
  },

  /**
   * Xin trích xuất OCR trên BẢN ĐANG HIỆU LỰC. Chưa cắm provider thì backend trả 503
   * `OCR_NOT_CONFIGURED` — đó là một CÂU TRẢ LỜI hợp lệ, nơi gọi mở đường nhập tay chứ
   * không hiện lỗi hệ thống.
   */
  requestOcr(vehicleId: string, documentId: string): Promise<VehicleDocumentOcrJob> {
    return getApiClient().post<VehicleDocumentOcrJob>(
      `${base(vehicleId)}/${encodeURIComponent(documentId)}/ocr`,
      {},
    );
  },

  /**
   * Áp các trường ĐÃ CHỌN của một job. Client gửi TÊN trường, giá trị lấy từ job ở server —
   * gửi kèm giá trị là mở đường ghi bất kỳ thứ gì dưới danh nghĩa OCR.
   *
   * `fields` rỗng = "đã đối soát, không cập nhật gì".
   */
  applyOcr(
    vehicleId: string,
    documentId: string,
    jobId: string,
    body: ApplyOcrFieldsInput,
  ): Promise<VehicleDocumentDetail> {
    return getApiClient().post<VehicleDocumentDetail>(
      `${base(vehicleId)}/${encodeURIComponent(documentId)}/ocr/${encodeURIComponent(jobId)}/apply`,
      body,
    );
  },

  versionDownload(
    vehicleId: string,
    documentId: string,
    versionId: string,
  ): Promise<DocumentDownload> {
    return getApiClient().get<DocumentDownload>(
      `${base(vehicleId)}/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/download`,
    );
  },
};
