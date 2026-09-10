import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

export type UploadPresign = Schemas['UploadPresignDto'];

/**
 * Metadata một tệp sắp tải lên. `fileSize` là số byte SẼ GỬI — server ký nó vào URL
 * (`content-length` nằm trong `X-Amz-SignedHeaders`), nên số khai ở đây phải khớp TUYỆT ĐỐI số
 * byte lúc PUT, nếu không R2 trả 403.
 */
export interface UploadMeta {
  fileName: string;
  contentType: string;
  fileSize: number;
}

/**
 * Presign ảnh CÔNG KHAI lên R2 — client PUT thẳng, nhị phân không đi qua API.
 *
 * Mỗi route một quyền đúng với tài nguyên mà ảnh phục vụ (`StorageController`): ảnh xe cần
 * `vehicles.update`, logo/ảnh bìa gian hàng cần `tenant.update`. Gộp thành một endpoint chung là
 * mở đường cho người chỉ sửa được xe đi đổi logo gian hàng.
 *
 * Tài liệu RIÊNG TƯ (giấy tờ, hợp đồng nguồn xe) KHÔNG ở đây — chúng nhắm vào bucket riêng và có
 * endpoint của chính hồ sơ mà chúng thuộc về.
 */
export const uploadsApi = {
  vehicleImage(meta: UploadMeta): Promise<UploadPresign> {
    return getApiClient().post<UploadPresign>('/uploads/vehicle-images/presign', meta);
  },

  shopMedia(meta: UploadMeta): Promise<UploadPresign> {
    return getApiClient().post<UploadPresign>('/uploads/shop-media/presign', meta);
  },
};
