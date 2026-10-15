import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmedPlaceField } from './ConfirmedPlaceField';

/**
 * Ô địa chỉ PHẢI ĐƯỢC XÁC NHẬN.
 *
 * Sáu điều test này khoá, và cả sáu đều là chỗ mà một bản "gần đúng" sẽ đi thẳng vào tiền:
 *   1. Gõ rồi bỏ đi mà không xác nhận ⇒ ô về RỖNG. Chữ gõ dở không phải một địa chỉ, mà quãng
 *      đường giao xe đo tới địa chỉ đó (ADR 0018).
 *   2. Chọn một gợi ý ⇒ chữ ở lại VÀ toạ độ vào form. Đây là đường đi chính.
 *   3. Địa chỉ nhà cung cấp chưa biết ⇒ khách CHỦ ĐỘNG chọn "dùng đúng địa chỉ đã nhập": chữ ở
 *      lại, toạ độ cũ bị dọn, nguồn ghi `manual`. Web không có bản đồ để đặt ghim (ADR 0061), nên
 *      thiếu lối này là "không lưu được".
 *   4. Mốc "đã xác nhận" của form SỬA là địa chỉ đang lưu, không phải rỗng — nếu không, mở form
 *      sửa rồi bấm ra ngoài là xoá mất địa chỉ có thật (ADR 0035 điều 7).
 *   5. Địa chỉ được điền từ BÊN NGOÀI sau khi mount (nhớ từ lần đặt trước) cũng là một mốc hợp
 *      lệ — cú blur đầu tiên không được xoá thứ hệ thống vừa tự điền.
 *   6. Gợi ý trả `available: false` ⇒ kỷ luật TẮT, ô thành một ô chữ bình thường. Bắt chọn từ
 *      một danh sách luôn rỗng nghĩa là không ai lưu nổi địa chỉ nào (ADR 0035 điều 6).
 */
const places = vi.hoisted(() => ({
  items: [] as Array<{ placeId: string; primaryText: string; secondaryText: string | null }>,
  available: true,
  detail: null as unknown,
  /** `available` của `/places/detail` — `false` = nhà cung cấp không trả lời. */
  detailAvailable: true,
  /** Chuỗi CUỐI CÙNG đã gửi đi hỏi bản đồ — xem ca "hỏi đúng thứ người dùng gõ". */
  lastQuery: '' as string,
  /** Lần render cuối có được phép hỏi bản đồ không — mỗi lượt hỏi là một giao dịch. */
  lastEnabled: undefined as boolean | undefined,
}));

vi.mock('@/features/locations/hooks/use-places', () => ({
  PLACE_SEARCH_MIN_LENGTH: 3,
  usePlaceSearch: (query: string, options: { enabled?: boolean } = {}) => {
    places.lastQuery = query;
    places.lastEnabled = options.enabled;
    return {
      data: { items: places.items, available: places.available },
      isFetching: false,
      isError: false,
      isPlaceholderData: false,
      // Không mô phỏng debounce: danh sách trong tay luôn là của đúng chữ đang hiện.
      debouncedQuery: query.trim(),
    };
  },
  usePlaceDetail: () => ({
    mutateAsync: () =>
      Promise.resolve({ place: places.detail, available: places.detailAvailable }),
  }),
}));

