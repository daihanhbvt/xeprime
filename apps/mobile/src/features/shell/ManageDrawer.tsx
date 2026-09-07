import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { usePathname } from 'expo-router';
import { useTranslations } from 'use-intl';
import { FEATURE_STATE, isFeatureVisible, type FeatureState, type PlanFeature } from '@xeprime/types';
import { images } from '@/assets';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { APP_NAME } from '@/lib/app-name';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useFeatureStates } from '@/features/auth/hooks/use-feature';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-authenticated-user';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, sidebar, space } from '@/theme/tokens';
import {
  isManageNavBranch,
  manageNavForScope,
  type ManageNavBadge,
  type ManageNavBranch,
  type ManageNavLeaf,
  type ManageNavNode,
  type ManageNavSection,
} from './manage-nav';
import { useManageDrawer } from './ManageDrawerHost';
import { useManageNavBadges, type ManageNavBadgeCounts } from './use-manage-nav-badges';

const BADGE_MAX = 99;
/** Cùng số đo `.badge` của web: rộng tối thiểu 20, cao 18. */
const BADGE_MIN_WIDTH = 20;
const BADGE_HEIGHT = 18;

/** Ba số đo của thang điều hướng, khai một chỗ — cùng giá trị `--xp-nav-*` của web. */
const NAV_ITEM_HEIGHT = 40;
const NAV_ICON = 18;

/**
 * Khoảng thở giữa hai mục, và giữa khối này với khối kia.
 *
 * Web để mục sát nhau (`margin-block: 2px`) vì sidebar của nó cao 900px và con trỏ chuột trỏ
 * chính xác tới từng dòng. Trên điện thoại thì ngón tay không có độ chính xác đó, và cột chỉ
 * cao bằng màn hình nên nhiều dòng sát nhau đọc thành một khối đặc — nới ra là việc phải làm,
 * không phải sở thích.
 */
const ITEM_GAP = 4;
const SECTION_GAP = space.md;

/** Thụt vào của mục con, đủ để biểu tượng của nó thẳng hàng với CHỮ của mục cha. */
const CHILD_INDENT = NAV_ICON + space.sm;

/** Vạch gold bên trái mục đang mở. Web vẽ bằng `box-shadow: inset 3px` để chữ không lệch. */
const ACTIVE_BAR = 3;

const AVATAR = 36;
const BRAND_LOGO = 32;

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: space.md },
  logo: { width: BRAND_LOGO, height: BRAND_LOGO, borderRadius: radius.sm },
  item: {
    marginHorizontal: space.sm,
    marginVertical: ITEM_GAP / 2,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
});

/** Một nhánh đã lọc quyền: mục cha giữ nguyên, mục con chỉ còn cái được phép. */
interface ResolvedBranch {
  readonly kind: 'branch';
  readonly branch: ManageNavBranch;
  readonly children: readonly ResolvedLeaf[];
}

interface ResolvedLeaf {
  readonly kind: 'leaf';
  readonly leaf: ManageNavLeaf;
  readonly badge: number;
}

type ResolvedNode = ResolvedBranch | ResolvedLeaf;

interface ResolvedSection {
  readonly section: ManageNavSection;
  readonly nodes: readonly ResolvedNode[];
}

/**
 * Sidebar khu quản lý — bản native của sidebar `apps/web`: cùng thứ tự khối, cùng mục, cùng THỨ
 * BẬC HAI TẦNG, cùng quyền, cùng chỗ gắn huy hiệu (`manage-nav.ts` là bản gương của
 * `apps/web/src/constants/nav.ts`).
 *
 * Ba mục cha — "Xe của tôi", "Đơn thuê", "Tài chính" — mở ra mục con: làm phẳng chúng thì hai
 * nền tảng đọc ra hai cấu trúc sản phẩm khác nhau.
 *
 * Màu lấy từ `sidebar` trong `theme/tokens.ts` — bộ RIÊNG cho nền tối, không phải bảng sáng tô
 * tối lại (`colors.textMuted` trên nền này chỉ đạt 2.99:1).
 *
 * Mục CHƯA có màn ở app vẫn HIỆN đúng chỗ và chạm vào báo "đang phát triển" — đúng quy ước
 * `comingSoon` của web; ẩn đi thì người dùng không biết chức năng có tồn tại.
 */
