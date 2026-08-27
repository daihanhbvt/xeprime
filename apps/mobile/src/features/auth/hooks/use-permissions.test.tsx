import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { PERMISSION } from '@xeprime/types';
import type { ReactNode } from 'react';
import * as authApi from '@/features/auth/api';
import { usePermissions } from './use-permissions';
import { useTenantScope } from './use-tenant-scope';

const SHOP_STAFF: authApi.CurrentUser = {
  id: '01JQZX0000000000000000000C',
  displayName: 'Nhân viên gian hàng',
  email: 'staff@xeprime.test',
  avatarUrl: null,
  phone: '0902222222',
  phoneVerified: true,
  hasPassword: true,
  tenant: {
    id: '01JQZX0000000000000000000T',
    name: 'Gian hàng Đà Nẵng',
    slug: 'da-nang',
    status: 'active',
    roleKey: 'shop_staff',
  },
  platformRole: null,
  permissions: [PERMISSION.VEHICLE_VIEW, PERMISSION.BOOKING_VIEW],
};

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('usePermissions', () => {
  it('đọc quyền từ /auth/me, không suy từ vai trò', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(SHOP_STAFF);
    const { result } = await renderHook(() => usePermissions(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.has(PERMISSION.VEHICLE_VIEW)).toBe(true);
    /*
     * `shop_staff` mang vai "nhân viên gian hàng" nhưng KHÔNG có quyền xoá xe. Đây là điều
     * `usePermissions` phải giữ: nguồn là danh sách `permissions` của DB, không phải một bảng
     * vai→quyền chép lại ở client — bảng đó sẽ trôi khỏi backend ngay lần đổi vai đầu tiên.
     */
    expect(result.current.has(PERMISSION.VEHICLE_DELETE)).toBe(false);
    expect(result.current.hasAny(PERMISSION.VEHICLE_DELETE, PERMISSION.BOOKING_VIEW)).toBe(true);
    expect(result.current.hasAny(PERMISSION.VEHICLE_DELETE)).toBe(false);
  });

  it('chưa đăng nhập (401) thì không có quyền nào — mặc định là ĐÓNG', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockRejectedValue(new Error('401'));
    const { result } = await renderHook(() => usePermissions(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.has(PERMISSION.VEHICLE_VIEW)).toBe(false);
  });
});

describe('useTenantScope', () => {
  it('trả gian hàng của phiên kèm vai', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(SHOP_STAFF);
    const { result } = await renderHook(() => useTenantScope(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tenant?.name).toBe('Gian hàng Đà Nẵng');
    expect(result.current.tenant?.roleKey).toBe('shop_staff');
    expect(result.current.hasNoTenant).toBe(false);
  });

  it('khách thuê xe thuần: có phiên nhưng KHÔNG thuộc gian hàng nào', async () => {
    jest
      .spyOn(authApi, 'fetchCurrentUser')
      .mockResolvedValue({ ...SHOP_STAFF, tenant: null, permissions: [] });
    const { result } = await renderHook(() => useTenantScope(), { wrapper });

    await waitFor(() => expect(result.current.hasNoTenant).toBe(true));
    expect(result.current.tenant).toBeNull();
  });
});
