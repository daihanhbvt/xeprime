import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fieldFontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';
import type { IconName } from './Chip';

/**
 * Đường kính vòng chọn, và cạnh của chấm bên trong.
 *
 * 20 là cỡ mà vòng còn đọc được ở khoảng cách cầm điện thoại mà không tranh chỗ với nhãn — vùng
 * chạm là cả HÀNG, không phải riêng cái vòng, nên vòng không cần to bằng ngón tay.
 */
const RING = 20;
const DOT = 10;

/** Ô hình vuông bo góc — đủ to để hình đọc được, đủ nhỏ để không tranh chỗ với nhãn. */
const ICON_BOX = 32;
const ICON_SIZE = 18;

const styles = StyleSheet.create({
  /** Hàng phải kéo hết bề ngang: nhãn dài xuống dòng trong khung của nó, không co lại quanh chữ. */
  stretch: { alignSelf: 'stretch' },
});

/**
 * Một dòng lựa chọn loại trừ nhau — nhãn ĐẦY ĐỦ, xuống dòng thoải mái.
 *
 * **Đúng 2 lựa chọn thì radio; từ 3 trở lên thì menu** (`SelectField` / `SelectControl`): hai lựa
 * chọn bày hết chỉ tốn hai dòng và người dùng đọc được cả hai vế trước khi quyết định, còn từ ba
 * trở lên thì bày hết bắt đầu ăn hết màn hình.
 *
 * Không phải `Chip` vì chip cắt nhãn ở một dòng — với nhãn là cả một câu, phần bị cắt chính là
 * phần giải thích.
 */
/**
 * Vỏ chung của một dòng lựa chọn — khung, viền, nền, vùng chạm, chỗ đặt nhãn.
 *
 * Radio và checkbox chỉ khác nhau ở CÁI DẤU bên trái. Để mỗi loại tự vẽ khung thì hai loại
 * nằm cạnh nhau trong cùng một form sẽ lệch đệm, lệch bo góc, lệch màu khi chọn — và người
 * dùng đọc ra là hai thành phần khác nhau chứ không phải hai kiểu chọn.
 */
function OptionShell({
  label,
  hint,
  checked,
  disabled,
  icon,
  role,
  indicator,
  onPress,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled: boolean;
  icon?: IconName;
  role: 'radio' | 'checkbox';
  indicator: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityState={{ checked, disabled }}
      style={styles.stretch}
    >
      <XStack
        ai="center"
        gap={space.sm}
        px={space.md}
        py={space.sm}
        minHeight={sizing.touchTarget}
        bw={1}
        br={radius.md}
        bg={checked ? colors.surfaceSelected : colors.surface}
        bc={checked ? colors.primary : colors.border}
        opacity={disabled ? 0.5 : 1}
      >
        {indicator}

        {/*
          Ô biểu tượng đứng GIỮA dấu chọn và nhãn.

          Nền là màu thương hiệu ĐẶC với hình trắng, không phải vàng nhạt: cả hàng đã nằm trên
          nền trắng và viền nhạt, thêm một mảng vàng nhạt nữa thì ô hình chìm mất và không còn
          làm được việc của nó — giúp phân biệt bốn lựa chọn bằng HÌNH thay vì phải đọc chữ.
        */}
        {icon ? (
          <XStack
            width={ICON_BOX}
            height={ICON_BOX}
            ai="center"
            jc="center"
            br={radius.sm}
            bg={colors.primary}
          >
            <Ionicons name={icon} size={ICON_SIZE} color={colors.onPrimary} />
          </XStack>
        ) : null}

        {/* `f={1}` để nhãn dài xuống dòng thay vì đẩy dấu chọn ra khỏi khung. */}
        <YStack f={1} gap={2}>
          <Text col={colors.text} fos={fieldFontSize.value} fow={fontWeight.medium}>
            {label}
          </Text>
          {hint ? (
            <Text col={colors.textMuted} fos={fieldFontSize.message}>
              {hint}
            </Text>
          ) : null}
        </YStack>
      </XStack>
    </Pressable>
  );
}

/**
 * Một dòng lựa chọn CHỌN NHIỀU — cùng khung với `RadioOption`, khác đúng cái dấu.
 *
 * Dấu VUÔNG chứ không tròn: hình phải nói được chọn được mấy cái. Một hàng ô tròn mà bấm hai
 * cái cùng sáng là hình nói dối, và người dùng sẽ bấm lại vì tưởng mình chọn nhầm.
 */
export function CheckOption({
  label,
  hint,
  checked,
  disabled = false,
  onPress,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <OptionShell
      label={label}
      {...(hint === undefined ? {} : { hint })}
      checked={checked}
      disabled={disabled}
      role="checkbox"
      onPress={onPress}
      indicator={
        <XStack
          width={RING}
          height={RING}
          ai="center"
          jc="center"
          br={radius.sm}
          bw={1}
          bc={checked ? colors.primary : colors.borderInput}
          bg={checked ? colors.primary : colors.surface}
        >
          {checked ? <Ionicons name="checkmark" size={TICK} color={colors.onPrimary} /> : null}
        </XStack>
      }
    />
  );
}

/** Cỡ dấu tick — nhỏ hơn ô vuông đủ để còn thấy viền quanh nó. */
const TICK = 14;

export function RadioOption({
  label,
  hint,
  icon,
  checked,
  disabled = false,
  onPress,
}: {
  label: string;
  /** Dòng phụ dưới nhãn — chỉ khi có thứ cần nói thêm mà nhãn không chứa nổi. */
  hint?: string;
  /** Hình đại diện cho lựa chọn — bốn hình khác nhau nhận ra nhanh hơn bốn cái tên. */
  icon?: IconName;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <OptionShell
      label={label}
      {...(hint === undefined ? {} : { hint })}
      checked={checked}
      disabled={disabled}
      {...(icon === undefined ? {} : { icon })}
      role="radio"
      onPress={onPress}
      indicator={
        <XStack
          width={RING}
          height={RING}
          ai="center"
          jc="center"
          br={RING / 2}
          bw={checked ? 2 : 1}
          bc={checked ? colors.primary : colors.borderInput}
        >
          {/*
            Chấm chỉ vẽ khi đã chọn. Vẽ sẵn một chấm mờ để "giữ chỗ" thì vòng chưa chọn trông
            như đã chọn nhưng bị vô hiệu hoá — vòng rỗng đọc ra ngay là chưa chọn.
          */}
          {checked ? <XStack width={DOT} height={DOT} br={DOT / 2} bg={colors.primary} /> : null}
        </XStack>
      }
    />
  );
}
