import { useCallback, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LineIcon } from '@/components/icons/LineIcon';
import { LinkArrow } from '@/components/ui/LinkArrow';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';

export interface InfoGroupLink {
  label: string;
  onPress: () => void;
}

/**
 * "Nhóm thông tin" của design v2 (Figma `24175:52404`, `24175:52446`…) — khối nội dung chuẩn của
 * app Partner và app khách: nền trắng, viền 1 `stroke/gray-low200`, bo 16, đệm 16, các phần cách 12.
 *
 * Đầu khối: tiêu đề 16/24 đậm vừa bên trái; bên phải là MỘT trong ba thứ - `headerLink` (link chữ
 * + mũi tên, vd "Báo cáo →"), `extra` (chữ mờ 14/20, vd "90 ngày qua") hoặc `headerRight` tự dựng.
 * `subheader` nằm ngay dưới tiêu đề, cách 8 (vd hàng tab gạch chân của "Lịch giao & nhận xe").
 * `footerLink` dồn phải ở chân khối.
 *
 * Không tiêu đề (`title` bỏ trống) thì không vẽ hàng đầu - khối chỉ có thân (vd thẻ hai tab).
 *
 * `collapsible` (Figma tấm duyệt `24145:96810` / `24145:96893`): mũi tên lên/xuống 20 ở cuối hàng
 * đầu, chạm cả hàng để thu/mở; `defaultOpen` mặc định mở. Khi THU, thân thay bằng
 * `collapsedContent` (vd chỉ dòng tổng cuối) - bỏ trống thì chỉ còn hàng đầu.
 */
export function InfoGroupCard({
  title,
  extra,
  headerLink,
  headerRight,
  subheader,
  footerLink,
  accessibilityLabel,
  collapsible = false,
  defaultOpen = true,
  collapsedContent,
  children,
}: {
  title?: string;
  extra?: string;
  headerLink?: InfoGroupLink;
  headerRight?: ReactNode;
  subheader?: ReactNode;
  footerLink?: InfoGroupLink;
  accessibilityLabel?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  collapsedContent?: ReactNode;
  children?: ReactNode;
}) {
  const colors = useColors();
  const tCommon = useTranslations('Common.actions');
  const [open, setOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const hasHeader = Boolean(title || extra || headerLink || headerRight || collapsible);
  const a11yLabel = accessibilityLabel ?? title;
  const expanded = !collapsible || open;

  return (
    <YStack
      bg={colors.surface}
      bw={1}
      bc={colors.border}
      br={radius.card}
      p={PAD}
      gap={GAP}
      ov="hidden"
      {...(a11yLabel ? { accessibilityLabel: a11yLabel } : {})}
    >
      {hasHeader || subheader ? (
        <YStack gap={HEAD_GAP}>
          {hasHeader ? (
            <HeaderPress
              enabled={collapsible}
              onPress={toggle}
              expanded={open}
              label={`${title ?? ''}, ${open ? tCommon('collapse') : tCommon('expand')}`}
            >
            <XStack ai="center" jc="space-between" gap={HEAD_GAP} minHeight={typeScale.title.lineHeight}>
              {title ? (
                <Text
                  f={1}
                  numberOfLines={collapsible ? 1 : undefined}
                  col={colors.text}
                  fos={typeScale.title.fontSize}
                  lh={typeScale.title.lineHeight}
                  fow={fontWeight.semibold}
                  accessibilityRole="header"
                >
                  {title}
                </Text>
              ) : (
                <YStack f={1} />
              )}
              {headerLink ? <LinkArrow label={headerLink.label} onPress={headerLink.onPress} /> : null}
              {extra ? (
                <Text
                  col={colors.textPlaceholder}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  numberOfLines={1}
                >
                  {extra}
                </Text>
              ) : null}
              {headerRight}
              {collapsible ? (
                // Figma "Up 2" xám `text/gray/low`; đóng thì xoay 180 (mũi xuống).
                <YStack style={open ? undefined : ROTATE_DOWN}>
                  <LineIcon name="chevron-up-2" size={CHEVRON} color={colors.placeholder} />
                </YStack>
              ) : null}
            </XStack>
            </HeaderPress>
          ) : null}
          {subheader}
        </YStack>
      ) : null}

      {expanded ? children : collapsedContent}

      {footerLink && expanded ? (
        <XStack jc="flex-end">
          <LinkArrow label={footerLink.label} onPress={footerLink.onPress} />
        </XStack>
      ) : null}
    </YStack>
  );
}

/**
 * Vỏ chạm của hàng đầu khi thu/mở được - `Pressable` của RN (vai "button" trên stack Tamagui không
 * nổi lên cây khả truy cập). Không thu/mở thì trả nguyên con.
 */
function HeaderPress({
  enabled,
  onPress,
  expanded,
  label,
  children,
}: {
  enabled: boolean;
  onPress: () => void;
  expanded: boolean;
  label: string;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={CHEVRON_SLOP}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={label}
    >
      {children}
    </Pressable>
  );
}

/** Figma: `p 16`, `gap 12`, hàng tiêu đề ↔ hàng tab `gap 8`. */
const PAD = 16;
const GAP = 12;
const HEAD_GAP = 8;
/** Figma "Up 2"/"Down 2" trong khung 20. */
const CHEVRON = 20;
const CHEVRON_SLOP = 8;

const ROTATE_DOWN = { transform: [{ rotate: '180deg' }] } as const;
