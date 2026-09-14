import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { chatApi } from '@/features/chat/api';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { getChatDb, isFirebaseConfigured, signInChat, signOutChat } from '@/lib/firebase-client';
import { ChatRealtimeProvider, useChatRealtime } from './ChatRealtimeProvider';

/**
 * Vòng đời phiên Firebase của chat (ADR 0009 §4).
 *
 * Bốn bất biến, và cả bốn đều đã hỏng ở đâu đó trước khi có test:
 *   1. hỏng ở BẤT KỲ bước nào cũng chỉ dẫn tới `ready: false` — chat vẫn chạy trên REST;
 *   2. `FIRESTORE_ENABLED=false` là CẤU HÌNH, không phải lỗi;
 *   3. đăng xuất ⇒ `signOut` Firebase, nếu không uid cũ còn nguyên trong tiến trình;
 *   4. ĐỔI người dùng ⇒ cũng `signOut` rồi mint lại, nếu không người kế tiếp nghe Firestore
 *      bằng danh tính của người trước.
 */
jest.mock('@/features/chat/api', () => ({
  chatApi: { firebaseToken: jest.fn() },
}));

jest.mock('@/lib/firebase-client', () => ({
  isFirebaseConfigured: jest.fn(() => true),
  getChatDb: jest.fn(() => ({ __brand: 'firestore' })),
  signInChat: jest.fn(async () => undefined),
  signOutChat: jest.fn(async () => undefined),
}));

jest.mock('@/features/auth/hooks/use-auth', () => ({
  useCurrentUser: jest.fn(),
}));

const api = chatApi as jest.Mocked<typeof chatApi>;
const firebase = {
  isFirebaseConfigured: isFirebaseConfigured as jest.MockedFunction<typeof isFirebaseConfigured>,
  getChatDb: getChatDb as jest.MockedFunction<typeof getChatDb>,
  signInChat: signInChat as jest.MockedFunction<typeof signInChat>,
  signOutChat: signOutChat as jest.MockedFunction<typeof signOutChat>,
};
const currentUser = useCurrentUser as jest.MockedFunction<typeof useCurrentUser>;

function setUser(id: string | null): void {
  currentUser.mockReturnValue({
    data: id ? { id } : undefined,
  } as unknown as ReturnType<typeof useCurrentUser>);
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <ChatRealtimeProvider>{children}</ChatRealtimeProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  api.firebaseToken.mockReset().mockResolvedValue({ enabled: true, token: 'custom-token' });
  firebase.isFirebaseConfigured.mockReset().mockReturnValue(true);
  firebase.getChatDb.mockReset().mockReturnValue({ __brand: 'firestore' } as never);
  firebase.signInChat.mockReset().mockResolvedValue(undefined);
  firebase.signOutChat.mockReset().mockResolvedValue(undefined);
  setUser('user-1');
});

describe('ChatRealtimeProvider', () => {
  it('mint custom token rồi đăng nhập Firebase — `ready` bật và có db', async () => {
    const { result } = await renderHook(() => useChatRealtime(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(firebase.signInChat).toHaveBeenCalledWith('custom-token');
    expect(result.current.db).not.toBeNull();
  });

  it('CHƯA đăng nhập thì không xin token nào', async () => {
    setUser(null);
    const { result } = await renderHook(() => useChatRealtime(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(false));
    expect(api.firebaseToken).not.toHaveBeenCalled();
  });

  it('chưa cấu hình `EXPO_PUBLIC_FIREBASE_*` thì không gọi API — chat rơi về REST', async () => {
    firebase.isFirebaseConfigured.mockReturnValue(false);
    const { result } = await renderHook(() => useChatRealtime(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(false));
    expect(api.firebaseToken).not.toHaveBeenCalled();
    expect(result.current.db).toBeNull();
  });

  it('`enabled: false` từ server là CẤU HÌNH, không phải lỗi — không đăng nhập Firebase', async () => {
    api.firebaseToken.mockResolvedValue({ enabled: false, token: null });
    const { result } = await renderHook(() => useChatRealtime(), { wrapper });

    await waitFor(() => expect(api.firebaseToken).toHaveBeenCalled());
    expect(firebase.signInChat).not.toHaveBeenCalled();
    expect(result.current.ready).toBe(false);
  });

  it('mint token HỎNG thì im lặng — `ready` vẫn false, không ném ra ngoài', async () => {
    api.firebaseToken.mockRejectedValue(new Error('mạng rớt'));
    const { result } = await renderHook(() => useChatRealtime(), { wrapper });

    await waitFor(() => expect(api.firebaseToken).toHaveBeenCalled());
    expect(firebase.signInChat).not.toHaveBeenCalled();
    expect(result.current.ready).toBe(false);
  });

  it('đăng nhập Firebase HỎNG thì `ready` vẫn false và db là null', async () => {
    firebase.signInChat.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/invalid' }));
    const { result } = await renderHook(() => useChatRealtime(), { wrapper });

    await waitFor(() => expect(firebase.signInChat).toHaveBeenCalled());
    expect(result.current.ready).toBe(false);
    expect(result.current.db).toBeNull();
  });

  it('ĐĂNG XUẤT thì đăng xuất luôn Firebase và tắt `ready`', async () => {
    const { result, rerender } = await renderHook(() => useChatRealtime(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      setUser(null);
      await rerender(undefined);
    });

    expect(firebase.signOutChat).toHaveBeenCalled();
    expect(result.current.ready).toBe(false);
    expect(result.current.db).toBeNull();
  });

  it('ĐỔI người dùng thì đăng xuất phiên cũ rồi mint token mới', async () => {
    const { result, rerender } = await renderHook(() => useChatRealtime(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    api.firebaseToken.mockResolvedValue({ enabled: true, token: 'token-cua-nguoi-hai' });

    await act(async () => {
      setUser('user-2');
      await rerender(undefined);
    });

    expect(firebase.signOutChat).toHaveBeenCalled();
    await waitFor(() => expect(firebase.signInChat).toHaveBeenLastCalledWith('token-cua-nguoi-hai'));
  });

  /**
   * `useCurrentUser` trả object MỚI sau mỗi lượt refetch (và `SessionBoundary` refetch mỗi lần
   * app về tiền cảnh). Phụ thuộc cả object thì mỗi lần đó là một `signOut` cắt đứt mọi listener.
   */
  it('cùng một người dùng, object mới ⇒ KHÔNG đăng nhập lại', async () => {
    const { result, rerender } = await renderHook(() => useChatRealtime(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(firebase.signInChat).toHaveBeenCalledTimes(1);

    await act(async () => {
      setUser('user-1');
      await rerender(undefined);
    });

    expect(firebase.signInChat).toHaveBeenCalledTimes(1);
    expect(firebase.signOutChat).not.toHaveBeenCalled();
  });
});
