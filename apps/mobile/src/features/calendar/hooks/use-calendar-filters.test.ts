import { act, renderHook } from '@testing-library/react-native';
import { DEFAULT_DAYS, useCalendarFilters } from './use-calendar-filters';

/** Mốc cố định để "hôm nay" là một giá trị kiểm được, không phải ngày chạy test. */
const NOW = new Date('2026-07-12T03:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useCalendarFilters', () => {
  /**
   * Khoá con số mặc định ở ĐÚNG MỘT chỗ.
   *
   * App mở 3 ngày, khác web (14): 14 cột trên màn 360dp cho ra ô ~23dp, hẹp hơn một đầu ngón tay.
   * Vì là chỗ lệch web nên nó phải có một test nói thẳng con số, chứ không chỉ tham chiếu hằng —
   * đổi nó là một quyết định sản phẩm, không phải một lần chỉnh cho vừa mắt.
   */
  it('mặc định mở 3 ngày — cố ý khác web', () => {
    expect(DEFAULT_DAYS).toBe(3);
  });

  it('mặc định: hôm nay theo giờ VN, khoảng mặc định, không lọc, sắp xếp next_booking', async () => {
    const { result } = await renderHook(() => useCalendarFilters());

    expect(result.current.filters).toEqual({
      from: '2026-07-12',
      days: DEFAULT_DAYS,
      vehicleType: null,
      q: null,
      sort: 'next_booking',
    });
    expect(result.current.filtered).toBe(false);
  });

  it('GIEO `q` từ route param — đó là lối "Xem lịch" của một xe', async () => {
    const { result } = await renderHook(() => useCalendarFilters({ q: '59X1-333.44' }));

    expect(result.current.filters.q).toBe('59X1-333.44');
    expect(result.current.filtered).toBe(true);
  });

  it('bỏ khoảng trắng thừa của `q`, và coi chuỗi toàn khoảng trắng là KHÔNG lọc', async () => {
    expect(
      (await renderHook(() => useCalendarFilters({ q: '  Vios  ' }))).result.current.filters.q,
    ).toBe('Vios');
    expect(
      (await renderHook(() => useCalendarFilters({ q: '   ' }))).result.current.filters.q,
    ).toBeNull();
  });

  it('gieo `from` và `days` từ route param', async () => {
    const { result } = await renderHook(() =>
      useCalendarFilters({ from: '2026-08-01', days: '7' }),
    );

    expect(result.current.filters.from).toBe('2026-08-01');
    // 7 chứ không phải mặc định — gieo đúng thì mới thấy khác mặc định.
    expect(result.current.filters.days).toBe(7);
  });

  it('KẸP `days` lạc ra ngoài [1, 62] về mặc định — backend cũng validate lại', async () => {
    expect(
      (await renderHook(() => useCalendarFilters({ days: '0' }))).result.current.filters.days,
    ).toBe(DEFAULT_DAYS);
    expect(
      (await renderHook(() => useCalendarFilters({ days: '999' }))).result.current.filters.days,
    ).toBe(DEFAULT_DAYS);
    expect(
      (await renderHook(() => useCalendarFilters({ days: 'không-phải-số' }))).result.current.filters
        .days,
    ).toBe(DEFAULT_DAYS);
  });

  it('cắt phần thập phân của `days` thay vì đẩy 7.9 cột xuống API', async () => {
    // 7, KHÔNG phải mặc định: '7.9' là số HỢP LỆ, chỉ bị cắt phần thập phân.
    expect(
      (await renderHook(() => useCalendarFilters({ days: '7.9' }))).result.current.filters.days,
    ).toBe(7);
  });

  it('vá một trường không đụng các trường còn lại', async () => {
    const { result } = await renderHook(() => useCalendarFilters({ q: 'Vios' }));

    await act(async () => {
      result.current.setFilters({ days: 3 });
    });

    expect(result.current.filters.days).toBe(3);
    expect(result.current.filters.q).toBe('Vios');
  });

  it('`null` đưa trường về MẶC ĐỊNH, không phải về null — `from`/`days`/`sort` luôn có giá trị', async () => {
    const { result } = await renderHook(() =>
      useCalendarFilters({ from: '2026-08-01', days: '7' }),
    );

    await act(async () => {
      result.current.setFilters({ from: null, days: null, sort: null });
    });

    expect(result.current.filters.from).toBe('2026-07-12');
    expect(result.current.filters.days).toBe(DEFAULT_DAYS);
    expect(result.current.filters.sort).toBe('next_booking');
  });

  it('`null` xoá HẲN hai bộ lọc thu hẹp — `q` và `vehicleType`', async () => {
    const { result } = await renderHook(() => useCalendarFilters({ q: 'Vios' }));

    await act(async () => {
      result.current.setFilters({ vehicleType: 'car' });
    });
    expect(result.current.filters.vehicleType).toBe('car');

    await act(async () => {
      result.current.setFilters({ q: null, vehicleType: null });
    });
    expect(result.current.filters.q).toBeNull();
    expect(result.current.filters.vehicleType).toBeNull();
    expect(result.current.filtered).toBe(false);
  });

  it('giá trị `sort` lạ rơi về mặc định thay vì đi tiếp xuống API', async () => {
    const { result } = await renderHook(() => useCalendarFilters());

    await act(async () => {
      result.current.setFilters({ sort: 'drop table' as never });
    });

    expect(result.current.filters.sort).toBe('next_booking');
  });

  it('nhận đủ bốn giá trị sắp xếp hợp lệ', async () => {
    const { result } = await renderHook(() => useCalendarFilters());

    for (const sort of ['name', 'price_asc', 'price_desc', 'next_booking'] as const) {
      await act(async () => {
        result.current.setFilters({ sort });
      });
      expect(result.current.filters.sort).toBe(sort);
    }
  });

  it('`reset` đưa MỌI thứ về mặc định', async () => {
    const { result } = await renderHook(() => useCalendarFilters({ q: 'Vios', days: '7' }));

    await act(async () => {
      result.current.setFilters({ vehicleType: 'motorbike', sort: 'name' });
    });
    await act(async () => {
      result.current.reset();
    });

    expect(result.current.filters).toEqual({
      from: '2026-07-12',
      days: DEFAULT_DAYS,
      vehicleType: null,
      q: null,
      sort: 'next_booking',
    });
  });

  it('`setFilters` giữ NGUYÊN tham chiếu qua các lần render — nó nằm trong deps của effect tìm kiếm', async () => {
    const { result, rerender } = await renderHook(() => useCalendarFilters());
    const first = result.current.setFilters;

    await act(async () => {
      result.current.setFilters({ days: 3 });
    });
    rerender(undefined);

    expect(result.current.setFilters).toBe(first);
  });
});
