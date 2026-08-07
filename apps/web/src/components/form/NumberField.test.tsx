import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NumberField } from './NumberField';

afterEach(cleanup);

interface Values {
  amount: number | null;
  rate: number | null;
}

function Harness({
  onValues,
  ...props
}: { onValues?: (values: Values) => void } & Partial<Parameters<typeof NumberField<Values>>[0]>) {
  const { control, handleSubmit } = useForm<Values>({
    defaultValues: { amount: null, rate: null },
  });
  return (
    <form onSubmit={handleSubmit((values) => onValues?.(values))}>
      <NumberField control={control} name="amount" label="Số tiền" {...props} />
      <button type="submit">Gửi</button>
    </form>
  );
}

function input(): HTMLInputElement {
  return screen.getByLabelText('Số tiền') as HTMLInputElement;
}

describe('NumberField — khả truy cập', () => {
  it('nhãn nối vào ô nhập (vá nợ D14.4)', () => {
    render(<Harness />);

    // Trước Wave 1C-C dòng này không chạy được: `Form.Item` có label nhưng không có `htmlFor`.
    expect(input()).toBeTruthy();
    expect(input().id).toBeTruthy();
  });
});

describe('NumberField — số thường', () => {
  it('nhập số và giữ nguyên giá trị trong payload', async () => {
    const onValues = vi.fn();
    render(<Harness onValues={onValues} />);

    fireEvent.change(input(), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await vi.waitFor(() => expect(onValues).toHaveBeenCalled());
    expect(onValues.mock.calls[0]![0].amount).toBe(42);
  });

  it('min và max được truyền xuống ô nhập', () => {
    render(<Harness min={5} max={9} />);

    expect(input().getAttribute('aria-valuemin')).toBe('5');
    expect(input().getAttribute('aria-valuemax')).toBe('9');
  });
});

describe('NumberField — tiền', () => {
  it('hiện hậu tố ₫', () => {
    render(<Harness money />);

    expect(screen.getByText('₫')).toBeTruthy();
  });

  it('nhóm nghìn theo kiểu Việt Nam khi hiển thị', () => {
    render(<Harness money />);

    fireEvent.change(input(), { target: { value: '1000000' } });
    expect(input().value).toBe('1.000.000');
  });

  it('KHÔNG quy đổi đơn vị: nhập 350000 thì payload vẫn là 350000', async () => {
    const onValues = vi.fn();
    render(<Harness money onValues={onValues} />);

    fireEvent.change(input(), { target: { value: '350000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await vi.waitFor(() => expect(onValues).toHaveBeenCalled());
    expect(onValues.mock.calls[0]![0].amount).toBe(350000);
  });

  it('gõ kèm dấu phân nhóm vẫn ra đúng số — KHÔNG bị parseFloat cắt ở dấu chấm đầu', async () => {
    // `parseFloat('1.000.000')` trả về 1. Đây là ca hỏng mà parser chỉ-giữ-chữ-số phải chặn.
    const onValues = vi.fn();
    render(<Harness money onValues={onValues} />);

    fireEvent.change(input(), { target: { value: '1.000.000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await vi.waitFor(() => expect(onValues).toHaveBeenCalled());
    expect(onValues.mock.calls[0]![0].amount).toBe(1000000);
  });

  it('xoá hết thì giá trị là null, không phải 0', async () => {
    const onValues = vi.fn();
    render(<Harness money onValues={onValues} />);

    fireEvent.change(input(), { target: { value: '5000' } });
    fireEvent.change(input(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await vi.waitFor(() => expect(onValues).toHaveBeenCalled());
    expect(onValues.mock.calls[0]![0].amount).toBeNull();
  });

  it('số tiền lớn không mất chữ số', () => {
    render(<Harness money />);

    fireEvent.change(input(), { target: { value: '999999999999' } });
    expect(input().value).toBe('999.999.999.999');
  });
});

describe('NumberField — phần trăm', () => {
  it('hiện hậu tố %', () => {
    render(<Harness percent />);

    expect(screen.getByText('%')).toBeTruthy();
  });

  it('kẹp mặc định 0–100', () => {
    render(<Harness percent />);

    expect(input().getAttribute('aria-valuemin')).toBe('0');
    expect(input().getAttribute('aria-valuemax')).toBe('100');
  });

  it('feature vẫn ghi đè được min/max', () => {
    render(<Harness percent min={5} max={50} />);

    expect(input().getAttribute('aria-valuemin')).toBe('5');
    expect(input().getAttribute('aria-valuemax')).toBe('50');
  });

  it('giá trị là SỐ PHẦN TRĂM (12), không phải tỉ lệ 0–1', async () => {
    const onValues = vi.fn();
    render(<Harness percent onValues={onValues} />);

    fireEvent.change(input(), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await vi.waitFor(() => expect(onValues).toHaveBeenCalled());
    expect(onValues.mock.calls[0]![0].amount).toBe(12);
  });

  it('phần trăm KHÔNG dùng bộ nhóm nghìn của tiền', () => {
    render(<Harness percent />);

    fireEvent.change(input(), { target: { value: '100' } });
    expect(input().value).toBe('100');
  });
});

describe('NumberField — precision', () => {
  it('tiền mặc định 0 chữ số thập phân', () => {
    render(<Harness money />);

    fireEvent.change(input(), { target: { value: '1000' } });
    fireEvent.blur(input());
    expect(input().value).not.toContain(',');
  });

  it('precision truyền tay được cho số thường', async () => {
    const onValues = vi.fn();
    render(<Harness precision={2} onValues={onValues} />);

    fireEvent.change(input(), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await vi.waitFor(() => expect(onValues).toHaveBeenCalled());
    expect(onValues.mock.calls[0]![0].amount).toBe(1.5);
  });
});

describe('NumberField — tương thích ngược', () => {
  it('addonAfter tuỳ ý vẫn thắng hậu tố mặc định', () => {
    render(<Harness money addonAfter="VNĐ" />);

    expect(screen.getByText('VNĐ')).toBeTruthy();
    expect(screen.queryByText('₫')).toBeNull();
  });
});
