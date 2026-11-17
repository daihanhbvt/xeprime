import type { ReactNode } from 'react';
import { ImageBackground, Pressable, StyleSheet } from 'react-native';
import type { Href } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { images } from '@/assets';
import { LineIcon } from '@/components/icons/LineIcon';
import { AppearanceToggle, LocaleToggle } from '@/components/layout/PreferenceToggleRows';
import { Screen } from '@/components/layout/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedMark } from '@/components/ui/VerifiedMark';
import { useAccountIdentityLabel } from '@/features/account/use-account-identity-label';
import { usePartnerAppConfig } from '@/features/app-config/use-partner-app-config';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-authenticated-user';
import { withBranchParam } from '@/features/branches/branch-link';
import { useRememberedBranch } from '@/features/branches/branch-memory';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES, SHOP_SECTION } from '@/navigation/routes';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { ManageNavLeaf } from './manage-nav';
import { drawnLeavesOf, type ResolvedSection } from './manage-menu';
import { LogoutRow } from './LogoutRow';
import { ManageMenuRow, NeedsActionPill, menuLeafLook } from './ManageMenuRow';
import { PARTNER_TRACK, isCommissionOwner, type PartnerTrack } from './partner-track';
import { useManageMenu } from './use-manage-menu';

/*
 * Số đo — Figma Partner-XePrime `Full Menu MB` (`24239:18717`, khung `24182:79018`).
 */
const TITLE_LINE = 32;
/** Thẻ danh tính: avatar 56 + dấu gian hàng 18, tên 18/28 semibold, dòng phụ 14/20. */
const IDENTITY_AVATAR = 56;
const IDENTITY_MARK = 18;
const IDENTITY_NAME_LINE = 28;
const IDENTITY_SUB_LINE = 20;
const IDENTITY_GAP = 10;
const CARD_PAD = 16;
const GROUP_TITLE_LINE = 24;
/** Viền vàng thẻ danh tính (Figma `#e9c336`) — sáng hơn mọi token gold. */
const FIGMA_IDENTITY_BORDER = '#e9c336';
/** `Text/Brand/primary-2` — tên gian hàng trên thẻ danh tính. */
const FIGMA_SHOP_NAME = '#f0b212';
/** Khối Cấu hình và Trợ giúp của cây menu — hai khối mà ô Tài khoản gom (`PARTNER_MENU_TABS`). */
const ACCOUNT_SECTIONS = ['settings', 'support'] as const;

const styles = StyleSheet.create({
  identityTexture: { borderRadius: radius.card, overflow: 'hidden' },
});

/**
 * "TÀI KHOẢN CỦA TÔI" — đích của ô Tài khoản trên thanh menu app Partner (Figma `Full Menu MB`).
 *
 *   Tài khoản của tôi
 *   ┌ [ảnh✓] Tên người · Vai                    › ┐  → Tài khoản & bảo mật
 *   │ Gian hàng                     Tên gian hàng │
 *   └─────────────── nền vân vàng ────────────────┘
 *   ┌ Cấu hình ─ các mục khối `settings` của cây menu ┐
 *   ┌ Trợ giúp ─ các mục khối `support`             ┐
 *   ┌ Hệ thống ─ Giao diện ☀|☾ · Ngôn ngữ VI|EN       ┐
 *              ⇥ Đăng xuất
 *
 * Gộp hai bề mặt cũ: drawer menu (khối Cấu hình, Trợ giúp) và menu hồ sơ ở avatar thanh trên
 * (thẻ danh tính → Tài khoản & bảo mật, Giao diện, Ngôn ngữ, Đăng xuất, "Nâng cấp gian hàng"). Mục
 * và luật ẩn/hiện của hai khối đến NGUYÊN từ `resolveSections` — màn này không tự quyết ai thấy gì.
 *
 * "Quản lý gian hàng" / "Quản lý cho thuê" của menu hồ sơ cũ không thành dòng riêng: chúng là
 * CHÍNH mục đầu khối Cấu hình (Thông tin cửa hàng / Hồ sơ chủ xe — cùng `/manage/shop`).
 */
