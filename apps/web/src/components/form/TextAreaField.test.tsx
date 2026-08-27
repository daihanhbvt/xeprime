import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TextAreaField } from './TextAreaField';

afterEach(cleanup);

interface Values {
  note: string;
}

function Harness({
  onValues,
  ...props
}: { onValues?: (values: Values) => void } & Partial<Parameters<typeof TextAreaField<Values>>[0]>) {
  const { control, handleSubmit } = useForm<Values>({ defaultValues: { note: '' } });
  return (
    <form onSubmit={handleSubmit((values) => onValues?.(values))}>
      <TextAreaField control={control} name="note" label="Ghi chú" {...props} />
      <button type="submit">Gửi</button>
    </form>
  );
}

function area(): HTMLTextAreaElement {
  return screen.getByLabelText('Ghi chú') as HTMLTextAreaElement;
}

describe('TextAreaField — khả truy cập', () => {
  it('nhãn nối vào ô nhập (vá nợ D14.4)', () => {
    render(<Harness />);

    expect(area()).toBeTruthy();
    expect(area().tagName).toBe('TEXTAREA');
  });

  it('gợi ý được nối bằng aria-describedby', () => {
    render(<Harness help="Tối đa 4000 ký tự." />);

    const describedBy = area().getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe('Tối đa 4000 ký tự.');
  });

  it('không có gợi ý thì không gắn aria-describedby trỏ vào hư không', () => {
    render(<Harness />);

    expect(area().getAttribute('aria-describedby')).toBeNull();
  });
});

describe('TextAreaField — bộ đếm ký tự', () => {
  it('maxLength bật bộ đếm', () => {
    render(<Harness maxLength={100} />);

    expect(screen.getByText('0 / 100')).toBeTruthy();
  });

  it('bộ đếm chạy theo số ký tự đã gõ', () => {
    render(<Harness maxLength={100} />);

    fireEvent.change(area(), { target: { value: 'xin chào' } });
    expect(screen.getByText('8 / 100')).toBeTruthy();
  });

  it('không có maxLength thì không có bộ đếm', () => {
    render(<Harness />);

    expect(screen.queryByText(/\/ \d+/)).toBeNull();
  });

  it('tắt bộ đếm được dù vẫn giới hạn độ dài', () => {
    render(<Harness maxLength={100} showCount={false} />);

    expect(screen.queryByText('0 / 100')).toBeNull();
    expect(area().getAttribute('maxlength')).toBe('100');
  });

  it('bật bộ đếm được dù không giới hạn độ dài', () => {
    render(<Harness showCount />);

    expect(screen.getByText('0')).toBeTruthy();
  });

  it('maxLength chặn ở tầng ô nhập', () => {
    render(<Harness maxLength={5} />);

    expect(area().getAttribute('maxlength')).toBe('5');
  });
});

describe('TextAreaField — không tự validate', () => {
  it('giá trị đi thẳng vào payload, không bị cắt/biến đổi', async () => {
    const onValues = vi.fn();
    render(<Harness onValues={onValues} />);

    fireEvent.change(area(), { target: { value: '  còn khoảng trắng hai đầu  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await vi.waitFor(() => expect(onValues).toHaveBeenCalled());
    // Không tự trim: chuẩn hoá là việc của schema Yup ở feature, không phải của field.
    expect(onValues.mock.calls[0]![0].note).toBe('  còn khoảng trắng hai đầu  ');
  });

  it('null từ backend hiện thành chuỗi rỗng, không phải chữ "null"', () => {
    function NullHarness() {
      const { control } = useForm<Values>({
        defaultValues: { note: null as unknown as string },
      });
      return <TextAreaField control={control} name="note" label="Ghi chú" />;
    }
    render(<NullHarness />);

    expect(area().value).toBe('');
  });
});
