import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmedPlaceField } from './ConfirmedPlaceField';

/**
 * Ô địa chỉ PHẢI ĐƯỢC BẢN ĐỒ XÁC NHẬN.
 *
 * Năm điều test này khoá, và cả năm đều là chỗ mà một bản "gần đúng" sẽ đi thẳng vào tiền:
 *   1. Gõ rồi bỏ đi mà không chọn gợi ý ⇒ ô về RỖNG. Chữ tự do không có toạ độ, mà quãng đường
 *      giao xe đo từ toạ độ (ADR 0018) — giữ lại nó là hứa một phép tính không chạy được.
 *   2. Chọn một gợi ý ⇒ chữ ở lại VÀ toạ độ vào form. Đây là đường đi chính.
 *   3. Mốc "đã xác nhận" của form SỬA là địa chỉ đang lưu, không phải rỗng — nếu không, mở form
 *      sửa rồi bấm ra ngoài là xoá mất địa chỉ có thật (ADR 0035 điều 7).
 *   4. Địa chỉ được điền từ BÊN NGOÀI sau khi mount (nhớ từ lần đặt trước) cũng là một mốc hợp
 *      lệ — cú blur đầu tiên không được xoá thứ hệ thống vừa tự điền.
 *   5. Bản đồ trả `available: false` ⇒ kỷ luật TẮT, ô thành một ô chữ bình thường. Bắt chọn từ
 *      một danh sách luôn rỗng nghĩa là không ai lưu nổi địa chỉ nào (ADR 0035 điều 6).
 */
const places = vi.hoisted(() => ({
  items: [] as Array<{ placeId: string; primaryText: string; secondaryText: string | null }>,
  available: true,
  detail: null as unknown,
  reverse: null as unknown,
  /** Chuỗi CUỐI CÙNG đã gửi đi hỏi bản đồ — xem ca "hỏi đúng thứ người dùng gõ". */
  lastQuery: '' as string,
}));

vi.mock('@/features/locations/hooks/use-places', () => ({
  PLACE_SEARCH_MIN_LENGTH: 3,
  usePlaceSearch: (query: string) => {
    places.lastQuery = query;
    return {
      data: { items: places.items, available: places.available },
      isFetching: false,
      isError: false,
    };
  },
  usePlaceDetail: () => ({ mutateAsync: () => Promise.resolve({ place: places.detail }) }),
  useReverseGeocode: () => ({ mutateAsync: () => Promise.resolve({ place: places.reverse }) }),
}));

/**
 * Bản đồ thật cần khoá tile và một DOM đo được, hai thứ không liên quan tới luật đang test. Thay
 * bằng một nút gọi đúng `onChange` mà `MapPinPicker` gọi khi người dùng bấm/kéo ghim.
 */
