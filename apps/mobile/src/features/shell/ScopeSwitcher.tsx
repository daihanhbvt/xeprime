import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { APP_SCOPE, type AppScope } from './app-scope';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { useShellScope } from './use-shell-scope';

/**
 * Nút danh tính gian hàng ở góc TRÊN PHẢI header khu quản lý — cùng chỗ web đặt nó, vì đó là
 * chỗ người dùng đã học được là "tôi đang ở tư cách nào".
 *
 * Ẩn chứ không disable khi chưa có dữ liệu gian hàng: một nút xám không giải thích được vì sao
 * nó xám.
 */
export function ScopeSwitcherButton({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('MobileShell.scope');
  const { tenant, isLoading } = useTenantScope();
  const [open, setOpen] = useState(false);

  if (isLoading || !tenant) return null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('switcherA11y', { shop: tenant.name })}
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
      >
        <XStack
          ai="center"
          jc="center"
          gap={space.xs}
          bg={colors.surfaceMuted}
          bw={1}
          bc={colors.border}
          br={radius.pill}
          px={compact ? 0 : space.sm}
          w={compact ? sizing.touchTarget : undefined}
          minHeight={sizing.touchTarget}
          maxWidth={compact ? sizing.touchTarget : 180}
        >
          <Ionicons name="storefront-outline" size={iconSize.sm} color={colors.text} />
          {compact ? (
            <YStack
              pos="absolute"
              right={space.xs}
              bottom={space.xs}
              w={iconSize.sm}
              h={iconSize.sm}
              br={radius.pill}
              bg={colors.primary}
              ai="center"
              jc="center"
            >
              <Ionicons name="chevron-down" size={iconSize.xs} color={colors.onPrimary} />
            </YStack>
          ) : (
            <>
              <Text
                f={1}
                col={colors.text}
                fos={fontSize.bodySm}
                fow={fontWeight.medium}
                numberOfLines={1}
              >
                {tenant.name}
              </Text>
              <Ionicons name="chevron-down" size={iconSize.xs} color={colors.textMuted} />
            </>
          )}
        </XStack>
      </Pressable>

      <ScopeSwitcherSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Tấm chọn khu.
 *
 * Bottom sheet chứ không phải dropdown vì hai lý do: nó nằm trong tầm ngón cái, và nó là chỗ mở
 * rộng thành N gian hàng mà không phải thiết kế lại (doc 15 §4.2 — hiện `/auth/me` chỉ trả MỘT
 * tenant nên danh sách đúng một dòng).
 *
 * Không có hộp xác nhận: thao tác đảo ngược được bằng đúng một chạm ở phía bên kia.
 */
export function ScopeSwitcherSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('MobileShell.scope');
  const domainLabel = useDomainLabel();
  const { tenant } = useTenantScope();
  const { scope, switchTo } = useShellScope();

  const choose = (target: AppScope) => {
    onClose();
    switchTo(target);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t('sheetTitle')}>
      {tenant ? (
        <ScopeOption
          icon="storefront-outline"
          title={tenant.name}
          subtitle={t('manageSubtitle', { role: domainLabel('tenantRole', tenant.roleKey) })}
          selected={scope === APP_SCOPE.MANAGE}
          onPress={() => choose(APP_SCOPE.MANAGE)}
        />
      ) : null}

      <ScopeOption
        icon="search-outline"
        title={t('customerTitle')}
        subtitle={t('customerSubtitle')}
        selected={scope === APP_SCOPE.CUSTOMER}
        onPress={() => choose(APP_SCOPE.CUSTOMER)}
      />
    </BottomSheet>
  );
}

function ScopeOption({
  icon,
  title,
  subtitle,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      <XStack
        ai="center"
        gap={space.md}
        p={space.md}
        br={radius.lg}
        bw={1}
        bg={selected ? colors.surfaceSelected : colors.surface}
        bc={selected ? colors.primary : colors.border}
        minHeight={sizing.touchTarget}
      >
        <Ionicons name={icon} size={iconSize.lg} color={colors.text} />
        <YStack f={1} gap={2}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={1}>
            {title}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
            {subtitle}
          </Text>
        </YStack>
        {selected ? (
          <Ionicons name="checkmark-circle" size={iconSize.lg} color={colors.primaryActive} />
        ) : null}
      </XStack>
    </Pressable>
  );
}
