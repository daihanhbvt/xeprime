import { renderHook } from '@testing-library/react-native';
import { PERMISSION } from '@xeprime/types';
import { SUPPORT_SURFACE } from '../api';
import { useCanWriteSupportCase } from './use-support-cases';

let mockGranted: string[] = [];

jest.mock('@/features/auth/hooks/use-permissions', () => ({
  usePermissions: () => ({ isLoading: false, has: (p: string) => mockGranted.includes(p) }),
}));

/** Bám `useCanWriteSupportCase` bên web (apps/web/src/features/support-cases/hooks). */
describe('useCanWriteSupportCase', () => {
  it('gian hàng chỉ có support.view: KHÔNG ghi được', async () => {
    mockGranted = [PERMISSION.SUPPORT_VIEW];
    const { result } = await renderHook(() => useCanWriteSupportCase(SUPPORT_SURFACE.TENANT));
    expect(result.current).toBe(false);
  });

  it('gian hàng có support.manage: ghi được', async () => {
    mockGranted = [PERMISSION.SUPPORT_VIEW, PERMISSION.SUPPORT_MANAGE];
    const { result } = await renderHook(() => useCanWriteSupportCase(SUPPORT_SURFACE.TENANT));
    expect(result.current).toBe(true);
  });

  it('khách luôn tự mở/trả lời case của mình', async () => {
    mockGranted = [];
    const { result } = await renderHook(() => useCanWriteSupportCase(SUPPORT_SURFACE.CUSTOMER));
    expect(result.current).toBe(true);
  });
});
