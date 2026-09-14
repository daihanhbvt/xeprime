import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopRegistration } from './ShopRegistration';

/**
 * Đăng ký gian hàng.
 *
 * Điều test này khoá: **tỉnh/thành là bắt buộc** và form KHÔNG gọi API khi thiếu nó. Đăng ký tạo
 * luôn chi nhánh mặc định, nên thiếu tỉnh nghĩa là gian hàng mở ra mà không biết mình ở đâu — xe
 * sẽ không lên chợ được.
 *
 * Hành vi của chính ô địa chỉ (hai cấp danh mục, xoá xã khi đổi tỉnh, ba trạng thái của danh
 * mục) nằm ở `components/form/AddressField.test.tsx`: nó là ô DÙNG CHUNG, kiểm lại ở đây là
 * kiểm cùng một thứ ở năm màn hình và để chúng trôi khỏi nhau.
 *
 * `getByLabelText` dùng regex chứ không phải chuỗi khớp tuyệt đối: dấu bắt buộc `*` là một node
 * THẬT nằm sau nhãn (`trailingRequiredMark`), nên textContent của label là "Tên gian hàng*".
 */
const mutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null as unknown,
}));
vi.mock('../hooks/use-shop', () => ({ useRegisterShop: () => mutation }));

const provinces = vi.hoisted(() => ({
  options: [
    { value: '79', label: 'TP Hồ Chí Minh' },
    { value: '48', label: 'TP Đà Nẵng' },
  ] as { value: string; label: string }[],
  isLoading: false,
  isError: false,
}));
vi.mock('@/features/locations/hooks/use-provinces', () => ({
  useProvinceOptions: () => ({ ...provinces, error: null, refetch: vi.fn() }),
}));

/*
 * Danh mục cấp xã và bản đồ: stub RỖNG. Màn này không kiểm chúng, và để chúng gọi thật thì mỗi
 * lần render sẽ đòi một QueryClientProvider cộng một khoá bản đồ — hai thứ không liên quan gì
 * tới việc "thiếu tỉnh thì không gọi API".
 */
vi.mock('@/features/locations/hooks/use-wards', () => ({
  useWardOptions: () => ({
    options: [],
    items: [],
    total: 0,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/features/locations/hooks/use-places', () => ({
  PLACE_SEARCH_MIN_LENGTH: 3,
  usePlaceSearch: () => ({ data: { items: [], available: false }, isFetching: false }),
  usePlaceDetail: () => ({ mutateAsync: vi.fn() }),
  useReverseGeocode: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/components/form/MapPinPicker', () => ({ MapPinPicker: () => null }));

function renderForm() {
  return render(
    <App>
      <ShopRegistration />
    </App>,
  );
}

beforeEach(() => {
  mutation.mutate.mockReset();
  mutation.isError = false;
  provinces.options = [
    { value: '79', label: 'TP Hồ Chí Minh' },
    { value: '48', label: 'TP Đà Nẵng' },
  ];
  provinces.isLoading = false;
  provinces.isError = false;
});

afterEach(cleanup);

describe('ShopRegistration', () => {
  it('dựng ô chọn tỉnh/thành từ API, không phải danh sách cứng trong FE', () => {
    renderForm();
    expect(screen.getByLabelText(/Tỉnh\/thành/)).toBeTruthy();
  });

  it('thiếu tỉnh/thành → KHÔNG gọi API và báo lỗi ngay tại field', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/Tên gian hàng/), {
      target: { value: 'Cho thuê xe Bình Minh' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Tạo gian hàng/ }));

    await waitFor(() => expect(screen.getByText('Chọn tỉnh/thành nơi đặt gian hàng')).toBeTruthy());
    expect(mutation.mutate).not.toHaveBeenCalled();
  });
});
