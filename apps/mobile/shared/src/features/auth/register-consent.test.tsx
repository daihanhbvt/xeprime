import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render } from '@testing-library/react-native';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { RegisterScreen } from './RegisterScreen';

/**
 * Cổng đồng ý điều khoản ở màn ĐĂNG KÝ.
 *
 * Bộ này tồn tại vì đây là ràng buộc PHÁP LÝ, không phải một tinh chỉnh giao diện: cả hai chợ
 * ứng dụng đòi một hành vi đồng ý tường minh trước khi tài khoản được tạo (App Store guideline
 * 5.1.1). Một lần refactor làm mất `blocked` sẽ không gãy màn nào — nó chỉ lặng lẽ mở lại cửa.
 *
 * Điều quan trọng nhất ở đây: cổng chặn CẢ HAI đường tạo tài khoản. Chặn mỗi nút "Tạo tài khoản"
 * mà để hai nút mạng xã hội ngay dưới mở là không chặn gì cả.
 */

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

const CONSENT_LABEL = 'Tôi đã đọc và đồng ý với Điều khoản sử dụng và Chính sách bảo mật của XePrime.';
const SUBMIT_LABEL = 'Tạo tài khoản';
const GOOGLE_LABEL = 'Tiếp tục với Google';

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return withIntl(
    <ReduxProvider store={store}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ReduxProvider>,
  );
}

async function renderScreen() {
  return render(
    wrap(
      <RegisterScreen
        onAuthenticated={jest.fn()}
        onRegistered={jest.fn()}
        onOpenAccount={jest.fn()}
        onSwitchToLogin={jest.fn()}
        onCancel={jest.fn()}
      />,
    ),
  );
}

/** Trạng thái khả truy cập của nút — thứ trình đọc màn hình VÀ ngón tay cùng đọc. */
function disabledState(element: { props: { accessibilityState?: { disabled?: boolean } } }) {
  return element.props.accessibilityState?.disabled;
}

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('RegisterScreen — cổng đồng ý điều khoản', () => {
  it('chưa tick: cả nút tạo tài khoản lẫn nút mạng xã hội đều khoá', async () => {
    const view = await renderScreen();

    expect(disabledState(view.getByLabelText(SUBMIT_LABEL))).toBe(true);
    expect(disabledState(view.getByLabelText(GOOGLE_LABEL))).toBe(true);
  });

  it('tick rồi thì nút mạng xã hội mở — nó cũng tạo tài khoản', async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByLabelText(CONSENT_LABEL));

    expect(disabledState(view.getByLabelText(GOOGLE_LABEL))).toBe(false);
  });

  /**
   * Tick KHÔNG tự làm nút gửi sáng lên: bốn ô vẫn còn trống nên `registerSchema` chưa qua. Hai
   * điều kiện độc lập, kiểm nối tiếp — đúng như quyền và cờ gói ở khu quản lý.
   */
  it('tick nhưng form còn trống thì nút tạo tài khoản vẫn khoá', async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByLabelText(CONSENT_LABEL));

    expect(disabledState(view.getByLabelText(SUBMIT_LABEL))).toBe(true);
  });

  it('bỏ tick thì khoá trở lại — không phải cửa một chiều', async () => {
    const view = await renderScreen();

    await fireEvent.press(view.getByLabelText(CONSENT_LABEL));
    await fireEvent.press(view.getByLabelText(CONSENT_LABEL));

    expect(disabledState(view.getByLabelText(GOOGLE_LABEL))).toBe(true);
  });

  it('KHÔNG gọi API đăng nhập mạng xã hội khi chưa tick', async () => {
    const social = jest.spyOn(authApi, 'loginWithSocial');
    const view = await renderScreen();

    await fireEvent.press(view.getByLabelText(GOOGLE_LABEL));

    expect(social).not.toHaveBeenCalled();
  });
});
