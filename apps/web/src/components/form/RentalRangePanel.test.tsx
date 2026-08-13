import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import dayjs, { type Dayjs } from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
