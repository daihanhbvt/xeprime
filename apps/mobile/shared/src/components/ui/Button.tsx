import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet } from 'react-native';
import { Text, XStack } from 'tamagui';
import { themed, useColors } from '@/theme/ThemeProvider';
import {
  buttonHeight,
  buttonHitSlop,
  fontSize,
  fontWeight,
  gradients,
  iconSize,
  radius,
  space,
} from '@/theme/tokens';
import type { IconName } from './Chip';

/**
 * `accent` = nền VÀNG NHẠT, chữ và viền vàng đậm.
 *
 * Không phải `primary` thu nhỏ: `primary` là nền vàng đặc dành cho hành động CHÍNH duy nhất của
 * màn. Một nhóm nút phụ tô nền đặc sẽ cạnh tranh trực tiếp với nó và người dùng mất chỗ để mắt
 * rơi vào. `accent` giữ được sắc thái thương hiệu mà vẫn đọc ra là hạng dưới.
 */
/**
 * `gradient` = nút CHÍNH của bề mặt khách (`CtaButton variant="gradient"` web: dải
 * `--xp-gradient-primary`, chữ `color-primary-contrast`). `outline` = `CtaButton variant="outline"`
 * web: nền thẻ, viền `color-primary-muted`, chữ `color-primary`. Màn quản lý giữ `primary`
 * phẳng vì Manage web là nút AntD phẳng.
 */
type Variant =
  | 'primary'
  | 'gradient'
  | 'outline'
  | 'secondary'
  | 'neutral'
  | 'ghost'
  | 'ghostDanger'
  | 'danger'
  | 'dangerOutline'
  | 'accent';
/**
 * Chiều cao VẼ RA khớp web (`buttonHeight`): `sm` 32 · `md` 40 (mặc định) · `lg` 44. Vùng
 * CHẠM vẫn ≥ `sizing.touchTarget` nhờ `hitSlop` dọc — không thổi phồng nút cho vừa ngón tay.
 *
 * Đệm ngang thì MỌI cỡ dùng chung `space.md` — xem lý do ở `px` trong phần dựng hình.
 */
type Size = 'sm' | 'md' | 'lg';
/**
 * `pill` là mặc định của app — nút hành động chính chiếm trọn bề ngang, bo tròn hết cỡ.
 *
 * `square` (bo `border-radius` 10px, đúng `--xp-border-radius` mà `RowActions.module.css`
 * của web dùng) dành cho một HÀNG nút nhỏ nằm trong thẻ. Ở đó pill làm ba viên thuốc con nằm
 * cạnh nhau, không đọc ra là một nhóm thao tác của thẻ.
 */
type Shape = 'pill' | 'square';

// MỌI nút có nền đều có VIỀN nhìn thấy được (người dùng chốt 28/10/2026) — chỉ ghost/ghostDanger không viền.
const useVariant = themed<Record<Variant, { bg: string; fg: string; border: string }>>(
  (colors) => ({
    // Nút vàng CHÍNH vẽ cùng dải gradient với 'gradient' (người dùng chốt 27/10/2026: mọi nút vàng một kiểu).
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primaryHover },
    // Nền thật do `LinearGradient` vẽ; màu đặc chỉ là nền lót.
    gradient: { bg: colors.primary, fg: colors.onPrimary, border: colors.primaryHover },
    outline: { bg: colors.surface, fg: colors.primary, border: colors.primaryMuted },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.borderInput },
    /** = `CtaButton variant="neutral"` web: nền `bg-container`, viền `border-strong`, chữ `text-secondary`. */
    neutral: { bg: colors.surface, fg: colors.textMuted, border: colors.borderInput },
    ghost: { bg: 'transparent', fg: colors.primaryActive, border: 'transparent' },
    /** Dáng `ghost` (không nền, không viền) nhưng mang màu nguy hiểm — lối phụ mà hệ quả thì nặng. */
    ghostDanger: { bg: 'transparent', fg: colors.danger, border: 'transparent' },
    danger: { bg: colors.dangerSurface, fg: colors.danger, border: colors.danger },
    /** = AntD `<Button danger>` (kiểu mặc định): nền thẻ, viền + chữ đỏ — đứng được trên nền tông lỗi. */
    dangerOutline: { bg: colors.surface, fg: colors.danger, border: colors.danger },
    accent: { bg: colors.primaryLight, fg: colors.primaryActive, border: colors.primary },
  }),
);

