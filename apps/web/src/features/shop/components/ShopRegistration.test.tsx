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
 * Bản đồ: stub RỖNG. Màn này không kiểm gợi ý địa điểm, và để nó gọi thật thì mỗi lần render sẽ
 * đòi một QueryClientProvider cộng một khoá bản đồ — hai thứ không liên quan gì tới đây.
 */
/*
 * Danh mục cấp xã có DỮ LIỆU THẬT (mã 5 chữ số), không phải danh sách rỗng.
 *
 * Đây là điều kiện để bắt được lỗi `wardInvalid`: mẫu cũ `/^d{5}$/` khớp chuỗi "ddddd" và
 * KHÔNG khớp một mã xã nào, nên chỉ một form CÓ chọn được xã mới phơi nó ra. Với `options: []`
 * thì ô xã không bao giờ có giá trị và lỗi đó vô hình.
 */
const WARD = { code: '26734', name: 'Phường Bến Nghé' };
vi.mock('@/features/locations/hooks/use-wards', () => ({
  useWardOptions: () => ({
    options: [{ value: WARD.code, label: WARD.name }],
    items: [WARD],
    total: 1,
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

/**
 * ── HAI CỬA VÀO, MỘT FORM (ADR 0040) ─────────────────────────────────────────────────────────
 *
 * Điều bộ này khoá là thứ mà `variant` cũ KHÔNG làm được: `track` phải điều khiển cả HỢP ĐỒNG
 * (trường `registrationTrack` gửi lên) lẫn BỘ TRƯỜNG BẮT BUỘC, không chỉ câu chữ. Trước ADR 0040,
 * hai điểm vào gửi lên request giống hệt nhau — và đó là toàn bộ cái bug.
 */
function renderTrack(track: 'commission' | 'package') {
  return render(
    <App>
      <ShopRegistration track={track} />
    </App>,
  );
}

/** Chọn một option của `<Select>` AntD theo nhãn hiển thị. */
async function pickOption(labelPattern: RegExp, optionText: string): Promise<void> {
  fireEvent.mouseDown(screen.getByLabelText(labelPattern));
  await waitFor(() => expect(screen.getByTitle(optionText)).toBeTruthy());
  fireEvent.click(screen.getByTitle(optionText));
}

describe('ShopRegistration — cửa vào quyết định hợp đồng', () => {
  it('tuyến hoa hồng: gửi `registrationTrack: commission`, KHÔNG đòi xã/địa chỉ/SĐT', async () => {
    renderTrack('commission');

    fireEvent.change(screen.getByLabelText(/Tên gian hàng/), { target: { value: 'Xe của A' } });
    await pickOption(/Tỉnh\/thành/, 'TP Hồ Chí Minh');
    fireEvent.click(screen.getByRole('button', { name: /Tạo gian hàng/ }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    expect(mutation.mutate.mock.calls[0]![0]).toMatchObject({
      registrationTrack: 'commission',
      provinceCode: '79',
      // Ba trường của tuyến gói vắng mặt — form không gửi chuỗi rỗng lên server.
      wardCode: undefined,
      addressLine: undefined,
      phone: undefined,
    });
  });

  it('tuyến gói: thiếu xã/địa chỉ/SĐT → KHÔNG gọi API, và lỗi hiện bằng TIẾNG VIỆT', async () => {
    renderTrack('package');

    fireEvent.change(screen.getByLabelText(/Tên gian hàng/), { target: { value: 'Gian hàng A' } });
    await pickOption(/Tỉnh\/thành/, 'TP Hồ Chí Minh');
    fireEvent.click(screen.getByRole('button', { name: /Tạo gian hàng và chọn gói/ }));

    await waitFor(() => expect(screen.getByText('Chọn xã/phường/đặc khu')).toBeTruthy());
    expect(screen.getByText('Nhập số nhà, đường của gian hàng')).toBeTruthy();
    expect(screen.getByText('Nhập số điện thoại liên hệ của gian hàng')).toBeTruthy();
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  /**
   * HỒI QUY `wardInvalid` — lỗi đã thấy trên giao diện.
   *
   * Mẫu cũ trong `@xeprime/validators` là `/^d{5}$/` (thiếu dấu gạch chéo ngược): nó khớp chuỗi
   * "ddddd" và không khớp MỘT mã xã thật nào. Hệ quả kép:
   *
   *   1. mọi lượt chọn xã đều bị từ chối, kể cả xã hợp lệ;
   *   2. và vì `ShopOnboarding.validation` chưa có khoá `wardInvalid`, `useValidationResolver`
   *      để nguyên chuỗi gốc — người dùng đọc thấy đúng chữ `wardInvalid` trên màn hình.
   *
   * Test này khoá CẢ HAI: chọn một mã 5 chữ số hợp lệ thì form phải đi qua, và chữ `wardInvalid`
   * không bao giờ xuất hiện ở dạng mã trần.
   */
  it('chọn xã hợp lệ → đi qua; mã trần `wardInvalid` KHÔNG bao giờ hiện trên giao diện', async () => {
    renderTrack('package');

    fireEvent.change(screen.getByLabelText(/Tên gian hàng/), { target: { value: 'Gian hàng A' } });
    await pickOption(/Tỉnh\/thành/, 'TP Hồ Chí Minh');
    await pickOption(/Xã\/phường/, WARD.name);
    fireEvent.change(screen.getByLabelText(/Số nhà, đường/), {
      target: { value: '12 Nguyễn Huệ' },
    });
    fireEvent.change(screen.getByLabelText(/Số điện thoại/), { target: { value: '0901234567' } });
    fireEvent.click(screen.getByRole('button', { name: /Tạo gian hàng và chọn gói/ }));

    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    expect(mutation.mutate.mock.calls[0]![0]).toMatchObject({
      registrationTrack: 'package',
      provinceCode: '79',
      wardCode: WARD.code,
      addressLine: '12 Nguyễn Huệ',
      phone: '0901234567',
    });
    expect(screen.queryByText(/wardInvalid/)).toBeNull();
  });

  /*
   * Loại hình CHỈ hỏi ở tuyến hoa hồng: nó không quyết định gì trong luồng tiền (ADR 0014 điều
   * 2 — nguồn duy nhất của chế độ thu phí là GÓI), nên một ô chọn ở bước đang đếm từng giây
   * trước khi người ta xem giá là ma sát không đổi lấy được gì.
   */
  it('tuyến gói KHÔNG hỏi loại hình; tuyến hoa hồng thì có', () => {
    renderTrack('package');
    expect(screen.queryByLabelText(/Loại hình/)).toBeNull();
    cleanup();

    renderTrack('commission');
    expect(screen.getByLabelText(/Loại hình/)).toBeTruthy();
  });
});
