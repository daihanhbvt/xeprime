import { memo, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { FONT_FAMILY } from '@/theme/fonts';
import { LineIcon } from '@/components/icons/LineIcon';
import { elevation } from '@/theme/elevation';
import { HEADER_SHADOW, IS_PARTNER_APP } from '@/lib/app-kind';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, space, typeScale } from '@/theme/tokens';

/**
 * Thanh TRANG của design v2 (Figma "Header MB" → "Page Header" `24175:59955`): nền trắng, bóng xs,
 * cao tối thiểu 60, đệm 16/12; tiêu đề 18/28 semibold bên trái, hàng nút icon vuông 36 (cách 8)
 * bên phải. Dùng cho màn CON của một khối menu (Đơn thuê xe, Lịch, Khách hàng…) — thay thanh thương
 * hiệu (logo · tin nhắn · chuông · avatar) của màn gốc.
 *
 * `onBack` có ⇒ biến thể màn chi tiết (Figma "Chi tiết đơn", "Đơn đã kết thúc"): mũi tên ← trước
 * tiêu đề.
 *
 * Thanh tự cộng inset trên, nên `<Screen>` bên dưới khai `edges={['left', 'right', 'bottom']}`.
 */
export const PageTopBar = memo(function PageTopBar({
  title,
  titleSuffix,
  titleBadge,
  onBack,
  actions,
  subtitle: subtitleProp,
  below,
}: {
  title: string;
  /**
   * Mẩu phụ NỐI SAU tiêu đề, cùng dòng: chữ 16/24 nghiêng màu `text/gray/very-low` (Figma chi tiết
   * yêu cầu hỗ trợ `24232:118901`: "Tranh chấp chuyến đi #SC10VG1E").
   */
  titleSuffix?: string;
  /**
   * Viên đếm XÁM ngay sau tiêu đề (Figma Lịch thuê xe "_Badge" `24729:83790`: "4 xe" - nền
   * `bg/gray-50`, chữ 14/20 medium `text/gray/medium`, bo 16). Tiêu đề co lại để viên đứng sát nó.
   */
  titleBadge?: string;
  /** Dòng phụ dưới tiêu đề (Figma "Chi tiết đơn": "Tạo lúc …" + viên chặng). */
  subtitle?: ReactNode;
  /** Khối nằm trong thanh, dưới hàng tiêu đề (vd. thanh bước của đơn). */
  below?: ReactNode;
  onBack?: (() => void) | undefined;
  /** Hàng nút bên phải — nên là `IconSquareButton`. */
  actions?: ReactNode;
}) {
  const colors = useColors();
  const t = useTranslations('Common.actions');
  const insets = useSafeAreaInsets();
  /*
   * Feedback thiết kế 20/11/2026 (bảng feedback dòng 2 "All Page"), CHỈ app Partner: bỏ câu mô tả
   * dạng CHỮ dưới tiêu đề - chỉ giữ dòng phụ có DỮ LIỆU (ReactNode: "Tạo lúc" + viên trạng thái…);
   * thanh không vạch kẻ đáy, bóng mảnh Figma "Shadow/xs".
   */
  const subtitle = IS_PARTNER_APP && typeof subtitleProp === 'string' ? undefined : subtitleProp;
  return (
    <YStack bg={colors.surface} pt={insets.top} zi={1} style={IS_PARTNER_APP ? HEADER_SHADOW : elevation.xs}>
      <XStack
        ai="center"
        jc="space-between"
        gap={space.sm}
        minHeight={BAR_MIN_HEIGHT}
        px={BAR_PAD_X}
        py={BAR_PAD_Y}
        borderBottomWidth={below || IS_PARTNER_APP ? 0 : 1}
        borderBottomColor={colors.borderSubtle}
      >
        <XStack f={1} minWidth={0} ai="center" gap={BACK_GAP}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={t('back')}
              hitSlop={BACK_SLOP}
              style={({ pressed }) => (pressed ? PRESSED : null)}
            >
              {/* Mũi tên ← = `arrow-right` xoay 180° — cùng nét icon với link "Xem tất cả →". */}
              <YStack style={FLIP}>
                <LineIcon name="arrow-right" size={iconSize.lg + space.xs} color={colors.text} />
              </YStack>
            </Pressable>
          ) : null}
          <YStack f={1} minWidth={0} gap={2}>
            {/* Nút phải nằm CÙNG hàng tiêu đề - dòng phụ (viên chặng) trải tới mép phải như Figma. */}
            <XStack ai="center" gap={space.sm}>
            <Text
              {...(titleBadge ? { flexShrink: 1 } : { f: 1 })}
              col={colors.text}
              fos={typeScale.heading.fontSize}
              lh={typeScale.heading.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
              accessibilityRole="header"
            >
              {title}
              {titleSuffix ? (
                <Text
                  col={colors.textPlaceholder}
                  fos={typeScale.title.fontSize}
                  lh={typeScale.title.lineHeight}
                  fow={fontWeight.regular}
                  fontFamily={FONT_FAMILY.body}
                  fontStyle="italic"
                >
                  {` ${titleSuffix}`}
                </Text>
              ) : null}
            </Text>
            {titleBadge ? (
              <YStack flexShrink={0} px={8} py={2} br={16} bg={colors.background}>
                <Text
                  col={colors.textMuted}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.medium}
                >
                  {titleBadge}
                </Text>
              </YStack>
            ) : null}
            {titleBadge ? <YStack f={1} /> : null}
            {subtitle && actions ? (
              <XStack ai="center" gap={ACTIONS_GAP} flexShrink={0}>
                {actions}
              </XStack>
            ) : null}
            </XStack>
            {subtitle}
          </YStack>
        </XStack>
        {actions && !subtitle ? (
          <XStack ai="center" gap={ACTIONS_GAP} flexShrink={0}>
            {actions}
          </XStack>
        ) : null}
      </XStack>
      {below ? (
        <YStack px={BAR_PAD_X} pb={BAR_PAD_Y}>
          {below}
        </YStack>
      ) : null}
    </YStack>
  );
});

/** Figma "Page Header": `min-h 60`, đệm `16/12`; "Group Button" cách 8. */
const BAR_MIN_HEIGHT = 60;
const BAR_PAD_X = 16;
const BAR_PAD_Y = 12;
const ACTIONS_GAP = 8;
const BACK_GAP = 8;
const BACK_SLOP = 12;
const PRESSED = { opacity: 0.6 } as const;
const FLIP = { transform: [{ rotate: '180deg' }] } as const;