/*
 * KHÔNG dùng `adjustsFontSizeToFit` ở nút. Đây là một lựa chọn đã thử rồi gỡ, nên đừng thêm lại.
 *
 * Nó co chữ theo TỪNG nút một cách độc lập, nên hai nút đứng cạnh nhau ra hai cỡ chữ khác nhau:
 * "Huỷ" đủ chỗ nên giữ 14px, "Lưu thay đổi" thiếu chỗ nên tụt xuống ~12px — người dùng đọc ra là
 * app dựng ẩu, và đó là lỗi DỄ THẤY hơn hẳn cái nó định chữa.
 *
 * Cách giải đúng là cho nhãn đủ chỗ THẬT: đệm ngang `space.md` (xem `px` bên dưới), hai nút một
 * hàng chia đều, và nhãn nào không vừa thì rút ngắn nhãn hoặc cho ô đó `f={2}` — tất cả đều là
 * quyết định nhìn thấy được trong mã, thay vì một phép co chữ âm thầm lúc chạy.
 */

const ALIGN_SELF = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
} as const;

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  shape?: Shape;
  /**
   * Mặc định chiếm trọn bề ngang — nút hành động chính trên mobile hầu như luôn full width.
   *
   * ── LUẬT HÀNG HAI NÚT ─────────────────────────────────────────────────────────────────────
   *
   * Cặp "lối thoát + hành động chính" (Huỷ/Lưu, Đóng/Gửi, Quay lại/Tiếp tục) xếp như sau:
   *
   *     <XStack gap={space.sm}>
   *       <YStack flexShrink={0}>   ← lối thoát: CO VỪA CHỮ
   *         <Button label="Huỷ" variant="ghost" … />
   *       </YStack>
   *       <YStack f={1}>            ← hành động chính: LẤY PHẦN CÒN LẠI
   *         <Button label="Lưu thay đổi" icon="checkmark-outline" … />
   *       </YStack>
   *     </XStack>
   *
   * Vì sao KHÔNG chia đôi: "Huỷ" dài 3 ký tự còn "Lưu thay đổi" dài 12. Chia đôi thì nửa hàng
   * bên trái bỏ trống quá nửa, trong khi nửa bên phải thiếu chỗ và nhãn bị cắt thành "Lưu thay…".
   * Cho lối thoát co vừa chữ là cách DUY NHẤT không phải đoán: nút chính luôn nhận đúng phần
   * rộng nhất còn có thể, ở mọi ngôn ngữ, mà không ai phải ngồi tính trước bề ngang chữ.
   *
   * Thứ tự: lối thoát bên TRÁI, hành động chính bên PHẢI.
   *
   * Hai hành động NGANG HÀNG (Chụp ảnh/Thư viện, Nhắn shop/Chọn thuê, ô Từ/Đến) thì khác: chúng
   * chia ĐỀU `f={1}`/`f={1}`, vì không có bên nào là phụ để phải nhường chỗ.
   *
   * Nút thoát KHÔNG mang icon — nó đã hẹp sẵn, và chữ luôn thắng hình khi chật.
   */
  block?: boolean;
  /**
   * Vị trí của nút trên trục NGANG khi `block={false}`.
   *
   * Nút co vừa chữ buộc phải tự đặt `alignSelf`, mà `alignSelf` GHI ĐÈ `alignItems` của khối cha
   * — nên một nút `block={false}` thả vào khối căn giữa (trạng thái rỗng, trạng thái lỗi, chân
   * danh sách) vẫn dạt về mép trái dù cha đã bảo căn giữa. Đặt `align="center"` ở những chỗ đó,
   * thay vì bọc thêm một lớp View chỉ để sửa lề. Không có tác dụng khi `block`.
   */
  align?: 'start' | 'center' | 'end';
  /**
   * Chữ cho TRÌNH ĐỌC MÀN HÌNH khi nhãn nhìn thấy đã bị rút ngắn cho vừa chỗ.
   *
   * Một nút "Xoá" nằm ngay dưới tấm ảnh nó xoá là rõ ràng với mắt, nhưng trình đọc màn hình đọc
   * tuần tự và nghe được đúng chữ "Xoá" — không biết xoá cái gì. Mặc định vẫn là nhãn nhìn thấy.
   */
  accessibilityLabel?: string;
  /** Đệm ngang hẹp (4) cho hàng 3 nút chia đều trên máy hẹp — nhãn đủ chỗ thay vì bị "…". */
  tight?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  shape = 'pill',
  icon,
  loading = false,
  disabled = false,
  block = true,
  align = 'start',
  accessibilityLabel,
  tight = false,
}: ButtonProps) {
  const colors = useColors();
  const VARIANT = useVariant();
  const blocked = disabled || loading;

  /**
   * ĐÓNG BÀN PHÍM trước khi chạy hành động.
   *
   * Bấm một nút trong lúc bàn phím đang mở nghĩa là người dùng đã gõ xong. React Native không tự
   * đóng: chạm sang một `Pressable` khác KHÔNG làm ô nhập mất tiêu điểm trên Android, nên bấm
   * "Lưu" xong bàn phím vẫn che nửa dưới màn — che đúng chỗ toast báo kết quả, che luôn màn tiếp
   * theo nếu hành động đó điều hướng.
   *
   * Đặt ở `Button` chứ không ở từng màn: 137 chỗ gọi, và một chỗ quên là một màn hành xử khác
   * phần còn lại. `Keyboard.dismiss()` là no-op khi không có bàn phím nên nút nào cũng gọi được.
   *
   * Nó cũng làm ô đang gõ nhả tiêu điểm, tức `onBlur` của React Hook Form chạy TRƯỚC `onPress` —
   * đúng thứ tự cần cho ô cuối cùng được validate trước khi submit.
   */
  const press = useCallback(() => {
    Keyboard.dismiss();
    onPress();
  }, [onPress]);
  const skin = VARIANT[variant];
  const height = buttonHeight[size];
  const slop = buttonHitSlop(height);
  /** Hai biến thể KHÔNG nền, không viền — nền mờ lúc bị chặn cũng không áp cho chúng. */
  const borderless = variant === 'ghost' || variant === 'ghostDanger';
  /*
   * Chữ nút bị khoá dùng `textMuted`, KHÔNG `textDisabled`: cái sau đặt trên nền `surfaceMuted`
   * chỉ đạt tương phản ~1.6:1 nên nhãn gần như biến mất, và trạng thái khoá đọc thành "màn hình
   * lỗi" thay vì "chưa nhập đủ". Cái phân biệt khoá với bấm được là NỀN, không phải độ mờ chữ.
   */
  const fg = blocked ? colors.textMuted : skin.fg;

  return (
    /*
      Vỏ bắt chạm là `Pressable` của React Native, KHÔNG phải `onPress` của Tamagui:
      `accessibilityRole="button"` đặt trên stack Tamagui không nổi lên cây khả truy cập, và thứ
      không tìm được bằng vai thì trình đọc màn hình cũng không đọc ra là một nút. Bố cục bên
      trong vẫn là Tamagui — Tamagui cho HÌNH, primitive React Native cho THAO TÁC.
    */
    <Pressable
      onPress={press}
      disabled={blocked}
      accessibilityRole="button"
      /*
        TÊN của nút đặt tường minh, không để trình đọc tự gom từ chữ bên trong: chữ nằm trong
        `<Text>` của Tamagui, và cây khả truy cập không phải lúc nào cũng nhặt được nó lên nút —
        khi ấy nút đọc ra là một "button" không tên. Đây cũng là điều làm nút tìm được bằng VAI
        trong test, thay vì bằng chuỗi (mà chuỗi thì trùng với tiêu đề thẻ ngay cạnh).
      */
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy: loading, disabled: blocked }}
      hitSlop={{ top: slop, bottom: slop }}
      style={({ pressed }) => [
        block ? { alignSelf: 'stretch' } : { alignSelf: ALIGN_SELF[align] },
        pressed ? { opacity: 0.85 } : null,
      ]}
    >
      <XStack
        ai="center"
        jc="center"
        gap={space.xs}
        overflow="hidden"
        bg={blocked && !borderless ? colors.surfaceMuted : skin.bg}
        bc={blocked ? colors.border : skin.border}
        bw={borderless ? 0 : 1}
        // Chuẩn chung của mọi nút = nút "Chọn thuê" (người dùng chốt 28/10/2026): bo `control` 12, không còn viên thuốc.
        br={shape === 'square' ? radius.md : radius.control}
        /*
          Đệm ngang `space.md` cho MỌI cỡ, không phải `space.lg`.

          Trên một hàng hai nút ở máy 360dp, mỗi nút được 156dp. Đệm 24dp mỗi bên ăn mất 48dp —
          gần một phần ba — và đó chính là lý do "Lưu thay đổi" (12 ký tự) không vừa. Hạ về 16dp
          trả lại 16dp cho chữ, đủ cho mọi nhãn hiện có ở cỡ gốc mà không phải co chữ.

          Nút full-width không mất gì: nhãn ở đó căn giữa nên đệm ngang không ai nhìn thấy.
        */
        px={tight ? space.xs : space.md}
        minHeight={height}
      >
        {(variant === 'gradient' || variant === 'primary') && !blocked ? (
          <LinearGradient
            colors={gradients.primary.colors}
            locations={gradients.primary.locations}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {loading ? (
          <ActivityIndicator color={fg} size="small" />
        ) : (
          <>
            {icon ? (
              // `flexShrink={0}`: hết chỗ thì CHỮ co, không phải biểu tượng méo đi.
              <XStack flexShrink={0}>
                <Ionicons name={icon} size={size === 'sm' ? iconSize.sm : iconSize.md} color={fg} />
              </XStack>
            ) : null}
            <Text
              flexShrink={1}
              minWidth={0}
              ta="center"
              col={fg}
              fos={
                size === 'lg' ? fontSize.bodyLg : size === 'sm' ? fontSize.bodySm : fontSize.body
              }
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {label}
            </Text>
          </>
        )}
      </XStack>
    </Pressable>
  );
}
