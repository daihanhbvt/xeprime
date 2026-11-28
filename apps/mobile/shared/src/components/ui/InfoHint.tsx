import { LineIcon } from '@/components/icons/LineIcon';
import { Ionicons } from '@/components/icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, YStack, type TextProps } from 'tamagui';
import { BottomSheet } from './BottomSheet';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';

/**
 * Dấu "i" mở một lời giải thích BỔ SUNG — bản native của `InfoHint` bên web.
 *
 * Web dùng tooltip vì ở đó có hover và focus; trên điện thoại không có cả hai, nên hình thái
 * đúng là một TẤM TRƯỢT: chạm để mở, chạm ra ngoài để đóng. Một tooltip bám ngón tay sẽ bị chính
 * ngón tay che, và trên màn 390px nó tràn mép.
 *
 * `accessibilityRole="button"` + `accessibilityLabel` cho trình đọc màn hình một nút thật với
 * tên thật; nội dung nằm trong tấm trượt và được đọc khi tấm mở, đúng như mọi tấm trượt khác.
 * Vùng chạm nới bằng `hitSlop` — một icon 16px là mục tiêu quá nhỏ so với ngưỡng 44px.
 *
 * KHÔNG dùng nó để giấu thông tin bắt buộc. Số tiền, hạn thanh toán và hệ quả khi hết hạn phải
 * đọc được mà không cần chạm gì.
 */
export function InfoHint({
  content,
  label,
  size = fontSize.body,
  lineIcon,
}: {
  /** Chuỗi ⇒ một đoạn chữ; ReactNode ⇒ nơi gọi tự dựng (nhiều đoạn, kèm liên kết) như web. */
  content: ReactNode;
  label: string;
  /** Cỡ dấu "i" — BẰNG cỡ chữ của nhãn đứng cạnh (mặc định cỡ chữ thân bài). */
  size?: number;
  /** Icon nét của bộ `LineIcon` thay dấu "i" Ionicons - khi Figma vẽ đúng glyph đó (màu `text/gray/very-low`). */
  lineIcon?: 'info-circle-16';
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <InfoHintButton
        label={label}
        size={size}
        {...(lineIcon ? { lineIcon } : {})}
        onPress={() => setOpen(true)}
      />
      <InfoHintSheet open={open} onClose={() => setOpen(false)} label={label} content={content} />
    </>
  );
}

/**
 * Riêng NÚT "i" của `InfoHint` - để đặt nó LỒNG trong một `Text` (nhãn dài xuống dòng thì dấu "i"
 * vẫn đứng sát chữ cuối, như `FieldLabel`). Tấm trượt (`InfoHintSheet`) phải nằm NGOÀI `Text`.
 */
export function InfoHintButton({
  label,
  size = fontSize.body,
  lineIcon,
  onPress,
  inline = false,
}: {
  label: string;
  size?: number;
  lineIcon?: 'info-circle-16';
  onPress: () => void;
  /**
   * Nút nằm LỒNG trong một `Text`: RN đặt đáy view lồng lên ĐƯỜNG CHÂN chữ nên dấu "i" nổi cao hơn
   * dòng - hạ xuống đúng phần chân chữ để nó cân giữa dòng như khi đứng cạnh nhãn.
   */
  inline?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      {...(inline ? { style: { transform: [{ translateY: Math.round(size * INLINE_DESCENT) }] } } : {})}
    >
      {lineIcon ? (
        <LineIcon name={lineIcon} color={colors.textPlaceholder} />
      ) : (
        <Ionicons name="information-circle-outline" size={size} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

/** Tấm giải thích của `InfoHint` - chỉ dựng khi ĐÃ mở (năm dấu "i" không mang năm `Modal` ngủ đông). */
export function InfoHintSheet({
  open,
  onClose,
  label,
  content,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  content: ReactNode;
}) {
  const colors = useColors();
  if (!open) return null;
  return (
    <BottomSheet open onClose={onClose} title={label}>
      <YStack pb={space.md} gap={space.sm}>
        {typeof content === 'string' ? (
          <Text col={colors.text} fos={fontSize.body}>
            {content}
          </Text>
        ) : (
          content
        )}
      </YStack>
    </BottomSheet>
  );
}

/**
 * Một dòng CHỮ kèm dấu ⓘ LỒNG ngay sau chữ cuối (người dùng 28/11/2026): chữ dài xuống dòng thì ⓘ
 * vẫn bám chữ "…tài xế ⓘ" và cân giữa dòng, không bị đẩy ra mép phải hay lệch khỏi dòng chữ như
 * khi đặt `Text` + `InfoHint` cạnh nhau trong một `XStack`. Mọi prop khác đi thẳng vào `Text`.
 */
export function TextWithHint({
  hint,
  hintLabel,
  hintSize,
  children,
  ...textProps
}: TextProps & {
  /** Nội dung tấm giải thích; vắng ⇒ chỉ là `Text`. */
  hint?: ReactNode;
  /** Tên nút ⓘ + tiêu đề tấm. */
  hintLabel: string;
  /** Cỡ ⓘ - mặc định BẰNG cỡ chữ (`fos`). */
  hintSize?: number;
}) {
  const [open, setOpen] = useState(false);
  const size = hintSize ?? (typeof textProps.fos === 'number' ? textProps.fos : fontSize.body);
  if (hint == null || hint === false || hint === '') return <Text {...textProps}>{children}</Text>;
  return (
    <>
      <Text {...textProps}>
        {children}{' '}
        <InfoHintButton inline label={hintLabel} size={size} onPress={() => setOpen(true)} />
      </Text>
      {/* Tấm trượt (Modal) nằm NGOÀI `Text`. */}
      <InfoHintSheet open={open} onClose={() => setOpen(false)} label={hintLabel} content={hint} />
    </>
  );
}

/** Phần chân chữ (descender) so với cỡ chữ - độ hạ của dấu "i" lồng trong dòng. */
const INLINE_DESCENT = 0.12;
