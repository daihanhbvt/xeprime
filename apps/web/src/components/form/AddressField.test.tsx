import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AddressField } from './AddressField';

/**
 * Ô nhập ĐỊA CHỈ VẬT LÝ — bản hợp đồng của mô hình hành chính hai cấp (ADR 0035).
 *
 * Bốn thứ test này khoá, và cả bốn đều là chỗ đã từng hoặc sẽ hỏng âm thầm:
 *   1. Hai cấp chọn từ DANH MỤC, và cấp xã KHOÁ cho tới khi có tỉnh — chọn xã trước tỉnh là
 *      cách chắc chắn nhất để gửi lên một cặp mã mà FK tổ hợp ở DB sẽ từ chối.
 *   2. Đổi tỉnh thì XOÁ mã xã cũ. Giữ lại là đúng cặp mã DB từ chối kia, chỉ khác là người dùng
 *      nhận một lỗi không giải thích được sau khi bấm Lưu.
 *   3. Mở form SỬA (đã có sẵn tỉnh + xã) KHÔNG được coi là "vừa đổi tỉnh" — bug này xoá mất xã
 *      đã lưu ngay giây đầu tiên và không để lại dấu vết nào.
 *   4. Danh mục rỗng/đang tải/lỗi là ba SỰ THẬT khác nhau và phải nói khác nhau.
 */
const provinces = vi.hoisted(() => ({
  options: [
    { value: '01', label: 'TP Hà Nội' },
    { value: '79', label: 'TP Hồ Chí Minh' },
  ] as { value: string; label: string }[],
  isLoading: false,
  isError: false,
}));
vi.mock('@/features/locations/hooks/use-provinces', () => ({
  useProvinceOptions: () => ({ ...provinces, error: null, refetch: vi.fn() }),
}));

const wards = vi.hoisted(() => ({
  byProvince: {
    '79': [{ code: '27301', provinceCode: '79', name: 'Phường Chợ Quán', shortName: 'Chợ Quán' }],
    '01': [{ code: '00004', provinceCode: '01', name: 'Phường Ba Đình', shortName: 'Ba Đình' }],
  } as Record<string, Array<{ code: string; provinceCode: string; name: string; shortName: string }>>,
  isLoading: false,
  isError: false,
}));
vi.mock('@/features/locations/hooks/use-wards', () => ({
  useWardOptions: (provinceCode: string | null | undefined) => {
    const items = wards.byProvince[provinceCode ?? ''] ?? [];
    return {
      items,
      options: items.map((w) => ({ value: w.code, label: w.name })),
      total: items.length,
      isLoading: wards.isLoading,
      isError: wards.isError,
      refetch: vi.fn(),
    };
  },
}));

