import { Ionicons } from '@/components/icons/Ionicons';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, XStack } from 'tamagui';
import { useFieldFeedback } from '@/components/motion/use-field-feedback';
import { useTranslations } from 'use-intl';
import { InfoHint } from './InfoHint';
import { useColors } from '@/theme/ThemeProvider';
import { fieldFontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';

/** Gợi ý dài hơn mức này thì gọn vào dấu ⓘ. */
const HINT_INLINE_MAX = 60;

export function FieldLabel({
  label,
  required = false,
  publishRequired = false,
}: {
  label: string;
  required?: boolean;
  /**
   * Dấu `●` "cần bổ sung trước khi gửi duyệt công khai" — KHÁC hẳn `*` bắt buộc-để-lưu.
   *
   * Hai giai đoạn, hai dấu (`PublishRequiredMark` bên web): xe lưu được vào kho nội bộ mà chưa
   * có biển số hay ảnh đại diện, nhưng không lên chợ được nếu thiếu. Gộp chúng thành một `*` đỏ
   * là nói dối ở cả hai chiều — chặn người dùng lưu một bản nháp, hoặc để họ bấm gửi duyệt rồi
   * mới biết thiếu.
   *
   * Dấu tự nó không mang nghĩa với trình đọc màn hình nên phần chữ đi kèm mới là thứ đọc được.
   */
  publishRequired?: boolean;
}) {
  const colors = useColors();
  const tMark = useTranslations('Vehicles.completeness');

  /*
    Nhãn dùng màu CHỮ CHÍNH, không phải `textMuted`.

    Nhãn, chữ gợi ý và chữ trong ô mà cùng một tông mờ thì ba loại nội dung khác hẳn nhau đọc ra
    như một khối. Nhãn là thứ được quét đầu tiên khi dò form nên nó phải đậm nhất trong ba; chữ
    gợi ý ở `FieldMessage` mới là phần được phép mờ.
  */
  return (
    <Text col={colors.text} fos={fieldFontSize.label} fow={fontWeight.semibold}>
      {label}
      {required ? <Text col={colors.danger}> *</Text> : null}
      {publishRequired ? (
        <Text col={colors.warning} accessibilityLabel={tMark('publishRequiredSr')}>
          {' ●'}
        </Text>
      ) : null}
    </Text>
  );
}

export function FieldMessage({
  error,
  hint,
}: {
  error?: string | undefined;
  hint?: string | undefined;
}) {
  const colors = useColors();
  const tLabels = useTranslations('Common.labels');
  if (error) {
    return (
      <XStack ai="center" gap={space.xs}>
        <Ionicons name="alert-circle" size={iconSize.xs} color={colors.danger} />
        <Text f={1} col={colors.danger} fos={fieldFontSize.message}>
          {error}
        </Text>
      </XStack>
    );
  }
  if (hint) {
    // Gợi ý DÀI không chiếm chỗ dưới ô: gọn thành dấu ⓘ + "Ghi chú", chạm mở tấm trượt đọc đủ
    // (người dùng 17/11/2026). Gợi ý ngắn vẫn hiện thẳng.
    if (hint.length > HINT_INLINE_MAX) {
      return (
        <XStack ai="center" gap={space.xs}>
          <InfoHint content={hint} label={tLabels('note')} size={iconSize.sm} />
          <Text col={colors.textMuted} fos={fieldFontSize.message}>
            {tLabels('note')}
          </Text>
        </XStack>
      );
    }
    return (
      <Text col={colors.textMuted} fos={fieldFontSize.message}>
        {hint}
      </Text>
    );
  }
  return null;
}

export function FieldShell({
  children,
  focused = false,
  invalid = false,
  disabled = false,
  align = 'center',
  onPress,
  accessibilityRole,
  accessibilityLabel,
}: {
  children: ReactNode;
  focused?: boolean;
  invalid?: boolean;
  /**
   * Ô chỉ đọc — nền xám, viền nhạt.
   *
   * `editable={false}` của React Native chỉ CHẶN gõ chứ không đổi hình: ô khoá trông y hệt ô
   * nhập được, và người dùng chạm vào rồi tưởng bàn phím hỏng. Web có `disabled` của AntD lo
   * phần này; ở đây phải tự vẽ.
   */
  disabled?: boolean;
  align?: 'center' | 'flex-start';
  onPress?: () => void;
  accessibilityRole?: 'button';
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const active = invalid ? colors.danger : colors.primary;
  // Lắc khi vừa lỗi + viền đổi màu mượt: lớp viền phủ animate màu, khung trong giữ viền nghỉ.
  const feedback = useFieldFeedback({
    invalid,
    highlighted: focused || invalid,
    restColor: colors.border,
    activeColor: active,
  });

  /*
   * Nền TRẮNG + viền thấy được — không phải một mảng xám.
   *
   * Bản đầu tô `surfaceMuted` cho cả ô. Trên một form dài, mười mảng xám xếp dọc làm cả màn
   * thành một khối xám điệp: mắt không tách được đâu là ô nhập, đâu là nền, và không ô nào nổi
   * lên khi được chọn. Nền trắng đẩy chữ người dùng gõ lên trước, còn ranh giới ô do VIỀN vẽ —
   * đúng cách `<Input>` của AntD làm bên web, nên hai bên cũng đọc giống nhau.
   *
   * Viền lúc nghỉ = `border` (`color-border` #e9eaeb) — đúng `colorBorder` mà theme AntD của web
   * (`apps/web/src/styles/theme.ts`) đặt cho `<Input>`/`<Select>`; bo `radius.md` = `borderRadius`
   * của AntD. Người dùng chốt 27/10/2026 đổi từ `borderInput` (đậm hơn) về đúng web.
   *
   * Ba trạng thái đọc được bằng MÀU VIỀN, không bằng độ dày: đổi `borderWidth` khi focus làm
   * nội dung nhảy 1px mỗi lần chạm vào ô.
   */
  return (
    <Animated.View style={feedback.shake}>
    <XStack
      ai={align}
      gap={space.sm}
      bg={disabled ? colors.surfaceMuted : colors.surface}
      br={radius.md}
      bw={1}
      bc={colors.border}
      px={space.sm}
      minHeight={sizing.touchTarget}
      {...(onPress ? { onPress } : {})}
      {...(accessibilityRole ? { accessibilityRole } : {})}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    >
      {children}
    </XStack>
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderWidth: 1, borderRadius: radius.md }, feedback.border]}
    />
    </Animated.View>
  );
}
