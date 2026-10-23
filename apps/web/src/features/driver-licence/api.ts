import { apiGet, apiPost } from '@/services/api-client';
import { uploadToR2 } from '@/services/upload';
import type {
  DriverLicence,
  DriverLicenceImage,
  DriverLicenceOverview,
  DriverLicencePresign,
} from './types';

/**
 * Bằng lái của tài khoản đang đăng nhập (ADR 0057). Chủ sở hữu luôn suy từ session — không hàm
 * nào ở đây nhận id người dùng.
 */
const BASE = '/account/driver-licence';

export const fetchDriverLicenceOverview = (): Promise<DriverLicenceOverview> =>
  apiGet<DriverLicenceOverview>(BASE);

export const fetchDriverLicenceImage = (id: string): Promise<DriverLicenceImage> =>
  apiGet<DriverLicenceImage>(`${BASE}/${id}/image`);

/**
 * Nộp một ảnh: presign → PUT thẳng lên kho riêng tư → xác nhận. Trả về lượt nộp ở trạng thái
 * `processing` — đọc ảnh chạy nền, giao diện hỏi lại `fetchDriverLicenceOverview` tới khi có kết
 * quả. `consent: true` vì người dùng vừa bấm nút gửi ngay dưới câu đồng ý.
 */
export async function submitDriverLicence(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<DriverLicence> {
  const ticket = await apiPost<DriverLicencePresign>(`${BASE}/presign`, {
    contentType: file.type,
    fileSize: file.size,
    consent: true,
  });
  await uploadToR2(ticket.uploadUrl, file, onProgress);
  return apiPost<DriverLicence>(`${BASE}/${ticket.licenceId}/complete`);
}
