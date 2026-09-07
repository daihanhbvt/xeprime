import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, XStack } from 'tamagui';
import { colors, fieldFontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';

export function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
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
  const active = invalid ? colors.danger : colors.primary;

  /*
   * Nền TRẮNG + viền thấy được — không phải một mảng xám.
   *
   * Bản đầu tô `surfaceMuted` cho cả ô. Trên một form dài, mười mảng xám xếp dọc làm cả màn
   * thành một khối xám điệp: mắt không tách được đâu là ô nhập, đâu là nền, và không ô nào nổi
   * lên khi được chọn. Nền trắng đẩy chữ người dùng gõ lên trước, còn ranh giới ô do VIỀN vẽ —
   * đúng cách `<Input>` của AntD làm bên web, nên hai bên cũng đọc giống nhau.
   *
   * Viền lúc nghỉ dùng `borderInput` chứ không `border`: `border` là tông cho đường chia giữa
   * hai khối, nhạt hơn hẳn, và một ô nhập viền bằng nó trông như chưa vẽ xong.
   *
   * Ba trạng thái đọc được bằng MÀU VIỀN, không bằng độ dày: đổi `borderWidth` khi focus làm
   * nội dung nhảy 1px mỗi lần chạm vào ô.
   */
  return (
    <XStack
      ai={align}
      gap={space.sm}
      bg={disabled ? colors.surfaceMuted : colors.surface}
      br={radius.md}
      bw={1}
      bc={disabled ? colors.border : focused || invalid ? active : colors.borderInput}
      px={space.sm}
      minHeight={sizing.touchTarget}
      {...(onPress ? { onPress } : {})}
      {...(accessibilityRole ? { accessibilityRole } : {})}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    >
      {children}
    </XStack>
  );
}
