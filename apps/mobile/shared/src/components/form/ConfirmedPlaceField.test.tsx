import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import { Pressable, Text } from 'react-native';
import * as yup from 'yup';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { withIntl } from '@/i18n/test-utils';
import { placesApi } from '@/api/locations/api';
import { ConfirmedPlaceField } from './AddressFields';

/**
 * `ConfirmedPlaceField` — khoá lại đúng những điều bị bỏ sót khi mới port từ web:
 *
 *   1. Gõ đè lên chữ đã xác nhận rồi rời ô mà KHÔNG chọn lại gợi ý ⇒ ô trả về chữ cũ (chữ và
 *      ghim luôn mô tả CÙNG một địa điểm — nếu không, đơn gửi đi mang chữ mới nhưng phí giao xe
 *      vẫn tính theo toạ độ cũ).
 *   2. Bấm một gợi ý mà tra chi tiết hỏng ⇒ KHÔNG ghi ghim, chữ trả về mốc cũ, hiện cảnh báo.
 *   3. Lỗi "chưa xác nhận vị trí" của schema (gắn ở trường TOẠ ĐỘ, không có ô nhập nào) phải lộ
 *      ra thành chữ đọc được, không im lặng chặn nút Gửi.
 *
 * Bản web có `ConfirmedPlaceField.test.tsx` khoá cùng ba điều này; suite ở đây là bản đối chiếu
 * cho native, thứ đã thiếu hoàn toàn trước đợt sửa 18/09/2026.
 *
 * ⚠️ `fireEvent`/`fireEvent.changeText`/`fireEvent.press` của bản RNTL đang cài đều là HÀM BẤT
 * ĐỒNG BỘ (chúng tự bọc `act()` bên trong) — quên `await` là gọi xong lệnh tiếp theo trước khi
 * React kịp render lại, và assertion đọc trúng state của lượt render TRƯỚC.
 */
jest.mock('@/api/locations/api', () => ({
  placesApi: {
    search: jest.fn(),
    detail: jest.fn(),
    reverse: jest.fn(),
  },
  locationsApi: {
    provinces: jest.fn(),
    wards: jest.fn(),
    wardLookup: jest.fn(),
  },
}));

const mockedPlacesApi = jest.mocked(placesApi);

