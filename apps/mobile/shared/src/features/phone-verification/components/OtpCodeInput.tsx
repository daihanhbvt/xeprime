import { useRef, useState, type RefObject } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { useRevealOnFocus } from '@/components/layout/focus-reveal';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useColors } from '@/theme/ThemeProvider';
import { FONT_FAMILY } from '@/theme/fonts';
import { fontSize, fontWeight, radius, sizing, space, typeScale } from '@/theme/tokens';

export const OTP_LENGTH = 6;

const styles = StyleSheet.create({
  stretch: { alignSelf: 'stretch' },
  /* Ô nhập THẬT nằm trong suốt phủ trọn hàng — sáu ô kia chỉ là hình vẽ của giá trị. */
  hiddenInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },
});

/** Cao hơn sàn chạm rõ rệt: ô mã là trọng tâm của bước này, không phải một ô nhập phụ. */
const OTP_BOX_HEIGHT = sizing.touchTarget + space.md;

/** Figma "_Input" (`24131:70052`…`70057`): ô vuông 48, cách nhau 12, cả hàng canh giữa. */
const V2_BOX = 48;
const V2_GAP = 12;
/** Ô CHƯA gõ của bản vẽ hiện một gạch ngắn mờ - chỉ là hình, trình đọc màn hình đọc nhãn của ô thật. */
const V2_EMPTY = '-';

interface OtpCodeInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Gọi khi vừa đủ 6 số — để không bắt người dùng bấm thêm nút sau khi đã gõ xong. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Ref của ô nhập thật — để nơi gọi chuyển focus sang ô mã (vd. phím gửi của ô SĐT). */
  inputRef?: RefObject<TextInput | null>;
  /**
   * `v2` = sáu ô của Figma Partner (tấm đổi SĐT `24231:109668`): ô trắng viền xám, ô đang chờ gõ nền
   * vàng nhạt viền vàng, ô trống hiện "-". `default` giữ kiểu cũ cho các màn chưa ghép Figma.
   */
  look?: 'default' | 'v2';
  /** Chỉ `v2`: viền đỏ cả hàng khi mã vừa bị từ chối. */
  invalid?: boolean;
}

export function OtpCodeInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false,
  inputRef: externalRef,
  look = 'default',
  invalid = false,
}: OtpCodeInputProps) {
  const colors = useColors();
  const ownRef = useRef<TextInput>(null);
  const inputRef = externalRef ?? ownRef;
  /*
   * Ô nhập thật bị ẩn sau dải sáu viên, nên NHÃN KHẢ TRUY CẬP là thứ duy nhất trình đọc màn hình
   * đọc ra. "OTP" gõ cứng vừa là chữ thô (CLAUDE.md §5) vừa không nói ra mã dài mấy — dùng đúng
   * khoá web dùng cho ô tương ứng.
   */
  const t = useTranslations('Auth.otp');
  const revealOnFocus = useRevealOnFocus();
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
    /*
      `alignSelf: 'stretch'` nằm ở ĐÂY, không phải ở nơi gọi.

      Sáu ô con chia đều bằng `f={1}`, nên chúng chỉ có bề rộng khi hàng có bề rộng. Đặt control
      này vào một cột canh giữa (`YStack ai="center"` — đúng bố cục của bước xác thực trong
      luồng thuê xe) thì trục ngang KHÔNG kéo giãn: hàng co về đúng bề rộng nội dung, mà nội dung
      lúc chưa gõ là sáu chuỗi RỖNG. Kết quả là sáu ô bẹp dí — đó là cái "vỡ" nhìn thấy trên màn.

      Sửa ở component thay vì bắt mỗi nơi gọi nhớ bọc thêm một `YStack alignSelf="stretch"`: một
      hàng sáu ô mã thì không có ngữ cảnh nào muốn nó hẹp hơn dòng.
    */
    <Pressable
      onPress={() => inputRef.current?.focus()}
      disabled={disabled}
      accessibilityRole="none"
      style={styles.stretch}
    >
      {look === 'v2' ? (
        <XStack gap={V2_GAP} jc="center">
          {digits.map((digit, index) => {
            const active = focused && index === activeIndex && !disabled;
            return (
              <XStack
                key={index}
                w={V2_BOX}
                h={V2_BOX}
                ai="center"
                jc="center"
                br={radius.control}
                bw={1}
                bg={active ? colors.brandWash : colors.surface}
                bc={invalid ? colors.danger : active ? colors.brandBorderStrong : colors.borderInput}
              >
                <Text
                  col={digit ? (active ? colors.brandShape : colors.text) : colors.textPlaceholder}
                  fos={typeScale.title.fontSize}
                  lh={typeScale.title.lineHeight}
                  fontFamily={FONT_FAMILY.medium}
                  fow={fontWeight.medium}
                >
                  {digit || V2_EMPTY}
                </Text>
              </XStack>
            );
          })}
        </XStack>
      ) : (
        <XStack gap={space.sm}>
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
      )}

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => {
          setFocused(true);
          revealOnFocus();
        }}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        caretHidden
        accessibilityLabel={t('codeAria')}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}