const USE_TYPED = /Dùng đúng địa chỉ đã nhập/;

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
  onConfirmedManually,
}: {
  defaults?: Partial<Values>;
  onValues?: (values: Values) => void;
  onConfirmedManually?: () => void;
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
        onConfirmedManually={onConfirmedManually}
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

async function submitted(onValues: ReturnType<typeof vi.fn>): Promise<Values> {
  fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
  await waitFor(() => expect(onValues).toHaveBeenCalled());
  return onValues.mock.calls[0]![0] as Values;
}

beforeEach(() => {
  places.items = [];
  places.available = true;
  places.detail = null;
  places.detailAvailable = true;
  places.lastQuery = '';
  places.lastEnabled = undefined;
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
  it('gõ rồi rời ô mà không xác nhận → ô về rỗng, KHÔNG kèm lời giải thích nào', async () => {
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
        placeId: 'auto:near',
        primaryText: '12 Nguyễn Huệ',
        secondaryText: 'Phường Hải Châu, Đà Nẵng',
      },
    ];
    places.detail = {
      placeId: 'auto:near',
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

    expect(await submitted(onValues)).toMatchObject({
      addressLine: full,
      placeId: 'auto:near',
      latitude: 16.0471,
      longitude: 108.2068,
      locationSource: 'google_place',
    });
    // Ảnh bản đồ TĨNH của đúng địa điểm vừa chọn hiện ngay dưới ô (ADR 0061 điều 1).
    const map = screen.getByRole('img', { name: 'Bản đồ vị trí' });
    expect(map.getAttribute('src')).toBe('/api/places/map?placeId=auto%3Anear');
  });

  /**
   * Lối ra cho địa chỉ nhà cung cấp chưa biết (hẻm, số nhà mới). Toạ độ CŨ phải bị dọn: chúng
   * thuộc về địa chỉ trước đó, và gửi chúng đi cùng dòng chữ mới là đo phí giao tới nhầm chỗ.
   */
  it('"dùng đúng địa chỉ đã nhập" → chữ ở lại, toạ độ cũ bị dọn, nguồn manual, báo nơi gọi', async () => {
    const onValues = vi.fn();
    const onConfirmedManually = vi.fn();
    render(
      <Harness
        onValues={onValues}
        onConfirmedManually={onConfirmedManually}
        defaults={{
          addressLine: '123 Lê Lợi',
          placeId: 'auto:old',
          latitude: 16,
          longitude: 108,
          locationSource: 'google_place',
        }}
      />,
    );

    fireEvent.change(input(), { target: { value: 'Hẻm 25/7 Nguyễn Công Trứ' } });
    fireEvent.mouseDown(input());
    fireEvent.click(await screen.findByText(USE_TYPED));

    fireEvent.blur(input());
    await waitFor(() =>
      expect((input() as HTMLInputElement).value).toBe('Hẻm 25/7 Nguyễn Công Trứ'),
    );

    expect(await submitted(onValues)).toMatchObject({
      addressLine: 'Hẻm 25/7 Nguyễn Công Trứ',
      placeId: null,
      latitude: null,
      longitude: null,
      locationSource: 'manual',
    });
    // Tỉnh gợi ý / cảnh báo lệch tỉnh của địa điểm cũ phải được nơi gọi dọn.
    expect(onConfirmedManually).toHaveBeenCalledTimes(1);
    // Địa chỉ gõ tay không có toạ độ — không có ảnh bản đồ nào để hiện (ảnh của địa điểm cũ cũng đi).
    expect(screen.queryByRole('img', { name: 'Bản đồ vị trí' })).toBeNull();
  });

  /**
   * Báo giá giao xe chỉ tra bằng chữ khi nguồn là `manual` (mỗi lượt tra là hai giao dịch). Gõ đè
   * lên địa chỉ gõ tay đã chốt thì nhãn phải gỡ ngay — nếu không, mỗi lần khách dừng tay giữa
   * chừng là một lượt tra tính tiền cho một dòng gõ dở. Ô quay về mốc thì nhãn quay lại.
   */
  it('gõ đè địa chỉ gõ tay đã chốt → tạm gỡ nhãn manual; blur về mốc → nhận lại', async () => {
    const onValues = vi.fn();
    render(
      <Harness
        onValues={onValues}
        defaults={{ addressLine: 'Hẻm 25/7 Nguyễn Công Trứ', locationSource: 'manual' }}
      />,
    );

    fireEvent.change(input(), { target: { value: 'Hẻm 25/7 Nguyễn Công Trứ, gõ thêm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    await waitFor(() => expect(onValues).toHaveBeenCalledTimes(1));
    expect(onValues.mock.calls[0]![0]).toMatchObject({ locationSource: null });

    fireEvent.blur(input());
    await waitFor(() =>
      expect((input() as HTMLInputElement).value).toBe('Hẻm 25/7 Nguyễn Công Trứ'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    await waitFor(() => expect(onValues).toHaveBeenCalledTimes(2));
    expect(onValues.mock.calls[1]![0]).toMatchObject({
      addressLine: 'Hẻm 25/7 Nguyễn Công Trứ',
      locationSource: 'manual',
    });
  });

  /**
   * Nhà cung cấp không trả lời ≠ mã không ra gì. Bảo khách "chọn lại" lúc hết giao dịch là một vòng
   * lặp (gợi ý còn đến từ cache, mọi lượt tra đều hỏng) — dòng đã bấm được chốt như địa chỉ gõ tay.
   */
  it('chọn gợi ý mà nhà cung cấp không trả lời → chốt dòng đó như địa chỉ gõ tay', async () => {
    places.items = [{ placeId: 'auto:x', primaryText: '12 Nguyễn Huệ', secondaryText: 'Đà Nẵng' }];
    places.detailAvailable = false;
    const onValues = vi.fn();
    render(<Harness onValues={onValues} />);

    fireEvent.change(input(), { target: { value: '12 Nguyễn' } });
    fireEvent.mouseDown(input());
    fireEvent.click(await screen.findByText('12 Nguyễn Huệ'));

    await waitFor(() =>
      expect((input() as HTMLInputElement).value).toBe('12 Nguyễn Huệ, Đà Nẵng'),
    );
    fireEvent.blur(input());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await submitted(onValues)).toMatchObject({
      addressLine: '12 Nguyễn Huệ, Đà Nẵng',
      latitude: null,
      locationSource: 'manual',
    });
  });

  /** Chữ trùng địa chỉ đã xác nhận (form sửa vừa mở) không có gì để gợi ý — và mỗi lượt là tiền. */
  it('không hỏi bản đồ cho địa chỉ đã xác nhận; gõ khác đi mới hỏi', async () => {
    render(<Harness defaults={{ addressLine: '123 Lê Lợi', latitude: 16, longitude: 108 }} />);
    expect(places.lastEnabled).toBe(false);

    fireEvent.change(input(), { target: { value: '123 Lê Lợi, Huế' } });
    await waitFor(() => expect(places.lastEnabled).toBe(true));
  });

  /**
   * Chỉ mời khi có gì đó để xác nhận: chưa đủ dài thì chưa là một địa chỉ, còn chữ trùng chữ đã
   * xác nhận thì bấm vào cũng chẳng đổi gì.
   */
  it('chưa gõ đủ dài, hoặc chữ trùng địa chỉ đã xác nhận → không mời "dùng đúng địa chỉ"', async () => {
    render(<Harness defaults={{ addressLine: '123 Lê Lợi' }} />);

    fireEvent.change(input(), { target: { value: '12' } });
    fireEvent.mouseDown(input());
    expect(screen.queryByText(USE_TYPED)).toBeNull();

    fireEvent.change(input(), { target: { value: '123 Lê Lợi' } });
    fireEvent.mouseDown(input());
    expect(screen.queryByText(USE_TYPED)).toBeNull();
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
   * Ô chữ tự do thì chữ gõ tay CHÍNH LÀ địa chỉ: nguồn `manual` (báo giá giao xe còn tra được),
   * và toạ độ của địa điểm cũ bị dọn vì chúng tả một dòng chữ khác.
   */
  it('gợi ý không dùng được → ô thành ô chữ tự do, không xoá chữ, chữ gõ là địa chỉ gõ tay', async () => {
    places.available = false;
    const onValues = vi.fn();
    render(
      <Harness
        onValues={onValues}
        defaults={{ addressLine: '123 Lê Lợi', placeId: 'auto:old', latitude: 16, longitude: 108 }}
      />,
    );

    fireEvent.change(input(), { target: { value: 'Hẻm 25 Nguyễn Công Trứ' } });
    fireEvent.mouseDown(input());
    expect(screen.queryByText(USE_TYPED)).toBeNull();
    fireEvent.blur(input());

    await waitFor(() =>
      expect((input() as HTMLInputElement).value).toBe('Hẻm 25 Nguyễn Công Trứ'),
    );
    expect(await submitted(onValues)).toMatchObject({
      addressLine: 'Hẻm 25 Nguyễn Công Trứ',
      placeId: null,
      latitude: null,
      longitude: null,
      locationSource: 'manual',
    });
  });
});
