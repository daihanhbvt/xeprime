'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { OTP_POLICY } from '@xeprime/types';
import { cx } from '@/lib/cx';
import styles from './OtpDigitBoxes.module.css';

const OTP_LEN = OTP_POLICY.CODE_LENGTH;
const SLOTS = Array.from({ length: OTP_LEN }, (_, i) => i);

interface OtpDigitBoxesProps {
  value: string;
  onChange: (code: string) => void;
  /** Gọi khi đủ 6 số — để tự gửi. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  /**
   * Đang gửi mã đi: KHOÁ GÕ nhưng GIỮ focus. Dùng thay `disabled` lúc chờ server — `disabled` làm
   * ô mất focus, bàn phím điện thoại sập và trình đọc màn hình mất chỗ ngay khi báo mã sai.
   */
  readOnly?: boolean;
  autoFocus?: boolean;
  /** Mã vừa bị từ chối — viền đỏ cả hàng. */
  invalid?: boolean;
  /** `id` của câu lỗi/gợi ý bên dưới, để trình đọc màn hình đọc kèm. */
  describedBy?: string;
  /** Cho nơi gọi focus lại ô mã (vd bấm nút gửi khi mã chưa đủ 6 số). */
  inputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Ô mã OTP SÁU Ô của design v2 (popup "Xác minh tài khoản", bước "Nhập mã OTP" của quên mật khẩu).
 *
 * Sáu ô chỉ là phần NHÌN. Bên dưới là MỘT `<input>` thật trải kín hàng ô, trong suốt:
 *  - dán cả mã, gợi ý mã SMS của bàn phím (`autocomplete="one-time-code"`), xoá lùi… đều là hành
 *    vi gốc của một ô nhập, không phải sáu ô tự chuyền focus cho nhau;
 *  - trình đọc màn hình gặp đúng một trường có tên, không phải sáu ô rời không nhãn.
 * Con trỏ luôn ở CUỐI chuỗi — không có chuyện sửa chữ số giữa chừng mà mắt không thấy.
 *
 * Ô đang nhập (ô chứa con trỏ, đúng như bản vẽ: số vừa gõ kèm vạch nháy) nền vàng nhạt, viền vàng.
 * Cùng hợp đồng props với `OtpCodeInput` (ô một dòng của site partner).
 */
export function OtpDigitBoxes({
  value,
  onChange,
  onComplete,
  disabled,
  readOnly,
  autoFocus,
  invalid,
  describedBy,
  inputRef,
}: OtpDigitBoxesProps) {
  const t = useTranslations('Auth.otp');
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus, ref]);

  function handle(raw: string) {
    if (readOnly) return;
    const digits = raw.replace(/\D/g, '').slice(0, OTP_LEN);
    onChange(digits);
    if (digits.length === OTP_LEN) onComplete?.(digits);
  }

  /** Giữ con trỏ ở cuối — bấm vào ô thứ hai không được đặt con trỏ vào giữa mã. */
  function caretToEnd() {
    const input = ref.current;
    if (!input) return;
    const end = input.value.length;
    if (input.selectionStart !== end || input.selectionEnd !== end) {
      input.setSelectionRange(end, end);
    }
  }

  const active = Math.max(0, Math.min(value.length, OTP_LEN) - 1);

  return (
    <div className={cx(styles.row, invalid && styles.invalid, disabled && styles.disabled)}>
      <input
        ref={ref}
        className={styles.input}
        value={value}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        // Không đặt `maxLength`: dán "123 456" / "123-456" phải giữ đủ 6 số — độ dài đã cắt ở `handle`.
        disabled={disabled}
        readOnly={readOnly}
        aria-busy={readOnly || undefined}
        aria-label={t('codeAria')}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => handle(e.target.value)}
        onFocus={() => {
          setFocused(true);
          caretToEnd();
        }}
        onBlur={() => setFocused(false)}
        onSelect={caretToEnd}
      />
      {SLOTS.map((i) => {
        const digit = value[i];
        const isActive = focused && i === active;
        return (
          <span
            key={i}
            className={cx(styles.box, digit && styles.filled, isActive && styles.active)}
            aria-hidden="true"
          >
            {digit ?? (isActive ? '' : '-')}
            {isActive ? <span className={styles.caret} /> : null}
          </span>
        );
      })}
    </div>
  );
}
