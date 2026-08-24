import { renderHook } from '@testing-library/react-native';
import { API_ERROR_CODE } from '@xeprime/types';
import type { AppLocale } from '@/i18n/config';
import { withIntl } from '@/i18n/test-utils';
import { ApiClientError, CLIENT_ERROR_CODE } from '@/lib/api-client';
import { useAuthErrorMessage } from './use-auth-error-message';

// `renderHook` của @testing-library/react-native v14 là async như `render` — thiếu `await`
// thì `result` chưa tồn tại.
async function messageFor(error: unknown, locale: AppLocale = 'vi'): Promise<string> {
  const { result } = await renderHook(() => useAuthErrorMessage(), {
    wrapper: ({ children }) => withIntl(children, locale),
  });
  return result.current(error);
}

// `message` là tiếng Việt của backend — cố tình khác hẳn để test chứng minh nó KHÔNG được dùng.
function apiError(code: string): ApiClientError {
  return new ApiClientError({ code, message: 'message thô từ backend', status: 400 });
}

describe('useAuthErrorMessage', () => {
  it('ánh xạ từ MÃ lỗi, không dùng message của backend (ADR 0012)', async () => {
    const message = await messageFor(apiError(API_ERROR_CODE.INVALID_CREDENTIALS));

    expect(message).toBe('Email/số điện thoại hoặc mật khẩu không đúng.');
    expect(message).not.toContain('message thô từ backend');
  });

  it('dịch theo ngôn ngữ đang chọn', async () => {
    expect(await messageFor(apiError(API_ERROR_CODE.INVALID_CREDENTIALS), 'en')).toBe(
      'That email/phone or password is incorrect.',
    );
  });

  it('phân biệt tài khoản bị khoá với sai mật khẩu', async () => {
    expect(await messageFor(apiError(API_ERROR_CODE.ACCOUNT_LOCKED))).toContain('bị khoá');
  });

  it('mã ngoài bảng của Auth rơi về bảng lỗi chung', async () => {
    expect(await messageFor(apiError(API_ERROR_CODE.FORBIDDEN))).toBe(
      'Bạn không có quyền thực hiện thao tác này.',
    );
    expect(await messageFor(apiError(CLIENT_ERROR_CODE.NETWORK_ERROR))).toContain(
      'Không kết nối được',
    );
  });

  it('lỗi không rõ mã dùng câu dự phòng', async () => {
    expect(await messageFor(new Error('Network request failed'))).toBe(
      'Đã có lỗi xảy ra. Vui lòng thử lại.',
    );
    expect(await messageFor(apiError('MÃ_LẠ'))).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });
});