export function ManageDrawer() {
  const t = useTranslations('Navigation');
  const tStates = useTranslations('Common.states');
  const tMore = useTranslations('MobileShell.more');
  const tShell = useTranslations('ManageCommon.shell');
  const insets = useSafeAreaInsets();
  const navigateOnce = useNavigateOnce();
  const pathname = usePathname();
  const toast = useAppToast();
  const user = useAuthenticatedUser();
  const { tenant } = useTenantScope();
  const permissions = usePermissions();
  const featureStates = useFeatureStates();
  const domainLabel = useDomainLabel();
  const badges = useManageNavBadges();
  const drawer = useManageDrawer();

  const sections = useMemo(
    () => resolveSections(Boolean(user.platformRole), permissions.has, featureStates, badges),
    [user.platformRole, permissions, featureStates, badges],
  );

  const [collapsedSections, setCollapsedSections] = useState<Readonly<Record<string, boolean>>>({});
  const [branchOverrides, setBranchOverrides] = useState<Readonly<Record<string, boolean>>>({});

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const toggleBranch = useCallback((key: string) => {
    setBranchOverrides((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const go = useCallback(
    (leaf: ManageNavLeaf) => {
      if (!leaf.href) {
        toast.showInfo(tStates('featureComingSoon'));
        return;
      }
      // Đóng TRƯỚC khi đi: tấm menu còn mở trên màn mới đọc như điều hướng chưa chạy.
      drawer.close();
      navigateOnce(leaf.href);
    },
    [drawer, toast, tStates, navigateOnce],
  );

  const openMore = useCallback(() => {
    drawer.close();
    navigateOnce(ROUTES.manage.more());
  }, [drawer, navigateOnce]);

  const labelOf = useCallback((node: { labelKey: string }) => t(node.labelKey as never), [t]);

  /** Nhãn cho trình đọc màn hình — mang luôn con số, vì huy hiệu bị ẩn khỏi cây truy cập. */
  const a11yLabelOf = useCallback(
    (leaf: ManageNavLeaf, badge: number) =>
      badge > 0 ? `${labelOf(leaf)}, ${tShell('needsAction', { count: badge })}` : labelOf(leaf),
    [labelOf, tShell],
  );

  const roleLabel = user.platformRole
    ? domainLabel('platformRole', user.platformRole)
    : tenant
      ? domainLabel('tenantRole', tenant.roleKey)
      : null;

  return (
    <YStack f={1} bg={sidebar.bg} pt={insets.top} pb={insets.bottom}>
      {/*
        Khối thương hiệu có ĐƯỜNG KẺ DƯỚI, còn giữa các mục thì không.
        Đây là chỗ duy nhất trong cột đáng kẻ: nó ngăn hai thứ khác loại (danh tính gian hàng ↔
        điều hướng). Kẻ giữa từng mục thì nét vẽ đánh nhau với nhãn khối, và vạch cắt ngang cái
        pill của mục đang chọn.
      */}
      <XStack
        ai="center"
        gap={space.sm}
        px={layout.screenX}
        py={space.md}
        borderBottomWidth={1}
        bc={sidebar.border}
      >
        <Image source={images.logo} style={styles.logo} resizeMode="contain" />
        <YStack f={1} gap={1}>
          <Text col={sidebar.text} fos={fontSize.body} fow={fontWeight.bold} numberOfLines={1}>
            {APP_NAME}
          </Text>
          {tenant ? (
            /*
             * Gold + đậm: đây là câu trả lời cho "tôi đang thao tác trên gian hàng NÀO" — câu
             * quan trọng nhất của cả cột với người quản lý nhiều gian hàng, và là thứ phải nhìn
             * thấy trước khi bấm bất cứ mục nào bên dưới.
             */
            <Text
              col={sidebar.active}
              fos={fontSize.bodySm}
              fow={fontWeight.bold}
              numberOfLines={1}
            >
              {tenant.name}
            </Text>
          ) : null}
        </YStack>
      </XStack>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {sections.map(({ section, nodes }) => {
          const sectionOpen = Boolean(section.pinned) || !collapsedSections[section.key];

          return (
            <YStack key={section.key} pb={SECTION_GAP}>
              <SectionHeader
                label={labelOf(section)}
                sectionKey={section.key}
                collapsible={!section.pinned}
                open={sectionOpen}
                onToggle={toggleSection}
              />

              {sectionOpen
                ? nodes.map((node) =>
                    node.kind === 'leaf' ? (
                      <DrawerItem
                        key={node.leaf.key}
                        icon={node.leaf.icon}
                        label={labelOf(node.leaf)}
                        a11yLabel={a11yLabelOf(node.leaf, node.badge)}
                        badge={node.badge}
                        active={isLeafActive(node.leaf, pathname)}
                        indent={0}
                        leaf={node.leaf}
                        onPress={go}
                      />
                    ) : (
                      <Branch
                        key={node.branch.key}
                        node={node}
                        pathname={pathname}
                        open={branchOverrides[node.branch.key] ?? branchHasActive(node, pathname)}
                        labelOf={labelOf}
                        a11yLabelOf={a11yLabelOf}
                        onToggle={toggleBranch}
                        onSelect={go}
                      />
                    ),
                  )
                : null}
            </YStack>
          );
        })}
      </ScrollView>

      {/*
        Thẻ tài khoản dưới chân mở ngăn "Thêm" — đúng chỗ web đặt nó (`ManageUserCard`), và là
        lối duy nhất tới đổi ngôn ngữ / đổi khu. Không có nó thì `manage/more` thành một route
        không ai dẫn tới.
      */}
      <Pressable
        onPress={openMore}
        accessibilityRole="button"
        accessibilityLabel={tMore('title')}
        style={({ pressed }) => (pressed ? { backgroundColor: sidebar.hover } : null)}
      >
        <XStack
          ai="center"
          gap={space.sm}
          px={layout.screenX}
          py={space.sm}
          borderTopWidth={1}
          bc={sidebar.border}
        >
          <YStack
            w={AVATAR}
            h={AVATAR}
            br={radius.pill}
            bg={sidebar.active}
            ai="center"
            jc="center"
          >
            <Text col={colors.onPrimary} fos={fontSize.body} fow={fontWeight.bold}>
              {initialOf(user.displayName)}
            </Text>
          </YStack>

          <YStack f={1} gap={2} ai="flex-start">
            <Text
              col={sidebar.text}
              fos={fontSize.body}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {user.displayName}
            </Text>
            {roleLabel ? (
              // Chip gold ĐẶC + chữ tối: web đo `gold-deep` trên `gold-wash` chỉ 3.68 — trượt AA.
              <YStack px={space.sm} py={1} br={radius.pill} bg={sidebar.active}>
                <Text col={colors.onPrimary} fos={fontSize.label} fow={fontWeight.bold}>
                  {roleLabel}
                </Text>
              </YStack>
            ) : null}
          </YStack>

          <Ionicons name="chevron-up" size={iconSize.sm} color={sidebar.muted} />
        </XStack>
      </Pressable>
    </YStack>
  );
}

/** Chữ cái đầu cho ô đại diện — `Avatar` dùng chung tô nền sáng, lạc hẳn trên sidebar tối. */
function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/**
 * Mục nào đang mở — so bằng đường dẫn HIỆN TẠI, không giữ state riêng.
 *
 * `startsWith` chứ không `===`: đứng ở `/manage/bookings/abc/settlement` thì mục "Đơn thuê" vẫn
 * phải sáng, đúng như breadcrumb của web. `/manage` là ngoại lệ phải so bằng nhau, nếu không nó
 * sáng ở mọi trang con của khu quản lý.
 */
function isLeafActive(leaf: ManageNavLeaf, pathname: string): boolean {
  if (!leaf.href) return false;
  const target = String(leaf.href);
  return target === String(ROUTES.manage.home())
    ? pathname === target
    : pathname.startsWith(target);
}

/** Nhánh có chứa trang đang mở không — dùng để BUNG SẴN nhánh đó, y như `submenu-selected`. */
function branchHasActive(node: ResolvedBranch, pathname: string): boolean {
  return node.children.some((child) => isLeafActive(child.leaf, pathname));
}

function resolveSections(
  isPlatform: boolean,
  has: (permission: ManageNavLeaf['permission']) => boolean,
  featureStates: Partial<Record<PlanFeature, FeatureState>>,
  badges: ManageNavBadgeCounts,
): readonly ResolvedSection[] {
  const badgeOf = (key: ManageNavBadge | undefined) => (key ? badges[key] : 0);

  /*
   * Hai trục độc lập kiểm NỐI TIẾP, đúng `canSeeLeaf` của web (ADR 0027 điều 2): `permission`
   * trả lời "anh là ai", `feature` trả lời "gian hàng này có gì". Cờ vắng trong cache ⇒ coi
   * như `enabled` — xem docblock của `useFeature` về việc vì sao mặc định phải là "cho qua".
   */
  const canSeeLeaf = (leaf: ManageNavLeaf): boolean =>
    has(leaf.permission) &&
    (leaf.feature === undefined ||
      isFeatureVisible(featureStates[leaf.feature] ?? FEATURE_STATE.ENABLED));

  const resolveNode = (node: ManageNavNode): ResolvedNode | null => {
    if (!isManageNavBranch(node)) {
      // Quyền/năng lực chỉ ẨN mục — chặn thật là guard backend (CLAUDE.md mục 6).
      return canSeeLeaf(node) ? { kind: 'leaf', leaf: node, badge: badgeOf(node.badge) } : null;
    }

    /*
     * Mục cha không có quyền riêng: nó sống khi CÒN ÍT NHẤT MỘT mục con được phép.
     * Cho nó một quyền riêng là dựng cửa thứ hai có thể khoá nhầm cả nhánh — web lọc đúng cách
     * này, và nhờ vậy thu hồi một quyền con không bao giờ làm biến mất cả nhánh còn lại.
     */
    const children = node.children
      .filter(canSeeLeaf)
      .map<ResolvedLeaf>((child) => ({ kind: 'leaf', leaf: child, badge: badgeOf(child.badge) }));

    return children.length > 0 ? { kind: 'branch', branch: node, children } : null;
  };

  return manageNavForScope(isPlatform)
    .map((section) => ({
      section,
      nodes: section.children
        .map(resolveNode)
        .filter((node): node is ResolvedNode => node !== null),
    }))
    .filter(({ nodes }) => nodes.length > 0);
}

/**
 * Nhãn khối. Đệm TRÊN lớn hơn đệm dưới — khối cách khối bằng khoảng trắng chứ không bằng đường
 * kẻ, đúng như web: bớt một nét vẽ mà thứ bậc vẫn rõ.
 */
const SectionHeader = memo(function SectionHeader({
  label,
  sectionKey,
  collapsible,
  open,
  onToggle,
}: {
  label: string;
  sectionKey: string;
  collapsible: boolean;
  open: boolean;
  onToggle: (key: string) => void;
}) {
  const row = (
    <XStack ai="center" gap={space.xs} px={layout.screenX} pt={space.sm} pb={space.xs}>
      <Text
        f={1}
        col={sidebar.muted}
        fos={fontSize.label}
        fow={fontWeight.semibold}
        /*
        Nhãn khối viết hoa cần GIÃN CHỮ: chữ hoa cỡ 12 không có phần thân trên/dưới để mắt bám,
        xếp sát nhau nó đọc thành một khối đặc. 0.5 là mức chuẩn cho overline — thêm nữa thì
        tiếng Việt có dấu bị rời ra.
      */
        letterSpacing={0.5}
      >
        {label.toUpperCase()}
      </Text>
      {collapsible ? (
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={iconSize.sm}
          color={sidebar.muted}
        />
      ) : null}
    </XStack>
  );

  if (!collapsible) return row;

  return (
    <Pressable
      onPress={() => onToggle(sectionKey)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={label}
    >
      {row}
    </Pressable>
  );
});

/**
 * Mục cha + các mục con của nó — "Xe của tôi", "Đơn thuê", "Tài chính".
 *
 * Mục cha KHÔNG dẫn đi đâu, chạm vào chỉ bung/gập — đúng như web. Nó sáng CHỮ khi bên trong có
 * trang đang mở, nhưng không lấy nền gold: nền đó thuộc về chính mục con đang mở, hai chỗ cùng
 * tô thì không đọc ra được cái nào là trang hiện tại.
 */
function Branch({
  node,
  pathname,
  open,
  labelOf,
  a11yLabelOf,
  onToggle,
  onSelect,
}: {
  node: ResolvedBranch;
  pathname: string;
  open: boolean;
  labelOf: (node: { labelKey: string }) => string;
  a11yLabelOf: (leaf: ManageNavLeaf, badge: number) => string;
  onToggle: (key: string) => void;
  onSelect: (leaf: ManageNavLeaf) => void;
}) {
  const label = labelOf(node.branch);
  const holdsActive = branchHasActive(node, pathname);

  return (
    <>
      <Pressable
        onPress={() => onToggle(node.branch.key)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.item,
          { backgroundColor: pressed ? sidebar.hover : 'transparent' },
        ]}
      >
        <XStack ai="center" gap={space.sm} px={space.sm} height={NAV_ITEM_HEIGHT}>
          <YStack w={NAV_ICON} ai="center">
            <Ionicons
              name={node.branch.icon}
              size={NAV_ICON}
              color={holdsActive ? sidebar.active : sidebar.text}
            />
          </YStack>
          <Text
            f={1}
            col={sidebar.text}
            fos={fontSize.body}
            fow={holdsActive ? fontWeight.semibold : fontWeight.medium}
            numberOfLines={1}
          >
            {label}
          </Text>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={iconSize.sm}
            color={sidebar.muted}
          />
        </XStack>
      </Pressable>

      {open
        ? node.children.map(({ leaf, badge }) => (
            <DrawerItem
              key={leaf.key}
              icon={leaf.icon}
              label={labelOf(leaf)}
              a11yLabel={a11yLabelOf(leaf, badge)}
              badge={badge}
              active={isLeafActive(leaf, pathname)}
              indent={CHILD_INDENT}
              leaf={leaf}
              onPress={onSelect}
            />
          ))
        : null}
    </>
  );
}

const DrawerItem = memo(function DrawerItem({
  leaf,
  icon,
  label,
  a11yLabel,
  badge,
  active,
  indent,
  onPress,
}: {
  leaf: ManageNavLeaf;
  icon: ManageNavLeaf['icon'];
  label: string;
  a11yLabel: string;
  badge: number;
  active: boolean;
  indent: number;
  onPress: (leaf: ManageNavLeaf) => void;
}) {
  /*
   * MỘT độ sáng cho mọi mục — chỉ mục đang mở là khác, đúng như web (sidebar của nó không đọc cờ
   * `comingSoon`). Làm mờ mục chưa có màn thì nhấn mạnh mang hai nghĩa cùng lúc; "chưa có màn"
   * nói bằng câu trả lời khi chạm, không bằng độ sáng.
   */
  const tint = active ? sidebar.active : sidebar.text;

  return (
    <Pressable
      onPress={() => onPress(leaf)}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      accessibilityLabel={a11yLabel}
      /*
       * Nền đặt ở CHÍNH `Pressable` để có phản hồi lúc chạm.
       *
       * Web có `:hover`; cảm ứng không có hover nên trạng thái `pressed` gánh vai đó — và cần
       * hơn hẳn: bấm một mục "đang phát triển" mà cột đứng im thì người dùng tưởng máy treo và
       * bấm tiếp. `sidebar.hover` là đúng màu web dùng cho việc này.
       */
      style={({ pressed }) => [
        styles.item,
        { backgroundColor: active ? sidebar.selectedBg : pressed ? sidebar.hover : 'transparent' },
      ]}
    >
      <XStack
        ai="center"
        gap={space.sm}
        paddingLeft={space.sm + indent}
        paddingRight={space.sm}
        height={NAV_ITEM_HEIGHT}
      >
        {/*
          Vạch gold vẽ ĐÈ ở vị trí tuyệt đối, không dùng `borderLeftWidth`: border ăn vào bề
          rộng và đẩy chữ lệch 3px so với các mục khác, nên dòng đang chọn không còn thẳng hàng
          với phần còn lại. Web tránh đúng chuyện này bằng `box-shadow: inset`.
        */}
        {active ? (
          <YStack pos="absolute" left={0} top={0} bottom={0} w={ACTIVE_BAR} bg={sidebar.active} />
        ) : null}

        {/* Cột icon rộng CỐ ĐỊNH: glyph Ionicons không cùng bề ngang, để trôi thì nhãn so le. */}
        <YStack w={NAV_ICON} ai="center">
          <Ionicons name={icon} size={NAV_ICON} color={tint} />
        </YStack>

        <Text
          f={1}
          col={active ? sidebar.text : tint}
          fos={fontSize.body}
          fow={active ? fontWeight.semibold : fontWeight.medium}
          numberOfLines={1}
        >
          {label}
        </Text>
        {badge > 0 ? <NavBadge count={badge} /> : null}
      </XStack>
    </Pressable>
  );
});

/**
 * Con số "cần xử lý" — GOLD, không phải đỏ.
 *
 * Cùng lý do web ghi ở `NavBadge.module.css`: đây là việc đang chờ, không phải sự cố. Đỏ là màu
 * của lỗi; dùng nó cho hàng chờ thì lúc có sự cố thật không còn gì để leo thang. Chữ tối trên
 * gold đo được 6.60 — đạt AA, và trùng tông với chip vai trò ở thẻ tài khoản.
 *
 * Ẩn khỏi cây truy cập: tên của mục đã mang sẵn "…, 3 việc cần xử lý", để huy hiệu tự đọc "3"
 * nữa thì trình đọc màn hình nói con số hai lần, lần sau không có ngữ cảnh.
 *
 * Trần 99+ vì quá ba chữ số thì viên huy hiệu dài hơn cả nhãn.
 */
function NavBadge({ count }: { count: number }) {
  return (
    <YStack
      minWidth={BADGE_MIN_WIDTH}
      h={BADGE_HEIGHT}
      px={6}
      br={radius.pill}
      bg={sidebar.active}
      ai="center"
      jc="center"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/*
        `lineHeight` khai TƯỜNG MINH bằng chiều cao viên huy hiệu.
        Mặc định hộp dòng của font cao hơn con số và chừa chỗ cho phần đuôi chữ (g, y) mà chữ số
        không có, nên "1" bị đẩy xuống dưới tâm dù cha đã `jc="center"`. Web né bằng
        `line-height: 1`; RN phải cho số cụ thể.
      */}
      <Text
        col={colors.onPrimary}
        fos={fontSize.label}
        fow={fontWeight.bold}
        lh={BADGE_HEIGHT}
        ta="center"
      >
        {count > BADGE_MAX ? `${BADGE_MAX}+` : count}
      </Text>
    </YStack>
  );
}
