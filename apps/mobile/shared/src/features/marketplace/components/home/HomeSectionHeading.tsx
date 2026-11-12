import type { ReactNode } from 'react';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Text, YStack } from 'tamagui';
import { useRevealChild, useRevealFadeUp } from '@/components/motion/ScrollReveal';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';

/** Gạch vàng dưới tiêu đề — 68 × 2 của bản vẽ v2. */
const DIVIDER_WIDTH = 68;

interface HomeSectionHeadingProps {
  /** Dòng nhỏ viết hoa phía trên ("TẠI SAO LẠI CHỌN XEPRIME"). */
  kicker: string;
  /** Chuỗi, hoặc node có định dạng (`t.rich` — cụm chữ vàng của "Lý do nên chọn XePrime"). */
  title?: ReactNode;
  /** Mặc định `true` — bản vẽ mobile v2 canh giữa và kẻ gạch vàng dưới MỌI tiêu đề khối. */
  divider?: boolean;
}

/**
 * Tiêu đề khối trang chủ v2 — bản native của `SectionHeading` bên web (kicker · tiêu đề · gạch).
 *
 * Canh GIỮA ở mọi khối như bản vẽ mobile (Figma `19771:51664`); web canh trái ở vài khối vì bên đó
 * nút "Xem tất cả" đứng cùng hàng — ở mobile web lẫn app nút đó xuống dưới nội dung.
 */
export function HomeSectionHeading({ kicker, title, divider = true }: HomeSectionHeadingProps) {
  const colors = useColors();
  // Vào màn (trong `ScrollReveal`): kicker → tiêu đề (+120ms, so le theo từ) → gạch chân (+250ms).
  const kickerStyle = useRevealFadeUp(0);
  const divider_ = useRevealChild(250);
  const dividerStyle = useAnimatedStyle(() =>
    divider_ ? { transform: [{ scaleX: divider_.value }] } : {},
  );
  return (
    // Figma MB `19879:67458`: kicker 12/18 semibold `primary-hover`, tiêu đề 20/30 semibold, cách 4.
    <YStack ai="center" gap={space.xs} accessibilityRole="header">
      <Animated.View style={kickerStyle}>
        <Text col={colors.primaryHover} fos={fontSize.label} lh={18} fow={fontWeight.semibold} ta="center">
          {kicker.toLocaleUpperCase()}
        </Text>
      </Animated.View>
      {/*
        Tiêu đề là MỘT khối chữ (căn giữa, tự xuống dòng), hiện dần + trượt lên cả khối. Bản tách
        từng từ thành hàng `XStack fw="wrap"` bị bỏ (09/11/2026): khung cha co theo nội dung nên
        hàng không bao giờ chạm mép để xuống dòng - tiêu đề dài tràn hai bên.
      */}
      {title == null ? null : (
        <TitleBlock>
          <Text col={colors.text} fos={fontSize.lead} lh={30} fow={fontWeight.semibold} ta="center">
            {title}
          </Text>
        </TitleBlock>
      )}
      {divider ? (
        // scaleX mở từ GIỮA (tâm mặc định của transform).
        <Animated.View style={dividerStyle}>
          <YStack w={DIVIDER_WIDTH} h={2} bg={colors.primary} />
        </Animated.View>
      ) : null}
    </YStack>
  );
}

/** Độ trễ bắt đầu của tiêu đề sau kicker (ms). */
const TITLE_DELAY = 120;

/** Tiêu đề có định dạng (`t.rich`) không tách từ được — cả khối fade + trượt. */
function TitleBlock({ children }: { children: ReactNode }) {
  const style = useRevealFadeUp(TITLE_DELAY);
  return <Animated.View style={style}>{children}</Animated.View>;
}
