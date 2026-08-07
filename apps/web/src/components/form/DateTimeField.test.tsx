import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { dayjs, type Dayjs } from '@/lib/datetime';

import { DateTimeField } from './DateTimeField';

afterEach(cleanup);

interface SingleValues {
  pickupAt: Dayjs | null;
}

interface RangeValues {
  period: [Dayjs | null, Dayjs | null] | null;
}

function SingleHarness({
  onValues,
  defaultValue = null,
}: {
  onValues?: (values: SingleValues) => void;
  defaultValue?: Dayjs | null;
}) {
  const { control, handleSubmit } = useForm<SingleValues>({
    defaultValues: { pickupAt: defaultValue },
  });
  return (
    <form onSubmit={handleSubmit((values) => onValues?.(values))}>
      <DateTimeField control={control} name="pickupAt" label="Nhận xe" />
      <button type="submit">Gửi</button>
    </form>
  );
}

function RangeHarness({
  onValues,
  defaultValue = null,
}: {
  onValues?: (values: RangeValues) => void;
  defaultValue?: [Dayjs | null, Dayjs | null] | null;
}) {
  const { control, handleSubmit } = useForm<RangeValues>({
    defaultValues: { period: defaultValue },
  });
  return (
    <form onSubmit={handleSubmit((values) => onValues?.(values))}>
      <DateTimeField control={control} name="period" label="Khoảng thuê" range />
      <button type="submit">Gửi</button>
    </form>
  );
}

describe('DateTimeField — ngày giờ đơn', () => {
  it('nhãn nối vào ô nhập (vá nợ D14.4)', () => {
    render(<SingleHarness />);

    expect(screen.getByLabelText('Nhận xe')).toBeTruthy();
  });

  it('hiện giá trị có sẵn theo định dạng Việt Nam', () => {
    render(<SingleHarness defaultValue={dayjs('2026-08-07T09:30:00')} />);

    expect((screen.getByLabelText('Nhận xe') as HTMLInputElement).value).toBe('07/08/2026 09:30');
  });

  it('rỗng thì ô nhập trống, không hiện "Invalid Date"', () => {
    render(<SingleHarness />);

    expect((screen.getByLabelText('Nhận xe') as HTMLInputElement).value).toBe('');
  });

  it('giá trị đưa ra payload vẫn là Dayjs — KHÔNG tự hoá chuỗi hay UTC', async () => {
    const onValues = vi.fn();
    const value = dayjs('2026-08-07T09:30:00');
    render(<SingleHarness defaultValue={value} onValues={onValues} />);

    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await vi.waitFor(() => expect(onValues).toHaveBeenCalled());
    const submitted = onValues.mock.calls[0]![0].pickupAt;
    expect(dayjs.isDayjs(submitted)).toBe(true);
    // Serialize là việc của feature (`.toISOString()`), không phải của field — nếu component tự
    // chuyển đổi thì mọi form đặt xe lệch giờ cùng lúc.
    expect(submitted.format('YYYY-MM-DDTHH:mm')).toBe('2026-08-07T09:30');
  });

  it('xoá giá trị trả về null tường minh', async () => {
    const onValues = vi.fn();
    render(<SingleHarness defaultValue={dayjs('2026-08-07T09:30:00')} onValues={onValues} />);

    const clear = document.querySelector('.ant-picker-clear');
    expect(clear).toBeTruthy();
    fireEvent.mouseDown(clear!);
    fireEvent.click(clear!);

    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
    await vi.waitFor(() => expect(onValues).toHaveBeenCalled());
    expect(onValues.mock.calls[0]![0].pickupAt).toBeNull();
  });
});

describe('DateTimeField — khoảng thời gian', () => {
  it('range dựng hai ô nhập', () => {
    const { container } = render(<RangeHarness />);

    expect(container.querySelectorAll('.ant-picker-input input')).toHaveLength(2);
  });

  it('placeholder mặc định nói rõ hai đầu', () => {
    render(<RangeHarness />);

    expect(screen.getByPlaceholderText('Từ ngày')).toBeTruthy();
    expect(screen.getByPlaceholderText('Đến ngày')).toBeTruthy();
  });

  it('hiện giá trị có sẵn ở cả hai đầu', () => {
    const { container } = render(
      <RangeHarness defaultValue={[dayjs('2026-08-01T08:00:00'), dayjs('2026-08-05T18:00:00')]} />,
    );

    const inputs = container.querySelectorAll('.ant-picker-input input');
    expect((inputs[0] as HTMLInputElement).value).toBe('01/08/2026 08:00');
    expect((inputs[1] as HTMLInputElement).value).toBe('05/08/2026 18:00');
  });

  it('giá trị range giữ nguyên dạng cặp Dayjs trong payload', async () => {
    const onValues = vi.fn();
    render(
      <RangeHarness
        defaultValue={[dayjs('2026-08-01T08:00:00'), dayjs('2026-08-05T18:00:00')]}
        onValues={onValues}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await vi.waitFor(() => expect(onValues).toHaveBeenCalled());
    const period = onValues.mock.calls[0]![0].period!;
    expect(period).toHaveLength(2);
    expect(dayjs.isDayjs(period[0])).toBe(true);
    expect(period[0]!.format('YYYY-MM-DD')).toBe('2026-08-01');
    expect(period[1]!.format('YYYY-MM-DD')).toBe('2026-08-05');
  });

  it('range rỗng không làm vỡ render', () => {
    expect(() => render(<RangeHarness defaultValue={null} />)).not.toThrow();
  });
});

describe('DateTimeField — hợp đồng kiểu', () => {
  it('cùng một component phục vụ hai kiểu giá trị khác nhau, phân biệt bằng prop range', () => {
    // Nếu union bị phá (ví dụ ai đó đổi `range` thành boolean rời), một trong hai harness dưới
    // đây sẽ không còn biên dịch được — đó chính là cái chặn.
    const { unmount } = render(<SingleHarness />);
    unmount();
    expect(() => render(<RangeHarness />)).not.toThrow();
  });
});
