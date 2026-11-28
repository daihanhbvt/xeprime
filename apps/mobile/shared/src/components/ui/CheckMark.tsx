import Svg, { Path } from 'react-native-svg';
import { XStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

/**
 * Cạnh ô vuông — bằng đúng vòng chọn của `RadioOption`, để một form trộn cả hai loại không so le.
 *
 * 20 là cỡ còn đọc được ở khoảng cách cầm điện thoại mà không tranh chỗ với nhãn. Vùng chạm là
 * cả HÀNG chứ không riêng cái ô, nên ô không cần to bằng ngón tay.
 */
const BOX = 20;
const BOX_SM = 16;

/**
 * Dấu tích vẽ bằng NÉT (khung 12) thay glyph Ionicons `checkmark`: nét mảnh đầu tròn, cân trong ô -
 * kiểu ô "Checkbox" của bộ thiết kế (Figma Partner-XePrime `1097:63885`). Cỡ vẽ theo ô: 10 trong
 * ô 16, 14 trong ô 20.
 */
const TICK_PATH = 'M10 3L4.5 8.5L2 6';
const TICK_VIEWBOX = '0 0 12 12';
const TICK_STROKE = 1.75;
const TICK = 14;
const TICK_SM = 10;
/** Đường tích "Base Icon" của Figma Check circle (khung 14). */
const CIRCLE_TICK_PATH = 'M11.6667 3.5L5.25 9.91667L2.33333 7';
const CIRCLE_TICK = 14;
/** Ô `sm` bo 6 như Figma (`num/6`); ô `md` giữ `radius.sm`. */
const BOX_SM_RADIUS = 6;

/**
 * Ô tick VUÔNG — chỉ cái dấu, không khung, không nhãn, không bắt chạm.
 *
 * Tách khỏi `CheckOption` khi câu cam kết pháp lý cần một ô tick mà nhãn là VĂN BẢN CÓ LIÊN KẾT
 * (`LegalConsentCheckbox`), thứ `CheckOption` không nhận — nhãn của nó là `string`, và khung
 * viền của nó là ngôn ngữ của một DANH SÁCH lựa chọn, không phải của một dòng cam kết.
 *
 * Vuông chứ không tròn ở mọi nơi dùng nó: hình phải nói được chọn được mấy cái. Một hàng ô tròn
 * mà bấm hai cái cùng sáng là hình nói dối, và người dùng sẽ bấm lại vì tưởng mình chọn nhầm.
 *
 * Dấu tích TRẮNG ở giao diện sáng (`colors.checkTick`, người dùng chốt 20/11/2026); giao diện tối
 * dùng chữ tối trên nền vàng sáng.
 */
export function CheckMark({
  checked,
  size = 'md',
  shape = 'square',
  tone = 'primary',
}: {
  /**
   * `brand` - "Checkbox filled" trong thẻ chọn viền vàng (Figma `24789:84314`): nền `bg/primary`
   * #f5c33b (`brandShape`), sáng hơn `primary` #e9ac29 của ô tích thường.
   */
  tone?: 'primary' | 'brand';
  /**
   * `circle` - "Check circle" của Figma (`1142:82407`, checklist chuẩn bị giao xe `24158:102976`):
   * tròn 20, xong = nền `shape/primary` + tích trắng nét 2 (đường Figma, khung 14).
   */
  shape?: 'square' | 'circle';
  checked: boolean;
  /** `sm` - ô 16 (Figma Partner-XePrime "Checkbox" sm, `1097:63885`); `md` - ô 20 mặc định. */
  size?: 'sm' | 'md';
}) {
  const colors = useColors();
  const sm = size === 'sm';
  const box = sm ? BOX_SM : BOX;
  const tick = sm ? TICK_SM : TICK;
  const circle = shape === 'circle';
  const fill = tone === 'brand' ? colors.brandShape : colors.primary;
  return (
    <XStack
      width={box}
      height={box}
      ai="center"
      jc="center"
      br={circle ? radius.pill : sm ? BOX_SM_RADIUS : radius.sm}
      bw={1}
      bc={checked ? fill : colors.borderInput}
      bg={checked ? fill : colors.surface}
    >
      {checked && circle ? (
        <Svg width={CIRCLE_TICK} height={CIRCLE_TICK} viewBox="0 0 14 14" fill="none">
          <Path
            d={CIRCLE_TICK_PATH}
            stroke={colors.checkTick}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : checked ? (
        <Svg width={tick} height={tick} viewBox={TICK_VIEWBOX} fill="none">
          <Path
            d={TICK_PATH}
            stroke={colors.checkTick}
            strokeWidth={TICK_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </XStack>
  );
}
