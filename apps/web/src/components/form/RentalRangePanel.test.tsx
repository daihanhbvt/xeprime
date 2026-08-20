import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import dayjs, { type Dayjs } from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildBusyDayIndex } from '@/lib/rental-busy';

import { RentalRangePanel, type RentalMode, type RentalRangeDraft } from './RentalRangePanel';

/**
 * Hộp chọn khoảng thuê — nơi DUY NHẤT sinh ra `pickupAt`/`returnAt` cho cả hero trang chủ lẫn
 * overlay yêu cầu thuê.
 *
 * Điều cần khoá ở đây là **hợp đồng thời gian**, không phải giao diện: hai tab (ngày/giờ) luôn
 * trả về cùng một cặp `{pickupAt, returnAt}` hợp lệ, và tab "Thuê theo giờ" phải TỰ TÍNH giờ trả
 * = giờ nhận + thời lượng (khách không phải nhẩm cộng, và không có đường nào tạo ra giờ trả
 * trước giờ nhận).
 */
afterEach(cleanup);

function renderPanel(
  value: RentalRangeDraft,
  mode: RentalMode = 'hourly',
  onChange = vi.fn(),
  onModeChange = vi.fn(),
) {
  render(
    <RentalRangePanel
      value={value}
      onChange={onChange}
      mode={mode}
      onModeChange={onModeChange}
      months={1}
      onApply={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  return { onChange, onModeChange };
}

/** Lần gọi `onChange` gần nhất — giá trị mà form sẽ nhận. */
function lastChange(onChange: ReturnType<typeof vi.fn>): RentalRangeDraft {
  const calls = onChange.mock.calls;
  return calls[calls.length - 1]![0] as RentalRangeDraft;
}

describe('RentalRangePanel — thuê theo giờ', () => {
  const start = dayjs('2026-09-01T10:00:00.000+07:00');

  it('chọn thời lượng → giờ trả = giờ nhận + số giờ, cả hai đều hợp lệ', () => {
    const { onChange } = renderPanel({ pickupAt: start, returnAt: start.add(4, 'hour') });

    // Bấm thẳng vào dòng thời lượng 6 giờ (mỗi dòng hiện sẵn giờ kết thúc).
    fireEvent.click(screen.getByText('6 giờ'));

    const next = lastChange(onChange);
    expect(next.pickupAt?.toISOString()).toBe(start.toISOString());
    expect(next.returnAt?.toISOString()).toBe(start.add(6, 'hour').toISOString());
    expect(next.returnAt!.isAfter(next.pickupAt!)).toBe(true);
  });

  it('đổi giờ nhận → giờ trả dời theo, giữ nguyên thời lượng', () => {
    const { onChange } = renderPanel({ pickupAt: start, returnAt: start.add(3, 'hour') });

    fireEvent.click(screen.getByText('8 giờ'));
    const next = lastChange(onChange);

    expect(next.returnAt!.diff(next.pickupAt!, 'hour')).toBe(8);
  });

  it('chuyển từ tab ngày sang tab giờ chuẩn hoá giá trị thành "bắt đầu + thời lượng"', () => {
    const daily: RentalRangeDraft = {
      pickupAt: dayjs('2026-09-01T10:00:00.000+07:00'),
      returnAt: dayjs('2026-09-05T10:00:00.000+07:00'),
    };
    const { onChange, onModeChange } = renderPanel(daily, 'daily');

    fireEvent.click(screen.getByRole('tab', { name: 'Thuê theo giờ' }));

    expect(onModeChange).toHaveBeenCalledWith('hourly');
    const next = lastChange(onChange);
    // Khoảng 4 NGÀY không phải thời lượng giờ hợp lệ (1–24) → rơi về mặc định, KHÔNG giữ 96h.
    const hours = next.returnAt!.diff(next.pickupAt!, 'hour');
    expect(hours).toBeGreaterThanOrEqual(1);
    expect(hours).toBeLessThanOrEqual(24);
    expect(next.returnAt!.isAfter(next.pickupAt!)).toBe(true);
  });
});

describe('RentalRangePanel — thuê theo ngày', () => {
  it('chưa đủ hai đầu thì KHÔNG cho áp dụng', () => {
    const value: RentalRangeDraft = {
      pickupAt: dayjs('2026-09-01T10:00:00.000+07:00'),
      returnAt: null,
    };
    render(
      <RentalRangePanel
        value={value}
        onChange={vi.fn()}
        mode="daily"
        onModeChange={vi.fn()}
        months={1}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect((screen.getByRole('button', { name: 'Áp dụng' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText('Chọn ngày nhận và ngày trả xe')).toBeTruthy();
  });

  it('giờ trả không sau giờ nhận → nói rõ và chặn áp dụng', () => {
    const at = dayjs('2026-09-01T10:00:00.000+07:00');
    const value: RentalRangeDraft = { pickupAt: at, returnAt: at as Dayjs };
    render(
      <RentalRangePanel
        value={value}
        onChange={vi.fn()}
        mode="daily"
        onModeChange={vi.fn()}
        months={1}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Giờ trả phải sau giờ nhận')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Áp dụng' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

/**
 * Lịch bận (20/08) — ba bảo đảm, vì mỗi cái hỏng theo một kiểu khác nhau:
 *   1. ngày bận TRỌN bị khoá, không bấm vào được;
 *   2. ngày bận VÀI GIỜ vẫn bấm được nhưng nói rõ bận khung nào (nếu khoá luôn là mất đơn);
 *   3. khoảng đã chọn chạm giờ bận thì "Áp dụng" tắt kèm lý do đọc được — chặn ở đây tốt hơn
 *      để khách đi hết luồng rồi mới bị từ chối.
 */
describe('RentalRangePanel — lịch bận của xe', () => {
  const isoVn = (local: string) => `${local}:00.000+07:00`;

  /** Tháng 9/2026 quanh mốc `PICKUP`: 11 bận trọn ngày, 10 bận 08:00–12:00. */
  const BUSY = buildBusyDayIndex([
    {
      date: '2026-09-10',
      fullyBusy: false,
      periods: [{ startAt: isoVn('2026-09-10T08:00'), endAt: isoVn('2026-09-10T12:00') }],
    },
    { date: '2026-09-11', fullyBusy: true, periods: [] },
  ]);

  function renderBusy(value: RentalRangeDraft, onChange = vi.fn()) {
    render(
      <RentalRangePanel
        value={value}
        onChange={onChange}
        mode="daily"
        onModeChange={vi.fn()}
        months={1}
        busyDays={BUSY}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    return onChange;
  }

  /** Nút ngày trên lưới — lấy theo `title`/số hiển thị trong tháng đang mở. */
  const dayButton = (label: string) =>
    screen
      .getAllByRole('button')
      .find((b) => b.textContent === label && b.closest('.rdp-day')) as HTMLButtonElement;

  it('ngày bận trọn ngày bị khoá và nói rõ lý do; ngày bận vài giờ vẫn bấm được', () => {
    renderBusy({ pickupAt: dayjs(isoVn('2026-09-05T10:00')), returnAt: null });

    const full = dayButton('11');
    expect(full.disabled).toBe(true);
    expect(full.title).toBe('Xe đã có lịch cả ngày');

    const partial = dayButton('10');
    expect(partial.disabled).toBe(false);
    expect(partial.title).toContain('08:00–12:00');
  });

  it('ngày TRẢ sau một ngày bận trọn bị khoá — khoảng không đi xuyên qua ngày bận được', () => {
    renderBusy({ pickupAt: dayjs(isoVn('2026-09-05T10:00')), returnAt: null });

    // 10 (bận một phần) vẫn là ngày trả hợp lệ; 12 nằm SAU ngày bận trọn 11 nên không.
    expect(dayButton('10').disabled).toBe(false);
    expect(dayButton('12').disabled).toBe(true);
  });

  it('chú giải màu xuất hiện khi lịch có ngày bận', () => {
    renderBusy({ pickupAt: null, returnAt: null });
    expect(screen.getByText('Ngày bận')).toBeTruthy();
    expect(screen.getByText('Bận một phần')).toBeTruthy();
  });

  it('khoảng chọn chạm giờ bận → tắt "Áp dụng" và nêu đúng khung giờ', () => {
    renderBusy({
      pickupAt: dayjs(isoVn('2026-09-10T09:00')),
      returnAt: dayjs(isoVn('2026-09-12T09:00')),
    });

    expect(screen.getByRole('alert').textContent).toContain('08:00–12:00');
    expect((screen.getByRole('button', { name: 'Áp dụng' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('nhận xe ngay khi hết giờ bận thì hợp lệ — không cảnh báo, không chặn', () => {
    renderBusy({
      pickupAt: dayjs(isoVn('2026-09-10T12:00')),
      returnAt: dayjs(isoVn('2026-09-10T20:00')),
    });

    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('button', { name: 'Áp dụng' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('không truyền lịch bận thì không khoá gì và không có chú giải', () => {
    render(
      <RentalRangePanel
        value={{ pickupAt: dayjs(isoVn('2026-09-05T10:00')), returnAt: null }}
        onChange={vi.fn()}
        mode="daily"
        onModeChange={vi.fn()}
        months={1}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(dayButton('11').disabled).toBe(false);
    expect(screen.queryByText('Ngày bận')).toBeNull();
  });
});