vi.mock('@/components/form/MapPinPicker', () => ({
  MapPinPicker: ({ onChange }: { onChange: (p: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onChange({ lat: 16.06, lng: 108.21 })}>
      Đặt ghim
    </button>
  ),
}));

interface Values {
  addressLine: string;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
  locationSource: string | null;
}

const PIN = {
  placeId: 'placeId',
  latitude: 'latitude',
  longitude: 'longitude',
  locationSource: 'locationSource',
} as const;

function Harness({
  defaults,
  onValues,
  externalValue,
}: {
  defaults?: Partial<Values>;
  onValues?: (values: Values) => void;
  /** Giá trị đổ vào SAU khi mount — giả lập nhớ địa chỉ lần trước / form sửa nạp bản ghi muộn. */
  externalValue?: string;
}) {
  const { control, handleSubmit, setValue } = useForm<Values>({
    defaultValues: {
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
      <ConfirmedPlaceField
        control={control}
        addressLineName="addressLine"
        pin={PIN}
        label="Địa chỉ giao xe"
        placeholder="Ví dụ: 12 Nguyễn Thái Học"
      />
      {externalValue ? (
        <button type="button" onClick={() => setValue('addressLine', externalValue)}>
          Điền hộ
        </button>
      ) : null}
      <button type="submit">Gửi</button>
    </form>
  );
}

function input(): HTMLElement {
  return screen.getByLabelText(/Địa chỉ giao xe/);
}

beforeEach(() => {
  places.items = [];
  places.available = true;
  places.detail = null;
  places.reverse = null;
  places.lastQuery = '';
});

afterEach(cleanup);

describe('ConfirmedPlaceField', () => {
  /**
   * Reset phải IM LẶNG.
   *
   * Bản trước hiện một cảnh báo hai dòng giải thích vì sao chữ biến mất. Đó là giải thích cơ
   * chế nội bộ đúng lúc người dùng đang muốn đi tiếp — dòng chú thích dưới ô đã nói trước phải
   * làm gì, và ô trống cộng dấu sao bắt buộc đã đủ để họ biết còn thiếu.
   */
  it('gõ rồi rời ô mà không chọn gợi ý → ô về rỗng, KHÔNG kèm lời giải thích nào', async () => {
    render(<Harness />);

    fireEvent.change(input(), { target: { value: '12 Nguyễn Huệ' } });
    expect((input() as HTMLInputElement).value).toBe('12 Nguyễn Huệ');

    fireEvent.blur(input());

    await waitFor(() => expect((input() as HTMLInputElement).value).toBe(''));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/xác nhận/i)).toBeNull();
  });

  it('chọn một gợi ý → ĐỦ địa chỉ vào ô, và toạ độ vào form', async () => {
    places.items = [
      {
        placeId: 'gp1:16.0,108.2',
        primaryText: '12 Nguyễn Huệ',
        secondaryText: 'Phường Hải Châu, Đà Nẵng',
      },
    ];
    places.detail = {
      placeId: 'gp1:16.0,108.2',
      latitude: '16.0471',
      longitude: '108.2068',
      formattedAddress: '12 Nguyễn Huệ, Đà Nẵng',
      suggestedProvinceCode: '48',
      suggestedAddressLine: '12 Nguyễn Huệ',
    };
    const onValues = vi.fn();
    render(<Harness onValues={onValues} />);

    fireEvent.change(input(), { target: { value: '12 Nguyễn' } });
    fireEvent.mouseDown(input());
    fireEvent.click(await screen.findByText('12 Nguyễn Huệ'));

    // CẢ HAI phần của dòng gợi ý — người dùng chọn cái họ đọc được, ô phải hiện lại đúng cái đó.
    const full = '12 Nguyễn Huệ, Phường Hải Châu, Đà Nẵng';
    await waitFor(() => expect((input() as HTMLInputElement).value).toBe(full));

    // Rời ô sau khi đã chọn: chữ phải ở NGUYÊN, đây là mốc đã xác nhận.
    fireEvent.blur(input());
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(onValues).toHaveBeenCalled());
    expect(onValues.mock.calls[0]![0]).toMatchObject({
      addressLine: full,
      latitude: 16.0471,
      longitude: 108.2068,
    });
  });

  it('form SỬA: mốc là địa chỉ đang lưu, nên blur trả về nó chứ không xoá trắng', async () => {
    render(<Harness defaults={{ addressLine: '123 Lê Lợi', latitude: 16, longitude: 108 }} />);

    fireEvent.change(input(), { target: { value: '123 Lê Lợi nhưng gõ dở' } });
    fireEvent.blur(input());

    await waitFor(() => expect((input() as HTMLInputElement).value).toBe('123 Lê Lợi'));
  });

  it('địa chỉ được điền hộ SAU khi mount cũng là mốc hợp lệ', async () => {
    render(<Harness externalValue="45 Trần Phú" />);

    fireEvent.click(screen.getByRole('button', { name: 'Điền hộ' }));
    await waitFor(() => expect((input() as HTMLInputElement).value).toBe('45 Trần Phú'));

    fireEvent.blur(input());

    // Không có khối "nhận mốc từ bên ngoài", cú blur này xoá sạch thứ vừa được điền.
    await waitFor(() => expect((input() as HTMLInputElement).value).toBe('45 Trần Phú'));
  });

  /**
   * HỒI QUY: hỏi bản đồ ĐÚNG thứ người dùng gõ.
   *
   * Bản trước nối tên xã + tên tỉnh vào sau để "khoanh vùng". Autocomplete khớp theo TỪ, nên mỗi
   * từ thêm vào là một từ nữa phải khớp — và tên đó là NHÃN giao diện ("TP Huế"), không phải tên
   * trong dữ liệu bản đồ. Đo được trên máy thật: `q=21 Lý Thường, TP Huế` trả về rỗng trong khi
   * chính `21 Lý Thường` ra đúng chỗ. Khoanh vùng là việc của `anchor`, và nó khoanh bằng toạ độ.
   */
  it('gửi đi ĐÚNG chữ người dùng gõ, không ghép thêm tỉnh/xã', async () => {
    render(<Harness />);

    fireEvent.change(input(), { target: { value: '21 Lý Thường Kiệt' } });

    await waitFor(() => expect(places.lastQuery).toBe('21 Lý Thường Kiệt'));
  });

  /**
   * Đặt ghim là một lời xác nhận vị trí, nên địa chỉ tra ngược được phải NHẢY LÊN ô — kể cả khi ô
   * đang có chữ. Ghim mới là sự thật mới; giữ lại dòng chữ của vị trí trước đó là để ô nói một
   * chỗ trong khi toạ độ trỏ một chỗ khác.
   */
  it('đặt ghim trên bản đồ → địa chỉ tra ngược nhảy lên ô, đè chữ cũ', async () => {
    places.reverse = { formattedAddress: '133 Đường Trung Lương 11, Đà Nẵng' };
    const onValues = vi.fn();
    render(<Harness onValues={onValues} />);

    fireEvent.change(input(), { target: { value: 'chữ cũ chưa xác nhận' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt ghim' }));

    const resolved = '133 Đường Trung Lương 11, Đà Nẵng';
    await waitFor(() => expect((input() as HTMLInputElement).value).toBe(resolved));

    // Và đó là mốc đã xác nhận: rời ô không xoá nó.
    fireEvent.blur(input());
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(onValues).toHaveBeenCalled());
    expect(onValues.mock.calls[0]![0]).toMatchObject({
      addressLine: resolved,
      latitude: 16.06,
      longitude: 108.21,
    });
  });

  it('tra ngược hỏng vẫn giữ ghim và chốt chữ đang có', async () => {
    places.reverse = null;
    const onValues = vi.fn();
    render(<Harness onValues={onValues} />);

    fireEvent.change(input(), { target: { value: 'Hẻm 25 Nguyễn Công Trứ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt ghim' }));

    fireEvent.blur(input());
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(onValues).toHaveBeenCalled());
    expect(onValues.mock.calls[0]![0]).toMatchObject({
      addressLine: 'Hẻm 25 Nguyễn Công Trứ',
      latitude: 16.06,
      longitude: 108.21,
    });
  });

  it('bản đồ không dùng được → ô thành ô chữ tự do, không xoá gì', async () => {
    places.available = false;
    render(<Harness />);

    fireEvent.change(input(), { target: { value: 'Hẻm 25 Nguyễn Công Trứ' } });
    fireEvent.blur(input());

    await waitFor(() =>
      expect((input() as HTMLInputElement).value).toBe('Hẻm 25 Nguyễn Công Trứ'),
    );
  });
});
