import EditOutlined from '@ant-design/icons-svg/es/asn/EditOutlined';
import type { ReactNode } from 'react';
import { Pressable, type LayoutChangeEvent } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { AntIcon } from '@/components/icons/AntIcon';
import { LineIcon } from '@/components/icons/LineIcon';
import { elevation } from '@/theme/elevation';
import { layout } from '@/theme/layout';
import { useColors, useDarkAccentBorder } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import { IconSquareButton } from './IconSquareButton';
import { TextWithHint } from './InfoHint';

/** Nút bút chì 40×40 bo 12 của web `.edit` (`InfoCard.module.css`) - nút viền thường của AntD. */
const EDIT_BUTTON = 40;
/** `--xp-line-height-h3` (28) trên cỡ `h3` (18). */
const TITLE_LINE_HEIGHT = 28;
/** Mô tả dài hơn mức này thì gọn vào dấu ⓘ. */
const HINT_INLINE_MAX = 60;
const BODY_LINE_HEIGHT = 20;
/** Thẻ Figma Partner "Quản lý gian hàng" (`24231:113310`): đệm 16, các phần cách 16, đầu thẻ cách nút 12. */
const FIGMA_PAD = 16;
const FIGMA_GAP = 16;
const FIGMA_HEAD_GAP = 12;

/**
 * `default` = khuôn `InfoCard` web (tiêu đề 18/28, mô tả 14/20, bút chì AntD).
 * `figma` = khuôn thẻ của Figma Partner "Quản lý gian hàng" (`24231:113440` "Vehicle Specifications
 * Header"): tiêu đề 16/24 đậm vừa, mô tả 12/18 xám luôn hiện tại chỗ, nút góc 40 bo 12 với icon nét
 * Figma (Edit 2), bóng quầng đều bốn phía.
 */
export type InfoCardLook = 'default' | 'figma';

/**
 * Khung THẺ có tiêu đề + dòng phụ + bút chì — bản native của `components/layout/InfoCard` web
 * (design `23999:111274`: "Chủ gian hàng", "Địa chỉ & pháp lý", "Thông tin khai thuế"…).
 *
 * Đệm 20, bo 16, viền xám nhạt + bóng rất nhẹ như `.card` của web. Bút chì chỉ có khi `onEdit` —
 * vắng ⇒ thẻ chỉ đọc (thiếu quyền, phiên hỗ trợ). `extra` thay chỗ bút chì cho nút riêng của thẻ.
 */
