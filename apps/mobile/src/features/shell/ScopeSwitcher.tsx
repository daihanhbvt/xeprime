import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { ACCOUNT_TRACK, resolveAccountTrack, tenantUsesManagePortal } from '@xeprime/types';
import { APP_SCOPE, type AppScope } from './app-scope';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedMark } from '@/components/ui/VerifiedMark';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { LogoutRow } from './LogoutRow';
import { useShellScope } from './use-shell-scope';

/** Ảnh đại diện ở khối nhận diện — `size` là đường kính NGOÀI, vòng gold vẽ vào bên trong. */
const AVATAR = 44;

/** Con dấu cạnh tên — nhỏ hơn con dấu trên ảnh, vì nó là phụ chú cho chữ chứ không cho ảnh. */
const NAME_MARK = 16;

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
  const { data: user } = useCurrentUser();
  const tAccount = useTranslations('Account');

  /* Chỉ chủ gian hàng tuyến GÓI được đeo dấu — cùng phép suy với đầu màn Tài khoản & bảo mật. */
  const isShopOwner = resolveAccountTrack(user?.tenant ?? null).track === ACCOUNT_TRACK.SHOP_OWNER;

  const choose = (target: AppScope) => {
    onClose();
    switchTo(target);
  };

  const name = user?.displayName || user?.email || '';

  return (
    <BottomSheet open={open} onClose={onClose} title={t('sheetTitle')} padded={false}>
      <YStack gap={space.md} pb={space.xs}>
        {/*
          Ai đang đăng nhập — câu hỏi đi liền với "tôi đang ở khu nào", và là thứ khiến nút Đăng
          xuất bên dưới có nghĩa. Không có nó thì tấm này mời người dùng đăng xuất mà không nói
          đang đăng xuất khỏi tài khoản nào.
        */}
        {user ? (
          /*
            Hàng TRẦN — không nền, không viền: nó đứng ngay dưới tiêu đề tấm trượt, và một panel
            có viền ở đó đọc ra như một lựa chọn thứ ba bên cạnh hai thẻ chọn khu bên dưới.

            Vòng gold + con dấu chỉ dành cho chủ gian hàng TUYẾN GÓI (ADR 0038) — cùng phép suy
            với đầu màn "Tài khoản & bảo mật". Gắn cho mọi vai là làm dấu mất nghĩa.
          */
          <XStack ai="center" gap={space.sm} px={space.md}>
            <Avatar
              name={name}
              url={user.avatarUrl}
              size={AVATAR}
              {...(isShopOwner ? { verifiedLabel: tAccount('trackBadge.verifiedHint') } : {})}
            />
            <YStack f={1} minWidth={0} gap={2}>
              {/*
                Tên ăn mực ĐEN, con dấu đứng cạnh nó (người dùng chốt 16/09/2026).

                Đây là ngoại lệ có chủ đích với ghi chú ở `Avatar`: con dấu xuất hiện hai lần
                trong cùng một hàng — trên ảnh và cạnh tên. `decorative` cho cái cạnh tên, nên
                trình đọc màn hình vẫn chỉ nghe "đã xác minh" một lần, từ con dấu trên ảnh.
              */}
              <XStack ai="center" gap={space.xs}>
                <Text
                  flexShrink={1}
                  col={colors.text}
                  fos={fontSize.body}
                  fow={fontWeight.bold}
                  numberOfLines={1}
                >
                  {name}
                </Text>
                {isShopOwner ? (
                  <VerifiedMark
                    label={tAccount('trackBadge.verifiedHint')}
                    size={NAME_MARK}
                    decorative
                  />
                ) : null}
              </XStack>
              {user.email ? (
                <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
                  {user.email}
                </Text>
              ) : null}
            </YStack>
          </XStack>
        ) : null}

        <YStack gap={space.sm} px={space.md}>
          {/* Chỉ gian hàng TUYẾN GÓI có khu quản lý — ADR 0038 điều 4, cùng vị từ với `ScopeGuard`. */}
          {tenant && tenantUsesManagePortal(tenant) ? (
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
        </YStack>

        {/*
          ĐĂNG XUẤT đóng tấm này lại. Đây là bề mặt "tôi đang là ai, ở đâu" mà người dùng mở
          nhiều nhất ở khu quản lý (nút danh tính góc trên phải), nên nó cũng là chỗ họ đi tìm
          nút thoát — cùng dòng, cùng luật hỏi lại với menu ở chân drawer.
        */}
        {user ? (
          <YStack>
            <YStack h={1} bg={colors.borderSubtle} />
            <LogoutRow onDone={onClose} />
          </YStack>
        ) : null}
      </YStack>
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
