import { memo } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, XStack, YStack } from 'tamagui';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, radius, typeScale } from '@/theme/tokens';
import { MAIN_GRADIENT } from './Button';

/** Một thao tác trong tấm "Thao tác" mở từ nút ⋮ của thanh đầu trang. */
export interface SheetAction {
  readonly key: string;
  readonly label: string;
  /** Biểu tượng nét đứng trước chữ (Figma "Thao tác": mọi nút đều có icon 20). */
  readonly icon?: LineIconName;
  readonly onPress: () => void;
  /** Hành động CHÍNH - nút vàng trải hết hàng, đứng dưới cùng. */
  readonly primary?: boolean;
  /** Việc nguy hiểm (huỷ, từ chối…) - viền đỏ thay cho viền xám. */
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  /** Bề rộng CỐ ĐỊNH (dp) thay cho chia đều - Figma "Lưu trữ" rộng 163, "Phân loại" lấy phần còn lại. */
  readonly width?: number;
  /** Tỉ lệ chia bề ngang với nút cùng hàng (mặc định 1 - chia đều): nhãn ngắn cho số nhỏ hơn nhãn dài. */
  readonly grow?: number;
  /** Đứng MỘT MÌNH một hàng, trải hết bề ngang (không ghép đôi với nút kề). */
  readonly block?: boolean;
  /** Nút VUÔNG chỉ có icon (Figma "Thao tác" của chi tiết xe: thùng rác đỏ 40x40) - chữ chỉ đọc cho trợ năng. */
  readonly iconOnly?: boolean;
}

/**
 * Thân tấm "Thao tác" - Figma Partner-XePrime `24273:89851` (`_Filter Modal` `24486:63636`), vẽ ĐÚNG số
 * đo của Figma: nút cao 40 (đệm 16/10), bo 12, icon nét 20 + khe 6 + chữ 14/20 đậm; các nút PHỤ viền
 * `stroke/gray-low300` nền trắng chữ `text/gray/medium`, hai nút một hàng; nút CHÍNH dải vàng
 * `#efc423 → #f3c84a` chữ `text/gray/high` trải hết bề ngang ở dưới cùng; khe giữa các nút 12. Số nút
 * phụ lẻ thì nút cuối trải cả hàng (người dùng chốt 25/11/2026).
 *
 * Dựng riêng thay vì dùng `Button`: `Button` cỡ `md` cao 44 và chữ 16, lệch Figma. Nơi gọi tự đóng tấm
 * trong `onPress` nếu cần - thành phần này không biết nó nằm trong tấm nào.
 */
export function ActionSheetButtons({
  actions,
  autoSize = false,
  primaryFirst = false,
}: {
  actions: readonly SheetAction[];
  /**
   * Hai nút một hàng chia bề ngang THEO ĐỘ DÀI NHÃN thay vì đều - nhãn ngắn ("Tạm khoá") không phải
   * rộng bằng nhãn dài ("Gỡ khỏi gian hàng") và nhãn dài không bị cắt. Mặc định tắt: các tấm đã dùng
   * (chi tiết đơn, chi tiết xe) giữ chia đều như Figma.
   */
  autoSize?: boolean;
  /** Nút CHÍNH đứng TRÊN CÙNG thay vì dưới cùng (tấm chọn ảnh: "Chọn từ thư viện" đầu tiên). */
  primaryFirst?: boolean;
}) {
  const secondary = actions.filter((action) => !action.primary);
  const primary = actions.filter((action) => action.primary);
  // Theo thứ tự khai: nút `block` một hàng riêng, các nút còn lại ghép đôi liên tiếp.
  const rows: SheetAction[][] = [];
  let pair: SheetAction[] = [];
  for (const action of secondary) {
    if (action.block) {
      if (pair.length > 0) rows.push(pair);
      pair = [];
      rows.push([action]);
    } else {
      pair.push(action);
      if (pair.length === 2) {
        rows.push(pair);
        pair = [];
      }
    }
  }
  if (pair.length > 0) rows.push(pair);

  const primaryButtons = primary.map((action) => <ActionButton key={action.key} action={action} />);
  return (
    <YStack gap={GAP}>
      {primaryFirst ? primaryButtons : null}
      {rows.map((row) => (
        <XStack key={row.map((action) => action.key).join('|')} gap={GAP}>
          {row.map((action) => (
            <YStack
              key={action.key}
              {...(action.iconOnly
                ? { w: BUTTON_HEIGHT, flexShrink: 0 }
                : action.width
                ? { w: action.width, flexShrink: 0 }
                : { f: action.grow ?? (autoSize ? action.label.length + ICON_CHARS : 1), flexBasis: 0, minWidth: 0 })}
            >
              <ActionButton action={action} />
            </YStack>
          ))}
        </XStack>
      ))}
      {primaryFirst ? null : primaryButtons}
    </YStack>
  );
}