// Bản đồ không tham gia vào luật hành chính — tắt hẳn để test không phụ thuộc mạng lẫn khoá API.
vi.mock('@/features/locations/hooks/use-places', () => ({
  PLACE_SEARCH_MIN_LENGTH: 3,
  usePlaceSearch: () => ({ data: { items: [], available: false }, isFetching: false }),
  usePlaceDetail: () => ({ mutateAsync: vi.fn() }),
  useReverseGeocode: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/components/form/MapPinPicker', () => ({ MapPinPicker: () => null }));

interface Values {
  provinceCode: string;
  wardCode: string;
  addressLine: string;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  locationSource: string | null;
}

const NAMES = {
  provinceCode: 'provinceCode',
  wardCode: 'wardCode',
  addressLine: 'addressLine',
} as const;
const PIN = {
  placeId: 'placeId',
  latitude: 'latitude',
  longitude: 'longitude',
  locationSource: 'locationSource',
} as const;

function Harness({
  defaults,
  onValues,
}: {
  defaults?: Partial<Values>;
  onValues?: (values: Values) => void;
}) {
  const { control, handleSubmit } = useForm<Values>({
    defaultValues: {
      provinceCode: '',
      wardCode: '',
      addressLine: '',
      placeId: null,
      latitude: null,
      longitude: null,
      locationSource: null,
      ...defaults,
    },
  });
  return (
    <form onSubmit={handleSubmit((values) => onValues?.(values))}>
      <AddressField control={control} names={NAMES} pin={PIN} required />
      <button type="submit">Gửi</button>
    </form>
  );
}

/** AntD Select là combobox dựng bằng div — mở nó bằng chính vai trò khả truy cập. */
function openSelect(label: RegExp) {
  fireEvent.mouseDown(screen.getByLabelText(label));
}

beforeEach(() => {
  provinces.options = [
    { value: '01', label: 'TP Hà Nội' },
    { value: '79', label: 'TP Hồ Chí Minh' },
  ];
  provinces.isLoading = false;
  provinces.isError = false;
  wards.isLoading = false;
  wards.isError = false;
});

afterEach(cleanup);

describe('AddressField — hai cấp hành chính', () => {
  it('ô xã/phường KHOÁ cho tới khi chọn tỉnh', () => {
    const { container } = render(<Harness />);

    expect(container.textContent).toContain('Chọn tỉnh/thành trước');
    // Hai ô chọn: tỉnh mở được, xã thì không.
    expect(container.querySelectorAll('.ant-select-disabled')).toHaveLength(1);
  });

  it('chọn tỉnh xong thì ô xã mở ra và chỉ liệt kê xã CỦA TỈNH đó', async () => {
    render(<Harness />);

    openSelect(/Tỉnh\/thành/);
    fireEvent.click(await screen.findByTitle('TP Hà Nội'));

    openSelect(/Xã\/phường/);
    expect(await screen.findByTitle('Phường Ba Đình')).toBeTruthy();
    expect(screen.queryByTitle('Phường Chợ Quán')).toBeNull();
  });

  it('đổi tỉnh thì XOÁ mã xã cũ — không gửi lên một cặp mã DB sẽ từ chối', async () => {
    const onValues = vi.fn();
    render(<Harness defaults={{ provinceCode: '01', wardCode: '00004' }} onValues={onValues} />);

    openSelect(/Tỉnh\/thành/);
    fireEvent.click(await screen.findByTitle('TP Hồ Chí Minh'));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(onValues).toHaveBeenCalled());
    expect(onValues.mock.calls[0]?.[0]).toMatchObject({ provinceCode: '79', wardCode: '' });
  });

  it('mở form SỬA không bị coi là "vừa đổi tỉnh" — xã đã lưu còn nguyên', async () => {
    const onValues = vi.fn();
    render(<Harness defaults={{ provinceCode: '01', wardCode: '00004' }} onValues={onValues} />);

    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(onValues).toHaveBeenCalled());
    expect(onValues.mock.calls[0]?.[0]).toMatchObject({ provinceCode: '01', wardCode: '00004' });
  });
});

describe('AddressField — trạng thái của danh mục', () => {
  it('đang tải: ô chọn bị khoá và nói rõ đang tải', () => {
    provinces.options = [];
    provinces.isLoading = true;
    const { container } = render(<Harness />);

    // AntD tách placeholder ra node riêng nên `getByText` không khớp — đọc textContent cả cây.
    expect(container.textContent).toContain('Đang tải tỉnh/thành');
  });

  it('danh mục rỗng: khoá ô và nói rõ lý do thay vì một dropdown trống vô nghĩa', () => {
    provinces.options = [];
    const { container } = render(<Harness />);

    expect(container.textContent).toContain('Chưa có tỉnh/thành nào mở đăng ký');
    expect(container.querySelector('.ant-select-disabled')).not.toBeNull();
  });

  it('API danh mục lỗi: cảnh báo + nút thử lại, không im lặng để form không dùng được', () => {
    provinces.options = [];
    provinces.isError = true;
    render(<Harness />);

    expect(screen.getByText('Không tải được danh mục tỉnh/thành.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });

  it('danh mục cấp xã lỗi: nói ở chính ô đó, không chặn cả khối địa chỉ', async () => {
    wards.isError = true;
    const { container } = render(<Harness defaults={{ provinceCode: '01' }} />);

    await waitFor(() =>
      expect(container.textContent).toContain('Không tải được danh mục xã/phường.'),
    );
  });
});
