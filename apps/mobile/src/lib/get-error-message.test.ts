import { ApiClientError } from '@/lib/api-client';
import { ImageUploadError } from '@/lib/r2-image-upload';
import { getErrorMessage } from './get-error-message';

/*
 * Bản native của `getErrorMessage` bên web (`apps/web/src/services/api-client.ts`): cùng ba nhánh,
 * cùng câu mặc định. Riêng app có thêm lớp bọc `ImageUploadError` của đường tải ảnh.
 */
describe('getErrorMessage', () => {
  const apiError = new ApiClientError({
    code: 'CUSTOMER_PHONE_DUPLICATE',
    message: 'Số điện thoại đã thuộc về khách Nguyễn Văn An',
    status: 409,
  });

  it('lỗi API: câu NGUYÊN VĂN của server, không dịch theo mã', () => {
    expect(getErrorMessage(apiError)).toBe('Số điện thoại đã thuộc về khách Nguyễn Văn An');
  });

  it('lỗi tải ảnh: bóc lớp bọc để lấy câu của server ở `cause`', () => {
    expect(getErrorMessage(new ImageUploadError('presign', apiError))).toBe(
      'Số điện thoại đã thuộc về khách Nguyễn Văn An',
    );
  });

  it('Error thường: câu của chính nó; rỗng thì câu mặc định của web', () => {
    expect(getErrorMessage(new Error('Hết thời gian chờ'))).toBe('Hết thời gian chờ');
    expect(getErrorMessage(new Error(''))).toBe('Không kết nối được máy chủ. Thử lại sau.');
  });

  it('không phải Error: câu mặc định của web', () => {
    expect(getErrorMessage('boom')).toBe('Không kết nối được máy chủ. Thử lại sau.');
    expect(getErrorMessage(null)).toBe('Không kết nối được máy chủ. Thử lại sau.');
  });
});
