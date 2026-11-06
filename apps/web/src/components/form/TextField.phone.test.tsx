import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';

import { TextField } from './TextField';

afterEach(cleanup);

interface Values {
  phone: string;
}

/** ADR 0082 — ô `type="tel"` chỉ giữ chữ số và một `+` đầu, lúc gõ lẫn lúc dán. */
function Harness({ type }: { type?: 'tel' | 'text' }) {
  const { control } = useForm<Values>({ defaultValues: { phone: '' } });
  return <TextField control={control} name="phone" label="Số điện thoại" type={type} />;
}

function input(): HTMLInputElement {
  return screen.getByLabelText('Số điện thoại') as HTMLInputElement;
}

describe('TextField type="tel" — tự lọc ký tự (ADR 0082)', () => {
  it.each([
    ['099 222 2222', '0992222222'],
    ['099.222.2222', '0992222222'],
    ['099-222-2222', '0992222222'],
    ['(099) 222 2222', '0992222222'],
    ['+84 99 222 2222', '+84992222222'],
    ['09a9b', '099'],
    ['84+99', '8499'],
  ])('nhập %j → ô hiện %j', (raw, expected) => {
    render(<Harness type="tel" />);
    fireEvent.change(input(), { target: { value: raw } });
    expect(input().value).toBe(expected);
  });

  it('ô thường (không phải tel) giữ nguyên chữ người dùng gõ', () => {
    render(<Harness type="text" />);
    fireEvent.change(input(), { target: { value: '099 222 2222' } });
    expect(input().value).toBe('099 222 2222');
  });

  it('bàn phím số trên điện thoại', () => {
    render(<Harness type="tel" />);
    expect(input().getAttribute('inputmode')).toBe('tel');
  });
});
