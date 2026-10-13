import { render } from '@testing-library/react-native';
import { ApiClientError } from '@xeprime/api-client';
import type { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { withIntl } from '@/i18n/test-utils';
import { RequestOtpStep } from './RequestOtpStep';

type Otp = ReturnType<typeof usePhoneVerify>;

function otp(over: Partial<Otp> = {}): Otp {
  return {
    status: 'code_sent',
    cooldown: 0,
    devCode: null,
    error: null,
    sending: false,
    verifying: false,
    send: jest.fn(),
    sendAsync: jest.fn(),
    verify: jest.fn(),
    clearError: jest.fn(),
    reset: jest.fn(),
    testCodeEnabled: false,
    canEnterCode: true,
    ...over,
  } as Otp;
}

/*
 * Web in `vp.error` thành cảnh báo ngay trong bước OTP (câu nguyên văn của server) — cho CẢ lỗi
 * gửi mã (gồm gửi lại) lẫn lỗi xác minh. Trước đây app chỉ toast lỗi xác minh; lỗi gửi lại thì
 * hook giữ mà không ai vẽ, nên bấm "Gửi lại" hỏng là im lặng.
 */
describe('RequestOtpStep — lỗi hiện ngay trong bước', () => {
  it('lỗi gửi lại mã: hiện câu của server', async () => {
    const view = await render(
      withIntl(
        <RequestOtpStep
          phone="0901234567"
          otp={otp({
            error: new ApiClientError({
              code: 'OTP_COOLDOWN',
              message: 'Vui lòng đợi 26s trước khi gửi lại mã',
              status: 429,
            }),
          })}
          onVerified={jest.fn()}
          onEditPhone={jest.fn()}
        />,
      ),
    );

    expect(await view.findByText('Vui lòng đợi 26s trước khi gửi lại mã')).toBeTruthy();
  });

  it('không có lỗi: không vẽ cảnh báo', async () => {
    const view = await render(
      withIntl(
        <RequestOtpStep
          phone="0901234567"
          otp={otp()}
          onVerified={jest.fn()}
          onEditPhone={jest.fn()}
        />,
      ),
    );

    expect(view.queryByText(/Vui lòng đợi/)).toBeNull();
  });
});

/*
 * Môi trường mã test: màn OTP mở mà CHƯA gửi SMS (startOtp bỏ qua sendAsync) — nút gửi phải nói
 * "Gửi mã" chứ không phải "Gửi lại", và chú thích nói rõ chưa có mã nào được gửi.
 */
describe('RequestOtpStep — mã test, chưa gửi', () => {
  it('nhãn "Gửi mã" + notSentHint + testCodeHint', async () => {
    const view = await render(
      withIntl(
        <RequestOtpStep
          phone="0901234567"
          otp={otp({ status: 'idle', testCodeEnabled: true })}
          onVerified={jest.fn()}
          onEditPhone={jest.fn()}
        />,
      ),
    );

    expect(await view.findByRole('button', { name: 'Gửi mã' })).toBeTruthy();
    expect(view.getByText(/Bấm “Gửi mã” để nhận mã gồm 6 số qua SMS/)).toBeTruthy();
    expect(
      view.getByText('Môi trường thử nghiệm — nhập mã test để xác thực mà không cần gửi SMS.'),
    ).toBeTruthy();
  });

  it('đã gửi: không còn testCodeHint', async () => {
    const view = await render(
      withIntl(
        <RequestOtpStep
          phone="0901234567"
          otp={otp({ status: 'code_sent', testCodeEnabled: true })}
          onVerified={jest.fn()}
          onEditPhone={jest.fn()}
        />,
      ),
    );

    expect(await view.findByRole('button', { name: 'Gửi lại mã' })).toBeTruthy();
    expect(view.queryByText(/nhập mã test để xác thực/)).toBeNull();
  });
});