export function ManageAccountMenuScreen() {
  const colors = useColors();
  const t = useTranslations('Navigation');
  const tMenu = useTranslations('MobileShell.manageMenu');
  const tShell = useTranslations('ManageCommon.shell');
  const tLocale = useTranslations('Common.locale');
  const navigateOnce = useNavigateOnce();
  const rememberedBranch = useRememberedBranch();
  const user = useAuthenticatedUser();
  const { isPlanPromotionEnabled } = usePartnerAppConfig();
  const { track, sections } = useManageMenu();

  const ownerProfile = isCommissionOwner(user);
  const groups = sections.filter(({ section }) =>
    (ACCOUNT_SECTIONS as readonly string[]).includes(section.key),
  );

  const go = (href: Href) => navigateOnce(href);
  const goLeaf = (leaf: ManageNavLeaf) => {
    if (leaf.href) navigateOnce(withBranchParam(leaf.href, rememberedBranch));
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <YStack gap={space.lg} pb={space.lg}>
        <Text col={colors.text} fos={fontSize.h1} lh={TITLE_LINE} fow={fontWeight.bold}>
          {t('public.accountMine')}
        </Text>

        <IdentityCard track={track} onPress={() => go(ROUTES.manage.account())} />

        {/*
          Lời mời nâng cấp lên gian hàng — chỉ CHỦ xe cá nhân và chỉ khi nền tảng bật cờ quảng bá gói
          (app Partner không bán gói theo quy định store; cùng điều kiện với menu hồ sơ cũ).
        */}
        {ownerProfile && isPlanPromotionEnabled ? (
          <UpgradeRow
            label={tShell('upgradeToShop')}
            onPress={() => go(ROUTES.manage.shop({ section: SHOP_SECTION.PLAN }))}
          />
        ) : null}

        {groups.map((group) => (
          <MenuGroup key={group.section.key} title={t(group.section.labelKey as never)}>
            <SectionRows section={group} track={track} onSelect={goLeaf} />
          </MenuGroup>
        ))}

        <MenuGroup title={tMenu('system')}>
          <ManageMenuRow
            icon="palette"
            tone="gray"
            title={t('public.appearance')}
            description={tMenu('appearanceHint')}
            trailing={<AppearanceToggle />}
            first
          />
          <ManageMenuRow
            icon="globe"
            tone="gray"
            title={tLocale('switchLabel')}
            description={tMenu('localeHint')}
            trailing={<LocaleToggle />}
            last
          />
        </MenuGroup>

        <LogoutRow variant="center" onDone={() => undefined} />
      </YStack>
    </Screen>
  );
}

/** Các dòng của một khối menu (Cấu hình / Trợ giúp) — cùng dòng với tấm của thanh tab. */
function SectionRows({
  section,
  track,
  onSelect,
}: {
  section: ResolvedSection;
  track: PartnerTrack;
  onSelect: (leaf: ManageNavLeaf) => void;
}) {
  const t = useTranslations('Navigation');
  const tMenu = useTranslations('MobileShell.manageMenu');
  const tShell = useTranslations('ManageCommon.shell');
  const leaves = drawnLeavesOf(section.nodes);
  return (
    <>
      {leaves.map(({ leaf, badge, urgent }, index) => {
        const look = menuLeafLook(leaf, track);
        const title = t(leaf.labelKey as never);
        return (
          <ManageMenuRow
            key={leaf.key}
            icon={look.icon}
            tone={look.tone}
            title={title}
            description={look.description ? tMenu(`descriptions.${look.description}`) : null}
            trailing={badge > 0 ? <NeedsActionPill count={badge} /> : null}
            a11yLabel={
              badge > 0
                ? `${title}, ${
                    urgent
                      ? tShell('needsActionUrgent', { count: badge })
                      : tShell('needsAction', { count: badge })
                  }`
                : title
            }
            first={index === 0}
            last={index === leaves.length - 1}
            onPress={() => onSelect(leaf)}
          />
        );
      })}
    </>
  );
}

/** Thẻ nhóm — Figma `Nhóm thông tin`: nền trắng, viền `Stroke/gray-low200`, bo 16, đệm 16, khe 12. */
function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <YStack
      bg={colors.surface}
      bw={1}
      bc={colors.border}
      br={radius.card}
      p={CARD_PAD}
      gap={space.md}
      ov="hidden"
    >
      <Text col={colors.text} fos={fontSize.h4} lh={GROUP_TITLE_LINE} fow={fontWeight.semibold}>
        {title}
      </Text>
      <YStack>{children}</YStack>
    </YStack>
  );
}

