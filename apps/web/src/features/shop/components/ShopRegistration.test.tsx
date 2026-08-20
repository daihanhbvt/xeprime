import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopRegistration } from './ShopRegistration';

/**
 * Đăng ký gian hàng.
 *
 * Điều test này khoá: **tỉnh/thành là bắt buộc** và danh sách đến từ API chứ không phải một mảng
 * cứng trong React. Đăng ký tạo luôn chi nhánh mặc định, nên thiếu tỉnh nghĩa là gian hàng mở ra
 * mà không biết mình ở đâu — xe sẽ không lên chợ được.
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
    { value: '79', label: 'Hồ Chí Minh' },
    { value: '48', label: 'Đà Nẵng' },
  ] as { value: string; label: string }[],
  isLoading: false,
  isError: false,
}));
vi.mock('@/features/locations/hooks/use-provinces', () => ({
  useProvinceOptions: () => ({ ...provinces, error: null, refetch: vi.fn() }),
}));

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
    { value: '79', label: 'Hồ Chí Minh' },
    { value: '48', label: 'Đà Nẵng' },
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

  it('đang tải danh mục: ô chọn bị khoá và nói rõ đang tải', () => {
    provinces.options = [];
    provinces.isLoading = true;
    // AntD tách placeholder ra node riêng nên `getByText` không khớp — đọc textContent của cả cây.
    const { container } = renderForm();

    expect(container.textContent).toContain('Đang tải tỉnh/thành');
    expect(container.querySelector('.ant-select-disabled')).not.toBeNull();
  });

  it('API danh mục lỗi: cảnh báo + nút thử lại, không im lặng để form không dùng được', () => {
    provinces.options = [];
    provinces.isError = true;
    renderForm();

    expect(screen.getByText('Không tải được danh sách tỉnh/thành')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });

  it('danh mục rỗng: khoá ô và nói rõ lý do thay vì một dropdown trống vô nghĩa', () => {
    provinces.options = [];
    const { container } = renderForm();

    expect(container.textContent).toContain('Chưa có tỉnh/thành nào mở đăng ký');
    expect(container.querySelector('.ant-select-disabled')).not.toBeNull();
  });
});
