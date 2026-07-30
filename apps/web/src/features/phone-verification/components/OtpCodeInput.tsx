'use client';

import { Input, type InputRef } from 'antd';
import { useEffect, useRef } from 'react';

const OTP_LEN = 6;

interface OtpCodeInputProps {
  value: string;
  onChange: (code: string) => void;
  /** Gọi khi đủ 6 số — để tự submit. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * Ô nhập mã OTP 6 số dùng chung (đặt xe + đăng nhập SĐT). Chỉ nhận chữ số, hỗ trợ dán mã,
 * gợi ý bàn phím số (`inputMode`) + tự điền mã một lần (`autocomplete=one-time-code`), và tự
 * submit khi đủ 6 số. Không xoá dữ liệu bước trước — chỉ quản lý ô mã.
 */
export function OtpCodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
}: OtpCodeInputProps) {
  const ref = useRef<InputRef>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  function handle(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, OTP_LEN);
    onChange(digits);
    if (digits.length === OTP_LEN) onComplete?.(digits);
  }

  return (
    <Input
      ref={ref}
      value={value}
      size="large"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={OTP_LEN}
      placeholder="Nhập mã 6 số"
      disabled={disabled}
      aria-label="Mã xác thực gồm 6 số"
      onChange={(e) => handle(e.target.value)}
    />
  );
}
