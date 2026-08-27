import { useRef, useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import { Text, XStack } from 'tamagui';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';

export const OTP_LENGTH = 6;

/** Cao hơn sàn chạm rõ rệt: ô mã là trọng tâm của bước này, không phải một ô nhập phụ. */
const OTP_BOX_HEIGHT = sizing.touchTarget + 16;

interface OtpCodeInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Gọi khi vừa đủ 6 số — để không bắt người dùng bấm thêm nút sau khi đã gõ xong. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function OtpCodeInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false,
}: OtpCodeInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const digits = [...Array<undefined>(OTP_LENGTH)].map((_, i) => value[i] ?? '');
  // Ô "đang chờ gõ" là ô ngay sau ký tự cuối; gõ đủ 6 thì không còn ô nào sáng.
  const activeIndex = Math.min(value.length, OTP_LENGTH - 1);

  function handleChange(raw: string) {
    // Bàn phím số vẫn gửi được dấu cách/gạch khi dán từ tin nhắn ("Ma OTP: 123-456").
    const next = raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (next === value) return;
    onChange(next);
    if (next.length === OTP_LENGTH) onComplete?.(next);
  }

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      disabled={disabled}
      accessibilityRole="none"
    >
      <XStack gap={space.sm} jc="space-between">
        {digits.map((digit, index) => (
          <XStack
            key={index}
            f={1}
            ai="center"
            jc="center"
            minHeight={OTP_BOX_HEIGHT}
            bg={colors.surfaceMuted}
            br={radius.sm}
            bw={1}
            bc={focused && index === activeIndex ? colors.primary : 'transparent'}
          >
            <Text
              col={disabled ? colors.textMuted : colors.text}
              fos={fontSize.h2}
              fow={fontWeight.bold}
            >
              {digit}
            </Text>
          </XStack>
        ))}
      </XStack>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        caretHidden
        accessibilityLabel="OTP"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0,
        }}
      />
    </Pressable>
  );
}
