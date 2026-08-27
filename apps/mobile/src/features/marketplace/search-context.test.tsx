import { renderHook, act } from '@testing-library/react-native';
import { toListingQueryParams } from '@xeprime/api-client';
import { VEHICLE_TYPE } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { SearchExperienceProvider, useSearchExperience } from './search-context';

jest.mock('./hooks/use-marketplace-data', () => ({
  useDestinations: () => ({ data: [], isLoading: false, error: null }),
}));

async function mount() {
  return renderHook(() => useSearchExperience(), {
    wrapper: ({ children }) =>
      withIntl(<SearchExperienceProvider>{children}</SearchExperienceProvider>),
  });
}

/**
 * Canh ranh giới "bản nháp" ↔ "ngữ cảnh đã áp dụng".
 *
 * Web chặn chỗ này bằng cờ `userEditedRef`. Thiếu nó, khoảng thuê MẶC ĐỊNH của bản nháp bị áp
 * ngay từ lần render đầu và trang chủ lọc theo một khoảng ngày khách chưa hề chọn — đúng lúc đó
 * app hiện 29 xe trong khi web hiện 49.
 */
describe('useSearchExperience — ngữ cảnh áp dụng', () => {
  it('chưa chạm vào thẻ thì KHÔNG lọc theo ngày', async () => {
    const { result } = await mount();

    expect(result.current.filters).toEqual({});
    // Bản nháp vẫn có sẵn khoảng thuê để ô lịch hiển thị được — nó chỉ chưa có hiệu lực.
    expect(result.current.draft.rental.pickupAt).not.toBeNull();
  });

  it('đổi loại xe thì áp cả ngữ cảnh, kèm khoảng thuê đang có', async () => {
    const { result } = await mount();

    await act(async () => result.current.setVehicleType(VEHICLE_TYPE.MOTORBIKE));

    expect(result.current.filters.vehicleType).toBe(VEHICLE_TYPE.MOTORBIKE);
    expect(result.current.filters.pickupAt).toBeDefined();
  });

  it('bấm Tìm xe áp bản nháp mà không cần sửa gì trước', async () => {
    const { result } = await mount();

    await act(async () => result.current.submit());

    expect(result.current.filters.pickupAt).toBeDefined();
    expect(result.current.filters.returnAt).toBeDefined();
  });

  /**
   * Khối "Xe khả dụng" chỉ lấy NĂM chiều ngữ cảnh, không phải cả bộ lọc.
   *
   * Trải cả `filters` từng làm `hourly` (tab "Thuê theo giờ") lọt vào query, và trang chủ chỉ
   * còn xe CÓ giá thuê giờ — web hiện 29 xe, app hiện 19.
   */
  it('ngữ cảnh gửi lên preview KHÔNG mang cờ hourly', async () => {
    const { result } = await mount();

    await act(async () => result.current.setRentalMode('hourly'));
    await act(async () => result.current.submit());

    // Ngữ cảnh áp dụng CÓ cờ đó — nó là một chiều lọc hợp lệ ở màn kết quả tìm xe.
    expect(result.current.filters.hourly).toBe(true);

    // Nhưng preview chỉ đọc năm chiều, nên query của nó không mang cờ.
    const previewQuery = toListingQueryParams({
      serviceType: result.current.filters.serviceType,
      vehicleType: result.current.filters.vehicleType,
      provinceCode: result.current.filters.provinceCode,
      pickupAt: result.current.filters.pickupAt,
      returnAt: result.current.filters.returnAt,
    });
    expect(previewQuery.hourly).toBeNull();
  });

  it('không để lọt key `undefined` vào ngữ cảnh — nó sẽ vào query key của TanStack Query', async () => {
    const { result } = await mount();

    await act(async () => result.current.submit());

    for (const [key, value] of Object.entries(result.current.filters)) {
      expect([key, value]).not.toEqual([key, undefined]);
    }
  });
});

/**
 * Khoảng thuê áp NGAY khi chọn xong, không chờ "Tìm xe".
 *
 * Web gọi `edit` cho `setRentalRange`/`setRentalMode`, nên "Xe khả dụng" ở trang chủ đổi theo
 * ngay lúc bấm Áp dụng. Bản native từng giữ hai lối này ở riêng bản nháp và con số đứng im.
 */
describe('useSearchExperience — khoảng thuê áp ngay', () => {
  it('chọn khoảng thuê là ngữ cảnh đổi theo, chưa cần bấm Tìm xe', async () => {
    const { result } = await mount();

    const pickupAt = result.current.draft.rental.pickupAt;
    const returnAt = result.current.draft.rental.returnAt;

    await act(async () => result.current.setRentalRange({ pickupAt, returnAt }));

    expect(result.current.filters.pickupAt).toBeDefined();
    expect(result.current.filters.returnAt).toBeDefined();
  });

  it('đổi chế độ theo giờ cũng áp ngay', async () => {
    const { result } = await mount();

    await act(async () => result.current.setRentalMode('hourly'));

    expect(result.current.filters.hourly).toBe(true);
  });
});