export function InfoCard({
  title,
  hint,
  editLabel,
  onEdit,
  extra,
  footer,
  onLayout,
  look = 'default',
  children,
}: {
  title: string;
  hint?: ReactNode;
  /** Nhãn trợ năng của nút bút chì. */
  editLabel?: string;
  onEdit?: () => void;
  extra?: ReactNode;
  footer?: ReactNode;
  /** Đo vị trí thẻ — trang dùng để cuộn tới `?section=`. */
  onLayout?: (event: LayoutChangeEvent) => void;
  look?: InfoCardLook;
  children?: ReactNode;
}) {
  const colors = useColors();
  const accent = useDarkAccentBorder();
  if (look === 'figma') {
    return (
      <YStack
        onLayout={onLayout}
        gap={FIGMA_GAP}
        p={FIGMA_PAD}
        br={radius.card}
        bw={1}
        bc={accent.borderColor ?? colors.border}
        bg={colors.surface}
        style={elevation.card}
      >
        <XStack ai="flex-start" jc="space-between" gap={FIGMA_HEAD_GAP}>
          <YStack f={1} minWidth={0}>
            <Text
              col={colors.text}
              fos={typeScale.title.fontSize}
              lh={typeScale.title.lineHeight}
              fow={fontWeight.semibold}
              accessibilityRole="header"
            >
              {title}
            </Text>
            {typeof hint === 'string' ? (
              <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                {hint}
              </Text>
            ) : (
              hint
            )}
          </YStack>
          {extra}
          {onEdit ? (
            <IconSquareButton label={editLabel ?? title} onPress={onEdit} size="card">
              <LineIcon name="edit" size={iconSize.lg} color={colors.textMuted} />
            </IconSquareButton>
          ) : null}
        </XStack>
        {children}
        {footer ? (
          typeof footer === 'string' ? (
            <Text
              col={colors.textPlaceholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fontStyle="italic"
            >
              {footer}
            </Text>
          ) : (
            footer
          )
        ) : null}
      </YStack>
    );
  }
  return (
    <YStack
      onLayout={onLayout}
      gap={space.md}
      p={layout.cardPad}
      br={radius.card}
      bw={1}
      bc={accent.borderColor ?? colors.border}
      bg={colors.surface}
    >
      <XStack ai="flex-start" gap={12} flexWrap="wrap">
        <YStack f={1} minWidth={200} gap={2}>
          {/* Mô tả dài gọn vào dấu ⓘ LỒNG sau chữ cuối tiêu đề, chạm mở đọc đủ (người dùng 17/11 + 28/11/2026). */}
          <TextWithHint
            hint={typeof hint === 'string' && hint.length > HINT_INLINE_MAX ? hint : undefined}
            hintLabel={title}
            hintSize={fontSize.body}
            col={colors.text}
            fos={fontSize.h3}
            lineHeight={TITLE_LINE_HEIGHT}
            fow={fontWeight.semibold}
            accessibilityRole="header"
          >
            {title}
          </TextWithHint>
          {hint ? (
            typeof hint === 'string' ? (
              hint.length > HINT_INLINE_MAX ? null : (
              <Text col={colors.placeholder} fos={fontSize.body} lineHeight={BODY_LINE_HEIGHT}>
                {hint}
              </Text>
              )
            ) : (
              hint
            )
          ) : null}
        </YStack>
        {extra}
        {onEdit ? (
          <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={editLabel ?? title} hitSlop={4}>
            {({ pressed }) => (
              <YStack
                w={EDIT_BUTTON}
                h={EDIT_BUTTON}
                ai="center"
                jc="center"
                br={radius.control}
                bw={1}
                bc={pressed ? colors.primary : colors.borderInput}
                bg={colors.surface}
              >
                <AntIcon icon={EditOutlined} size={16} color={pressed ? colors.primary : colors.text} />
              </YStack>
            )}
          </Pressable>
        ) : null}
      </XStack>
      {children}
      {footer ? (
        typeof footer === 'string' ? (
          <Text col={colors.textPlaceholder} fos={fontSize.bodySm} lineHeight={18} fontStyle="italic">
            {footer}
          </Text>
        ) : (
          footer
        )
      ) : null}
    </YStack>
  );
}

/** Danh sách hàng nhãn ↔ giá trị (khe 12 như `.rows` web; thẻ Figma Partner khe 8). */
export function InfoRows({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  return <YStack gap={gap}>{children}</YStack>;
}

/** Một hàng: nhãn xám trái, giá trị đậm vừa căn phải — rỗng thì hiện `emptyLabel` nhạt. */
export function InfoRow({
  label,
  value,
  emptyLabel,
  suffix,
}: {
  label: string;
  value: ReactNode;
  emptyLabel: string;
  suffix?: ReactNode;
}) {
  const colors = useColors();
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <XStack jc="space-between" ai="flex-start" gap={space.md}>
      <Text col={colors.placeholder} fos={fontSize.body} lineHeight={BODY_LINE_HEIGHT} flexShrink={0}>
        {label}
      </Text>
      <XStack f={1} minWidth={0} jc="flex-end" ai="center" gap={6}>
        {isEmpty ? (
          <Text col={colors.placeholder} fos={fontSize.body} ta="right">
            {emptyLabel}
          </Text>
        ) : typeof value === 'string' || typeof value === 'number' ? (
          <Text
            col={colors.text}
            fos={fontSize.body}
            lineHeight={BODY_LINE_HEIGHT}
            fow={fontWeight.medium}
            ta="right"
            flexShrink={1}
          >
            {value}
          </Text>
        ) : (
          value
        )}
        {suffix}
      </XStack>
    </XStack>
  );
}
