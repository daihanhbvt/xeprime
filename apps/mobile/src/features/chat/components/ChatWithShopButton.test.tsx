import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ApiClientError } from '@/lib/api-client';
import { chatApi } from '@/features/chat/api';
import { withIntl } from '@/i18n/test-utils';
import { ChatWithShopButton } from './ChatWithShopButton';

/**
 * Nút "Nhắn shop" — lối vào chat từ tin đăng, màn chuyến và màn gửi yêu cầu xong.
 *
 * Hai điều đáng khoá: chiếc xe phải đi TIẾP sang thread làm ngữ cảnh (hội thoại thuộc về GIAN
 * HÀNG, một thread cho mọi xe của shop), và 401 phải dẫn tới màn đăng nhập chứ không thành một
 * toast lỗi kỹ thuật ở một nút mà việc cần làm là đăng nhập.
 */
const mockPush = jest.fn();
const mockShowError = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/listings/veh-1',
}));

jest.mock('@/components/feedback/use-app-toast', () => ({
  useAppToast: () => ({ showSuccess: jest.fn(), showError: mockShowError, showInfo: jest.fn() }),
}));

jest.mock('@/features/chat/api', () => {
  const actual = jest.requireActual('@/features/chat/api');
  return { ...actual, chatApi: { start: jest.fn() } };
});

const api = chatApi as jest.Mocked<typeof chatApi>;

async function renderButton(props: { onNavigate?: () => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(
    withIntl(wrapper({ children: <ChatWithShopButton vehicleId="veh-1" {...props} /> })),
  );
}

beforeEach(() => {
  mockPush.mockReset();
  mockShowError.mockReset();
  api.start.mockReset();
});

describe('ChatWithShopButton', () => {
  it('mở/lấy hội thoại rồi vào thread, MANG THEO xe làm ngữ cảnh', async () => {
    api.start.mockResolvedValue({ id: 'conv-1' } as never);
    const view = await renderButton();

    fireEvent.press(view.getByRole('button', { name: 'Nhắn shop' }));

    await waitFor(() => expect(api.start).toHaveBeenCalledWith({ vehicleId: 'veh-1' }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/chat/[id]',
      params: { id: 'conv-1', v: 'veh-1' },
    });
  });

  it('đóng lớp phủ TRƯỚC khi rời màn', async () => {
    api.start.mockResolvedValue({ id: 'conv-1' } as never);
    const onNavigate = jest.fn();
    const view = await renderButton({ onNavigate });

    fireEvent.press(view.getByRole('button', { name: 'Nhắn shop' }));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalled();
  });

  it('CHƯA ĐĂNG NHẬP thì đưa tới màn đăng nhập, không hiện lỗi kỹ thuật', async () => {
    api.start.mockRejectedValue(
      new ApiClientError({ code: 'UNAUTHENTICATED', message: 'Chưa đăng nhập', status: 401 }),
    );
    const view = await renderButton();

    fireEvent.press(view.getByRole('button', { name: 'Nhắn shop' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('lỗi khác thì báo ra và KHÔNG điều hướng đi đâu', async () => {
    api.start.mockRejectedValue(
      new ApiClientError({ code: 'VALIDATION_FAILED', message: 'Xe không tồn tại', status: 400 }),
    );
    const view = await renderButton();

    fireEvent.press(view.getByRole('button', { name: 'Nhắn shop' }));

    // Câu NGUYÊN VĂN của server — đúng `ChatWithShopButton` bên web (`getErrorMessage`).
    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith('Xe không tồn tại'),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
