import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { API_ERROR_CODE } from '@xeprime/types';
import viErrors from '@xeprime/domain/messages/vi/errors.json';
import enErrors from '@xeprime/domain/messages/en/errors.json';
import { ApiClientError, CLIENT_ERROR_CODE } from '@/lib/api-client';
import type { AppLocale } from './config';
import { withIntl } from './test-utils';
import { useErrorMessage } from './use-error-message';

async function errorMessageFor(locale: AppLocale) {
  const wrapper = ({ children }: { children: ReactNode }) => withIntl(children, locale);
  const { result } = await renderHook(() => useErrorMessage(), { wrapper });
  return result.current;
}

/*
 * CÙNG thứ tự với `useErrorMessage` bên web (ADR 0012): câu đến từ MÃ lỗi, không từ `message`
 * tiếng Việt của backend. Bản trước của app làm ngược — ở giao diện tiếng Anh, mọi lỗi có
 * response hiện một câu tiếng Việt.
 */
describe('useErrorMessage — nguồn chữ là MÃ lỗi, như web', () => {
  const invalidCredentials = new ApiClientError({
    code: API_ERROR_CODE.INVALID_CREDENTIALS,
    message: 'Sai thông tin đăng nhập',
    status: 401,
  });

  it('tiếng Việt: câu của `Errors.code`, KHÔNG phải `message` backend', async () => {
    const toMessage = await errorMessageFor('vi');

    expect(toMessage(invalidCredentials)).toBe(viErrors.code.INVALID_CREDENTIALS);
    expect(toMessage(invalidCredentials)).not.toBe('Sai thông tin đăng nhập');
  });

  it('tiếng Anh: câu tiếng Anh cho cùng mã — không lọt tiếng Việt của backend', async () => {
    const toMessage = await errorMessageFor('en');

    expect(toMessage(invalidCredentials)).toBe(enErrors.code.INVALID_CREDENTIALS);
  });

  it('lỗi mạng do client dựng (status 0) đi qua mã của nó', async () => {
    const toMessage = await errorMessageFor('vi');

    expect(
      toMessage(
        new ApiClientError({
          code: CLIENT_ERROR_CODE.NETWORK_ERROR,
          message: 'Request to /auth/me failed',
          status: 0,
        }),
      ),
    ).toBe(viErrors.code.CLIENT_NETWORK_ERROR);
  });

  it('`TypeError` trần (fetch hỏng ngoài client) ⇒ câu mạng', async () => {
    const toMessage = await errorMessageFor('vi');

    expect(toMessage(new TypeError('Network request failed'))).toBe(viErrors.network);
  });

  it('mã lạ (backend mới hơn app) ⇒ câu chung, không bao giờ in mã thô', async () => {
    const toMessage = await errorMessageFor('vi');

    expect(
      toMessage(new ApiClientError({ code: 'SOMETHING_NEW', message: 'x', status: 400 })),
    ).toBe(viErrors.fallback);
  });
});
