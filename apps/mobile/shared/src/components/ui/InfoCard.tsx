import EditOutlined from '@ant-design/icons-svg/es/asn/EditOutlined';
import type { ReactNode } from 'react';
import { Pressable, type LayoutChangeEvent } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { AntIcon } from '@/components/icons/AntIcon';
import { layout } from '@/theme/layout';
import { useColors, useDarkAccentBorder } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { InfoHint } from './InfoHint';

/** Nút bút chì 40×40 bo 12 của web `.edit` (`InfoCard.module.css`) - nút viền thường của AntD. */
const EDIT_BUTTON = 40;
/** `--xp-line-height-h3` (28) trên cỡ `h3` (18). */
const TITLE_LINE_HEIGHT = 28;
/** Mô tả dài hơn mức này thì gọn vào dấu ⓘ. */
const HINT_INLINE_MAX = 60;
const BODY_LINE_HEIGHT = 20;

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
  children?: ReactNode;
}) {
  const colors = useColors();
  const accent = useDarkAccentBorder();
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
          <XStack ai="center" gap={space.xs}>
            <Text
              flexShrink={1}
              col={colors.text}
              fos={fontSize.h3}
              lineHeight={TITLE_LINE_HEIGHT}
              fow={fontWeight.semibold}
              accessibilityRole="header"
            >
              {title}
            </Text>
            {/* Mô tả dài gọn vào dấu ⓘ cạnh tiêu đề, chạm mở đọc đủ (người dùng 17/11/2026). */}
            {typeof hint === 'string' && hint.length > HINT_INLINE_MAX ? (
              <InfoHint content={hint} label={title} size={fontSize.body} />
            ) : null}
          </XStack>
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

/** Danh sách hàng nhãn ↔ giá trị (khe 12 như `.rows` web). */
export function InfoRows({ children }: { children: ReactNode }) {
  return <YStack gap={12}>{children}</YStack>;
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
