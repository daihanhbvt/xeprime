import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@xeprime/api-client';
import { API_ERROR_CODE } from '@xeprime/types';
import type { AppLocale } from './config';
import { IntlTestProvider } from './test-utils';
import { useErrorMessage } from './use-error-message';

/*
 * Lỗi "chờ rồi thử lại" phải nói ĐÚNG bao lâu — đọc từ `details.retryAfterSeconds` của backend.
 * "Thử lại sau ít giây" khi thật ra phải chờ cả phút là cách chắc nhất để người dùng bấm lại và bị
 * chặn tiếp (TC-LOGIN-11/13 của QC).
 */

function messageFor(error: unknown, locale: AppLocale = 'vi'): string {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <IntlTestProvider locale={locale}>{children}</IntlTestProvider>
  );
  const { result } = renderHook(() => useErrorMessage(), { wrapper });
  return result.current(error);
}

const apiError = (code: string, details?: unknown) =>
  new ApiClientError({ code, message: 'x', status: 429, details });

describe('useErrorMessage — thời gian chờ', () => {
  it('dưới một phút: đếm giây', () => {
    expect(messageFor(apiError(API_ERROR_CODE.RATE_LIMITED, { retryAfterSeconds: 42 }))).toBe(
      'Bạn thao tác hơi nhanh. Vui lòng thử lại sau 42 giây.',
    );
  });

  it('khoá đăng nhập: làm tròn LÊN tới phút — khớp câu QC chờ ("thử lại sau 5 phút")', () => {
    expect(
      messageFor(apiError(API_ERROR_CODE.LOGIN_TEMPORARILY_LOCKED, { retryAfterSeconds: 290 })),
    ).toBe('Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 5 phút hoặc dùng "Quên mật khẩu".');
  });

  it('trần gửi mã theo giờ: nói đủ giờ + phút', () => {
    expect(messageFor(apiError(API_ERROR_CODE.OTP_TOO_MANY, { retryAfterSeconds: 3900 }))).toBe(
      'Bạn đã yêu cầu mã quá nhiều lần. Vui lòng thử lại sau 1 giờ 5 phút.',
    );
  });

  it('tiếng Anh dùng đúng số nhiều', () => {
    expect(messageFor(apiError(API_ERROR_CODE.OTP_COOLDOWN, { retryAfterSeconds: 1 }), 'en')).toBe(
      'Please wait 1 second before requesting a new code.',
    );
    expect(messageFor(apiError(API_ERROR_CODE.RATE_LIMITED, { retryAfterSeconds: 30 }), 'en')).toBe(
      "You're going a little fast. Please try again in 30 seconds.",
    );
  });

  it('không có con số (backend cũ, hay mã không phải loại chờ): câu thường, không bịa số', () => {
    expect(messageFor(apiError(API_ERROR_CODE.RATE_LIMITED))).toBe(
      'Bạn thao tác hơi nhanh. Vui lòng đợi một chút rồi thử lại.',
    );
    expect(messageFor(apiError(API_ERROR_CODE.OTP_INVALID, { retryAfterSeconds: 30 }))).toBe(
      'Mã xác minh không đúng.',
    );
  });
});