/**
 * Thẻ danh tính — gian hàng (tuyến gói): nền vân vàng, viền vàng, dòng "Gian hàng · Tên"; chủ xe cá
 * nhân / thành viên: nền xám. Chạm ⇒ Tài khoản & bảo mật (như thẻ đầu menu hồ sơ web).
 *
 * Trên nền vân vàng chữ luôn là mực tối `onPrimary` ở cả hai giao diện — chữ trắng của giao diện tối
 * không đọc được trên vàng nhạt (soát emulator 10/11/2026, menu hồ sơ cũ).
 */
function IdentityCard({ track, onPress }: { track: PartnerTrack; onPress: () => void }) {
  const colors = useColors();
  const pressStyles = usePressStyles();
  const tShell = useTranslations('ManageCommon.shell');
  const user = useAuthenticatedUser();
  const identityLabel = useAccountIdentityLabel();

  const isShop = track === PARTNER_TRACK.PACKAGE;
  const personName = user.displayName || '-';
  const role = identityLabel(user);
  const shopName = user.tenant?.name ?? '';
  const ink = isShop ? colors.onPrimary : colors.text;
  const inkMuted = isShop ? colors.onPrimary : colors.textMuted;
  const mutedOpacity = isShop ? 0.75 : 1;

  const body = (
    <YStack gap={IDENTITY_GAP} p={CARD_PAD}>
      <XStack ai="center" gap={space.md}>
        <YStack>
          <Avatar name={personName} url={user.avatarUrl ?? null} size={IDENTITY_AVATAR} />
          {isShop ? (
            <YStack pos="absolute" right={-2} bottom={-2} br={radius.pill} bg={colors.surface} p={1}>
              <VerifiedMark label={tShell('workspace')} size={IDENTITY_MARK - 2} decorative />
            </YStack>
          ) : null}
        </YStack>
        <YStack f={1} minWidth={0} gap={2}>
          <Text
            col={ink}
            fos={fontSize.h3}
            lh={IDENTITY_NAME_LINE}
            fow={fontWeight.semibold}
            numberOfLines={1}
          >
            {personName}
          </Text>
          {role ? (
            <Text
              col={inkMuted}
              opacity={mutedOpacity}
              fos={fontSize.body}
              lh={IDENTITY_SUB_LINE}
              numberOfLines={1}
            >
              {role}
            </Text>
          ) : null}
        </YStack>
        <LineIcon name="chevron-right" size={20} color={inkMuted} />
      </XStack>
      {isShop && shopName ? (
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text
            col={inkMuted}
            opacity={mutedOpacity}
            fos={fontSize.body}
            lh={IDENTITY_SUB_LINE}
            numberOfLines={1}
          >
            {tShell('workspace')}
          </Text>
          <Text
            f={1}
            ta="right"
            col={FIGMA_SHOP_NAME}
            fos={fontSize.body}
            lh={IDENTITY_SUB_LINE}
            fow={fontWeight.semibold}
            numberOfLines={1}
          >
            {shopName}
          </Text>
        </XStack>
      ) : null}
    </YStack>
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${tShell('account')}: ${personName}${role ? `, ${role}` : ''}`}
      style={({ pressed }) => (pressed ? pressStyles.pressed : null)}
    >
      {isShop ? (
        <ImageBackground
          source={images.shopCardTexture}
          resizeMode="cover"
          style={styles.identityTexture}
        >
          <YStack bw={1} bc={FIGMA_IDENTITY_BORDER} br={radius.card}>
            {body}
          </YStack>
        </ImageBackground>
      ) : (
        <YStack br={radius.card} bg={colors.surfaceMuted} bw={1} bc={colors.borderSubtle}>
          {body}
        </YStack>
      )}
    </Pressable>
  );
}

/** "Nâng cấp gian hàng" — dòng vàng có mũi tên (web `AccountMenuRow accent`). */
function UpgradeRow({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  const pressStyles = usePressStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? pressStyles.pressed : null)}
    >
      <XStack
        ai="center"
        gap={space.sm}
        p={CARD_PAD}
        br={radius.card}
        bw={1}
        bc={colors.primaryBorder}
        bg={colors.primarySubtle}
      >
        <LineIcon name="award" size={20} color={colors.accentText} />
        <Text f={1} col={colors.accentText} fos={fontSize.body} fow={fontWeight.semibold}>
          {label}
        </Text>
        <LineIcon name="arrow-right" size={20} color={colors.accentText} />
      </XStack>
    </Pressable>
  );
}

const usePressStyles = makeStyles(() => ({
  pressed: { opacity: 0.85 },
}));