interface FormValues {
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

const SUGGESTION = {
  placeId: 'place-1',
  primaryText: '21 Lý Thường Kiệt',
  secondaryText: 'Phường Vĩnh Ninh, Huế',
};

function Harness({
  initial,
  onConfirmedManually,
}: {
  onConfirmedManually?: () => void;
  initial?: Partial<FormValues>;
}) {
  const schema = yup.object({
    addressLine: yup.string().trim().default(''),
    placeId: yup.string().nullable().default(null),
    latitude: yup.number().nullable().default(null),
    longitude: yup.number().nullable().default(null),
    locationSource: yup.string().nullable().default(null),
  });

  const { control, trigger } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      addressLine: '',
      placeId: null,
      latitude: null,
      longitude: null,
      locationSource: null,
      ...initial,
    },
  });

  const values = useWatch({ control });

  return (
    <>
      <ConfirmedPlaceField
        control={control}
        addressLineName="addressLine"
        pin={PIN}
        required
        disabled={false}
        {...(onConfirmedManually ? { onConfirmedManually } : {})}
      />
      <Text testID="form-state">{JSON.stringify(values)}</Text>
      {/* Đứng thay cho lượt `trigger()` mà wizard thật chạy trước khi cho đi tiếp. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="validate"
        onPress={() => void trigger(['latitude', 'longitude'])}
      />
    </>
  );
}

async function renderHarness(props?: Parameters<typeof Harness>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <Harness {...props} />
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedPlacesApi.search.mockResolvedValue({ items: [SUGGESTION], available: true });
});

describe('ConfirmedPlaceField', () => {
  it('chọn một gợi ý ghi đúng chữ + ghim của gợi ý đó', async () => {
    mockedPlacesApi.detail.mockResolvedValue({
      available: true,
      place: { placeId: SUGGESTION.placeId, latitude: '16.46', longitude: '107.59' },
    });

    const view = await renderHarness();
    const input = view.getByLabelText('Địa chỉ');
    await fireEvent.changeText(input, '21 Ly Thuong');

    await waitFor(() => view.getByText(SUGGESTION.primaryText));
    await fireEvent.press(view.getByText(SUGGESTION.primaryText));

    await waitFor(() => expect(input.props.value).toBe('21 Lý Thường Kiệt, Phường Vĩnh Ninh, Huế'));
    // Rời ô ngay sau đó KHÔNG được xoá lựa chọn vừa chốt.
    await fireEvent(input, 'blur');
    expect(input.props.value).toBe('21 Lý Thường Kiệt, Phường Vĩnh Ninh, Huế');
  });

  it('gõ đè lên địa chỉ đã xác nhận rồi rời ô mà không chọn lại gợi ý ⇒ ô trả về chữ đã xác nhận, không gửi đi một chữ không khớp ghim', async () => {
    mockedPlacesApi.detail.mockResolvedValue({
      available: true,
      place: { placeId: SUGGESTION.placeId, latitude: '16.46', longitude: '107.59' },
    });

    const view = await renderHarness();
    const input = view.getByLabelText('Địa chỉ');
    await fireEvent.changeText(input, '21 Ly Thuong');
    await waitFor(() => view.getByText(SUGGESTION.primaryText));
    await fireEvent.press(view.getByText(SUGGESTION.primaryText));
    await waitFor(() => expect(input.props.value).toBe('21 Lý Thường Kiệt, Phường Vĩnh Ninh, Huế'));

    // Gõ thêm vào ô — chữ giờ không khớp toạ độ đã chốt nữa.
    await fireEvent.changeText(input, '21 Lý Thường Kiệt, sửa tay');
    expect(input.props.value).toBe('21 Lý Thường Kiệt, sửa tay');

    // Rời ô mà KHÔNG bấm lại một gợi ý nào ⇒ phải trả về đúng chữ đã xác nhận gần nhất.
    await fireEvent(input, 'blur');
    expect(input.props.value).toBe('21 Lý Thường Kiệt, Phường Vĩnh Ninh, Huế');
  });

  it('bấm một gợi ý mà tra chi tiết hỏng ⇒ không ghi ghim, chữ trả về mốc cũ, hiện cảnh báo', async () => {
    mockedPlacesApi.detail.mockRejectedValue(new Error('network'));

    const view = await renderHarness();
    const input = view.getByLabelText('Địa chỉ');
    await fireEvent.changeText(input, '21 Ly Thuong');
    await waitFor(() => view.getByText(SUGGESTION.primaryText));
    await fireEvent.press(view.getByText(SUGGESTION.primaryText));

    await waitFor(() => view.getByText('Chưa lấy được vị trí của địa điểm này. Hãy chọn lại.'));
    // Mốc cũ là rỗng (chưa từng xác nhận gì) — ô phải trả đúng về đó, không giữ chữ vừa gõ.
    expect(input.props.value).toBe('');
  });

  it('"dùng đúng địa chỉ đã nhập" chốt chữ khách gõ, không toạ độ — rời ô không xoá nó (ADR 0061)', async () => {
    const view = await renderHarness({
      initial: { addressLine: '', latitude: 16.4, longitude: 107.5, placeId: 'old', locationSource: 'map_pin' },
    });
    const input = view.getByLabelText('Địa chỉ');
    await fireEvent.changeText(input, '12 Hẻm 34 Nguyễn Trãi');
    const row = await waitFor(() =>
      view.getByLabelText('Không có trong danh sách? Dùng đúng địa chỉ đã nhập'),
    );
    await fireEvent.press(row);
    await fireEvent(input, 'blur');
    expect(input.props.value).toBe('12 Hẻm 34 Nguyễn Trãi');
    expect(mockedPlacesApi.detail).not.toHaveBeenCalled();
  });

  it('tra chi tiết trả `available: false` ⇒ CHỐT dòng vừa bấm như địa chỉ gõ tay, không bảo "chọn lại"', async () => {
    mockedPlacesApi.detail.mockResolvedValue({ available: false, place: null });

    const view = await renderHarness();
    const input = view.getByLabelText('Địa chỉ');
    await fireEvent.changeText(input, '21 Ly Thuong');
    await waitFor(() => view.getByText(SUGGESTION.primaryText));
    await fireEvent.press(view.getByText(SUGGESTION.primaryText));

    await waitFor(() => expect(input.props.value).toBe('21 Lý Thường Kiệt, Phường Vĩnh Ninh, Huế'));
    await fireEvent(input, 'blur');
    expect(input.props.value).toBe('21 Lý Thường Kiệt, Phường Vĩnh Ninh, Huế');
    expect(view.queryByText('Chưa lấy được vị trí của địa điểm này. Hãy chọn lại.')).toBeNull();
  });

  it('điền sẵn từ BÊN NGOÀI (bộ nhớ địa chỉ giao xe) được coi là đã xác nhận — không tự xoá ở lần rời ô đầu tiên', async () => {
    const view = await renderHarness({
      initial: {
        addressLine: '12 Nguyễn Thái Học',
        placeId: 'remembered',
        latitude: 16.46,
        longitude: 107.59,
        locationSource: 'google_place',
      },
    });
    const input = view.getByLabelText('Địa chỉ');
    expect(input.props.value).toBe('12 Nguyễn Thái Học');

    await fireEvent(input, 'blur');
    expect(input.props.value).toBe('12 Nguyễn Thái Học');
  });

  it('"dùng đúng địa chỉ đã nhập" báo onConfirmedManually và ghi nguồn manual, dọn ghim', async () => {
    const onConfirmedManually = jest.fn();
    const view = await renderHarness({
      initial: { latitude: 16.4, longitude: 107.5, placeId: 'old', locationSource: 'map_pin' },
      onConfirmedManually,
    });
    await fireEvent.changeText(view.getByLabelText('Địa chỉ'), '12 Hẻm 34 Nguyễn Trãi');
    await fireEvent.press(
      await waitFor(() => view.getByLabelText('Không có trong danh sách? Dùng đúng địa chỉ đã nhập')),
    );
    expect(onConfirmedManually).toHaveBeenCalledTimes(1);
    expect(stateOf(view)).toMatchObject({
      locationSource: 'manual',
      latitude: null,
      longitude: null,
      placeId: null,
    });
  });

  it('dịch vụ gợi ý tắt (available: false) ⇒ gõ là dọn ghim + placeId, nguồn manual', async () => {
    mockedPlacesApi.search.mockResolvedValue({ items: [], available: false });
    const view = await renderHarness({
      initial: { addressLine: '', latitude: 16.4, longitude: 107.5, placeId: 'old', locationSource: 'google_place' },
    });
    const input = view.getByLabelText('Địa chỉ');
    await fireEvent.changeText(input, '12 Nguyễn Trãi');
    await waitFor(() => expect(mockedPlacesApi.search).toHaveBeenCalled());
    await fireEvent.changeText(input, '12 Nguyễn Trãi, Huế');
    expect(stateOf(view)).toMatchObject({
      locationSource: 'manual',
      latitude: null,
      longitude: null,
      placeId: null,
    });
    // Ô chữ tự do: rời ô không trả về mốc.
    await fireEvent(input, 'blur');
    expect(input.props.value).toBe('12 Nguyễn Trãi, Huế');
  });

  it('gõ đè địa chỉ gõ tay đã chốt ⇒ tạm gỡ nhãn manual; gõ về đúng chữ cũ thì nhận lại', async () => {
    const view = await renderHarness({
      initial: { addressLine: '12 Hẻm 34', locationSource: 'manual' },
    });
    const input = view.getByLabelText('Địa chỉ');
    await fireEvent.changeText(input, '12 Hẻm 34 sửa');
    expect(stateOf(view).locationSource).toBeNull();
    await fireEvent.changeText(input, '12 Hẻm 34');
    expect(stateOf(view).locationSource).toBe('manual');
    // Rời ô sau khi gõ đè ⇒ trả về mốc và trả lại nhãn.
    await fireEvent.changeText(input, '12 Hẻm 34 khác');
    await fireEvent(input, 'blur');
    expect(input.props.value).toBe('12 Hẻm 34');
    expect(stateOf(view).locationSource).toBe('manual');
  });

  it('kết quả tra chi tiết của một lượt bấm đã bị thay (gõ tiếp) bị bỏ qua', async () => {
    let resolveDetail: (v: unknown) => void = () => undefined;
    mockedPlacesApi.detail.mockImplementation(
      () => new Promise((r) => { resolveDetail = r; }) as never,
    );
    const view = await renderHarness();
    const input = view.getByLabelText('Địa chỉ');
    await fireEvent.changeText(input, '21 Ly Thuong');
    await waitFor(() => view.getByText(SUGGESTION.primaryText));
    await fireEvent.press(view.getByText(SUGGESTION.primaryText));
    await fireEvent.changeText(input, 'Đổi ý rồi');
    resolveDetail({
      available: true,
      place: { placeId: SUGGESTION.placeId, latitude: '16.46', longitude: '107.59' },
    });
    await waitFor(() => expect(mockedPlacesApi.detail).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(input.props.value).toBe('Đổi ý rồi');
    expect(stateOf(view)).toMatchObject({ latitude: null, placeId: null });
  });

  it('không hỏi gợi ý cho chữ trùng địa chỉ đã xác nhận (except — ADR 0061 §3)', async () => {
    await renderHarness({
      initial: { addressLine: '12 Nguyễn Thái Học', latitude: 16.46, longitude: 107.59, locationSource: 'google_place' },
    });
    await new Promise((r) => setTimeout(r, 600));
    expect(mockedPlacesApi.search).not.toHaveBeenCalled();
  });
});

function stateOf(view: Awaited<ReturnType<typeof renderHarness>>): FormValues {
  return JSON.parse(String(view.getByTestId('form-state').props.children)) as FormValues;
}