const ActionButton = memo(function ActionButton({ action }: { action: SheetAction }) {
  const colors = useColors();
  const blocked = (action.disabled ?? false) || (action.loading ?? false);
  const main = action.primary === true;
  // Nút CHÍNH bị vô hiệu (vd "Đã thu đủ") = vàng nhạt, không xám thuần.
  const mainDisabled = main && (action.disabled ?? false) && !(action.loading ?? false);

  // Màu chữ + icon: nút chính `text/gray/high`; phụ `text/gray/medium`; nguy hiểm đỏ.
  const fg = mainDisabled
    ? colors.brandHigh
    : blocked
    ? colors.textMuted
    : main
      ? colors.text
      : action.danger
        ? colors.danger
        : colors.textMuted;

  // Icon: nút phụ `text/gray/low` (#717680, nhạt hơn chữ `text/gray/medium`), nguy hiểm đỏ, chính mực đen.
  const iconColor = mainDisabled
    ? colors.brandHigh
    : blocked
    ? colors.textMuted
    : main
      ? colors.text
      : action.danger
        ? colors.danger
        : colors.placeholder;

  return (
    <Pressable
      onPress={() => {
        Keyboard.dismiss();
        action.onPress();
      }}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ busy: action.loading ?? false, disabled: blocked }}
      style={({ pressed }) => (pressed ? PRESSED : null)}
    >
      <XStack
        h={BUTTON_HEIGHT}
        px={action.iconOnly ? 0 : PAD_X}
        ai="center"
        jc="center"
        gap={ICON_GAP}
        br={radius.control}
        overflow="hidden"
        bw={main && !blocked ? 0 : 1}
        bc={mainDisabled ? colors.brandBorder : action.danger && !blocked ? colors.dangerBorder : colors.borderInput}
        bg={mainDisabled ? colors.brandLow : blocked ? colors.surfaceMuted : main ? 'transparent' : colors.surface}
      >
        {main && !blocked ? (
          <LinearGradient
            colors={MAIN_GRADIENT.colors}
            locations={MAIN_GRADIENT.locations}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {action.loading ? (
          <ActivityIndicator color={fg} size="small" />
        ) : (
          <>
            {action.icon ? (
              <XStack flexShrink={0}>
                <LineIcon name={action.icon} size={iconSize.lg} color={iconColor} />
              </XStack>
            ) : null}
            {action.iconOnly ? null : (
            <Text
              flexShrink={1}
              minWidth={0}
              col={fg}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {action.label}
            </Text>
            )}
          </>
        )}
      </XStack>
    </Pressable>
  );
});

/** Figma `_Filter Modal`: các nút cách nhau 12; nút cao 40, đệm ngang 16, icon ↔ chữ 6. */
/** Phần icon + khe quy ra "ký tự" khi chia bề ngang theo độ dài nhãn (`autoSize`). */
const ICON_CHARS = 5;
const GAP = 12;
const BUTTON_HEIGHT = 40;
const PAD_X = 16;
const ICON_GAP = 6;
const PRESSED = { opacity: 0.7 } as const;
