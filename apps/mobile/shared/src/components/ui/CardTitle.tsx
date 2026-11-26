import { IS_PARTNER_APP } from '@/lib/app-kind';
import { Ionicons } from '@/components/icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { InfoHint } from '@/components/ui/InfoHint';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Tiêu đề thẻ theo phong cách app KHÁCH (`.cardTitle` web: 18 Semibold, icon trong vòng tròn 28 nền
 * vàng nhạt có viền, ⓘ gợi ý cạnh chữ). Chuyển từ `TripRequestCards` sang đây (10/11/2026) để app
 * Partner dùng CÙNG một khuôn tiêu đề thẻ với app khách - người dùng chốt: màn quản lý lấy phong
 * cách hiển thị của app khách, giữ nghiệp vụ của web partner.
 */
export function CardTitle({
  children,
  icon: iconProp,
  hint,
  hintLabel,
}: {
  children: string;
  icon?: IoniconName;
  /** Ghi chú phụ gói vào icon ⓘ cạnh tiêu đề thay vì một dòng chữ riêng — tiết kiệm chỗ dọc. */
  hint?: string;
  /** TÊN của nút ⓘ cho trình đọc màn hình. Thiếu thì dùng tiêu đề thẻ. */
  hintLabel?: string;
}) {
  const colors = useColors();
  // Feedback thiết kế 20/11/2026 (dòng 2 "All Page"): app Partner - tiêu đề khối chỉ chữ, không icon.
  const icon = IS_PARTNER_APP ? undefined : iconProp;
  const text = (
    <Text
      flexShrink={1}
      col={colors.text}
      fos={typeScale.title.fontSize}
      lh={typeScale.title.lineHeight}
      fow={fontWeight.semibold}
      accessibilityRole="header"
    >
      {children}
    </Text>
  );
  const title = hint ? (
    <XStack f={icon ? 1 : undefined} ai="center" gap={space.xs}>
      {text}
      <InfoHint content={hint} label={hintLabel ?? children} />
    </XStack>
  ) : icon ? (
    <YStack f={1}>{text}</YStack>
  ) : (
    text
  );
  if (!icon) return title;
  return (
    <XStack ai="center" gap={space.sm}>
      <YStack
        w={28}
        h={28}
        br={radius.pill}
        ai="center"
        jc="center"
        bw={1}
        bc={colors.primaryMuted}
        bg={colors.primarySubtle}
      >
        <Ionicons name={icon} size={16} color={colors.primary} />
      </YStack>
      {title}
    </XStack>
  );
}

/** Câu dẫn của thẻ — `.cardLead` web (14, `Text/tertiary`). */
export function CardLead({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text col={colors.placeholder} fos={fontSize.bodySm}>
      {children}
    </Text>
  );
}

/**
 * Hàng tiêu đề thẻ = `CardTitle` + ô phải (`action`: liên kết/nút) + thu gọn tuỳ chọn. Thay
 * `BlockTitle` (chữ hoa nhỏ + vạch vàng) ở các màn quản lý đã chuyển sang phong cách app khách.
 * Thu gọn: cả hàng là vùng chạm, mũi tên lật ở mép phải - cùng luật với `BlockTitle`.
 */
export function SectionHeader({
  children,
  icon,
  hint,
  lead,
  action,
  collapsed,
  onToggleCollapsed,
}: {
  children: string;
  icon?: IoniconName;
  hint?: string;
  lead?: ReactNode;
  action?: ReactNode;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const colors = useColors();
  const tActions = useTranslations('Common.actions');
  const collapsible = onToggleCollapsed !== undefined && collapsed !== undefined;
  const row = (
    <XStack ai="center" gap={space.sm}>
      <YStack f={1} minWidth={0}>
        <CardTitle {...(icon ? { icon } : {})} {...(hint ? { hint } : {})}>
          {children}
        </CardTitle>
      </YStack>
      {action}
      {collapsible ? (
        <Ionicons
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={iconSize.sm}
          color={colors.textMuted}
        />
      ) : null}
    </XStack>
  );
  return (
    <YStack gap={space.xs}>
      {collapsible ? (
        <Pressable
          onPress={onToggleCollapsed}
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityLabel={`${children} - ${collapsed ? tActions('expand') : tActions('collapse')}`}
        >
          {row}
        </Pressable>
      ) : (
        row
      )}
      {lead ? <CardLead>{lead}</CardLead> : null}
    </YStack>
  );
}
