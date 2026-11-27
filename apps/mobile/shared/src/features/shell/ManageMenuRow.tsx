import { memo, useMemo, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { makeStyles, useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { PARTNER_TRACK, type PartnerTrack } from './partner-track';
import { PartnerMenuIcon, type PartnerMenuIconName } from './PartnerMenuIcon';

/*
 * Số đo của dòng menu — Figma `Filter Categories` (`24175:57765`, `24182:80294`).
 *
 *   [ô icon 36: đệm 8 · bo 12 · icon 20] ·8· tiêu đề 14/20 semibold      [huy hiệu] [› 20]
 *                                            mô tả 12/18 regular
 *
 * Dòng cách dòng bằng đệm dọc 12 + vạch 1px `Stroke/gray-100`.
 */
const TILE_PAD = space.sm;
const TILE_ICON = 20;
const ROW_GAP = space.sm;
const ROW_PAD_Y = 12;
const CHEVRON = 20;
const TITLE_LINE = 20;
const DESCRIPTION_LINE = 18;
/** Huy hiệu "N cần xử lý" — Figma `_Badge`: đệm 8/2, bo 16, chữ 12/18 medium. */
const BADGE_PAD_X = space.sm;
const BADGE_PAD_Y = 2;
const BADGE_RADIUS = 16;
const BADGE_LINE = 18;

/**
 * Bảng TÔNG của ô icon — mỗi mục menu một sắc (Figma Partner-XePrime). Token `@xeprime/ui` khi có
 * đúng sắc đó; giá trị Figma chép nguyên (kèm tên biến Figma) khi token chưa có.
 */
export type MenuTileTone =
  | 'warning'
  | 'orange'
  | 'primary'
  | 'info'
  | 'purple'
  | 'success'
  | 'pink'
  | 'rose'
  | 'gray';

/** `Status/warning-600` — icon "Quản lý ví" (Figma "Menu MB" `24512:134819`). */
const FIGMA_WARNING_ICON = '#dc6803';
/** `Status/orange-low` / `Status/orange-high` — ô "Lịch bảo dưỡng"; token chưa có sắc cam này. */
const FIGMA_ORANGE_TILE = '#fff6ed';
const FIGMA_ORANGE_ICON = '#ec860a';
const FIGMA_ORANGE_TILE_DARK = 'rgba(236, 134, 10, 0.14)';
const FIGMA_ORANGE_ICON_DARK = '#fdb022';
/** `BG/primary-low` + icon vàng đậm `#996f0e` — ô "Danh sách xe". */
const FIGMA_PRIMARY_TILE = '#fff9e5';
const FIGMA_PRIMARY_ICON = '#996f0e';
const FIGMA_PRIMARY_TILE_DARK = 'rgba(233, 195, 54, 0.14)';
const FIGMA_PRIMARY_ICON_DARK = '#f0d073';
/** `Status/information-low` — nền ô "Lịch thuê xe", "Chính sách thuê" (`color-info-bg` là #eff6ff). */
const FIGMA_INFO_TILE = '#ebf6ff';
/** `Status/purple-700` — icon "Khách hàng", "Bảo dưỡng", "Nhân viên" (`color-purple` là #6938ef). */
const FIGMA_PURPLE_ICON = '#5925dc';
/** `Status/rose-low` / `Status/rose-600` — ô "Yêu cầu hỗ trợ"; token chưa có sắc hồng đỏ. */
const FIGMA_ROSE_TILE = '#fff1f3';
const FIGMA_ROSE_ICON = '#e31b54';
/** Bản tối của hai sắc chưa có token: nền 14% sắc gốc, icon sáng hơn một bậc (cùng cách token tối). */
const FIGMA_ROSE_TILE_DARK = 'rgba(227, 27, 84, 0.14)';
const FIGMA_ROSE_ICON_DARK = '#fd6f8e';
const FIGMA_WARNING_ICON_DARK = '#fdb022';
const FIGMA_SUCCESS_ICON_DARK = '#32d583';
/** `Status/error-high700` — chữ huy hiệu "N cần xử lý" (token `color-error` #d92d20 là bậc 600). */
const FIGMA_ERROR_TEXT = '#b42318';
const FIGMA_ERROR_TEXT_DARK = '#fda29b';

interface TileSkin {
  readonly bg: string;
  readonly fg: string;
}

export function useMenuTileTones(): Readonly<Record<MenuTileTone, TileSkin>> {
  const colors = useColors();
  const { scheme } = useAppScheme();
  return useMemo(() => {
    const dark = scheme === 'dark';
    return {
      warning: {
        bg: colors.warningSubtle,
        fg: dark ? FIGMA_WARNING_ICON_DARK : FIGMA_WARNING_ICON,
      },
      orange: {
        bg: dark ? FIGMA_ORANGE_TILE_DARK : FIGMA_ORANGE_TILE,
        fg: dark ? FIGMA_ORANGE_ICON_DARK : FIGMA_ORANGE_ICON,
      },
      primary: {
        bg: dark ? FIGMA_PRIMARY_TILE_DARK : FIGMA_PRIMARY_TILE,
        fg: dark ? FIGMA_PRIMARY_ICON_DARK : FIGMA_PRIMARY_ICON,
      },
      info: { bg: dark ? colors.infoSurface : FIGMA_INFO_TILE, fg: colors.infoStrong },
      purple: { bg: colors.purpleSurface, fg: dark ? colors.purple : FIGMA_PURPLE_ICON },
      success: { bg: colors.successSurface, fg: dark ? FIGMA_SUCCESS_ICON_DARK : colors.success },
      pink: { bg: colors.pinkSurface, fg: colors.pink },
      rose: {
        bg: dark ? FIGMA_ROSE_TILE_DARK : FIGMA_ROSE_TILE,
        fg: dark ? FIGMA_ROSE_ICON_DARK : FIGMA_ROSE_ICON,
      },
      gray: { bg: dark ? colors.surfaceMuted : colors.background, fg: colors.textMuted },
    } as const;
  }, [colors, scheme]);
}

/** Cách VẼ một mục menu: icon + tông ô + khoá câu mô tả (`MobileShell.manageMenu.descriptions`). */
export interface MenuLeafLook {
  readonly icon: PartnerMenuIconName | LineIconName;
  readonly tone: MenuTileTone;
  readonly description: MenuDescriptionKey;
}

export type MenuDescriptionKey =
  | 'bookings'
  | 'calendar'
  | 'customers'
  | 'vehicles'
  | 'drivers'
  | 'maintenance'
  | 'financeOverview'
  | 'balance'
  | 'receipts'
  | 'shop'
  | 'ownerProfile'
  | 'shopPolicies'
  | 'members'
  | 'support'
  | 'hostGuide'
  | 'contractsDocuments'
  | 'dataProtection'
  | 'supportCases';

/**
 * Hình của từng mục — theo `key` của mục trong `PARTNER_NAV`. Chỉ là TRÌNH BÀY: mục nào có, thứ tự,
 * nhãn và ai thấy vẫn do `manage-nav.ts` quyết. Mục của tuyến hoa hồng mang bản `commission` khi
 * cùng trang mà khác vai (Thông tin cửa hàng ↔ Hồ sơ chủ xe — ADR 0085 điều 2).
 *
 * Nguồn: Figma "Menu MB" `24512:134819` (20/11/2026 - bản mới nhất, phủ cả 5 khối; thay các frame
 * khối cũ `24175:57561` · `24238:63687` · `24182:79018`). Các mục riêng tuyến hoa hồng chưa có
 * trong Figma — chọn icon của cây web (`PARTNER_NAV_ICON`) và tông trong cùng bảng.
 */
const LEAF_LOOK: Readonly<
  Record<string, MenuLeafLook & { readonly commission?: Partial<MenuLeafLook> }>
> = {
  bookings: { icon: 'doc-align-left', tone: 'info', description: 'bookings' },
  calendar: { icon: 'calendar-1', tone: 'purple', description: 'calendar' },
  customers: { icon: 'users-group', tone: 'success', description: 'customers' },
  vehicles: { icon: 'car-profile', tone: 'primary', description: 'vehicles' },
  drivers: { icon: 'user-tag', tone: 'info', description: 'drivers' },
  maintenance: { icon: 'setting', tone: 'orange', description: 'maintenance' },
  'finance-overview': { icon: 'chart', tone: 'success', description: 'financeOverview' },
  balance: { icon: 'wallet', tone: 'warning', description: 'balance' },
  receipts: { icon: 'dollar-circle', tone: 'info', description: 'receipts' },
  shop: {
    icon: 'bag',
    tone: 'pink',
    description: 'shop',
    commission: { icon: 'profile', description: 'ownerProfile' },
  },
  'shop-policies': { icon: 'shield-star', tone: 'info', description: 'shopPolicies' },
  members: { icon: 'add-category', tone: 'purple', description: 'members' },
  support: { icon: 'faq', tone: 'success', description: 'support' },
  'host-guide': { icon: 'faq', tone: 'success', description: 'hostGuide' },
  'contracts-documents': { icon: 'doc-right', tone: 'info', description: 'contractsDocuments' },
  'data-protection': { icon: 'shield-star', tone: 'purple', description: 'dataProtection' },
  'support-cases': { icon: 'sms', tone: 'rose', description: 'supportCases' },
};

/** Hình của một mục; mục chưa khai (cây thêm mục mới) rơi về icon của cây + tông xám. */
export function menuLeafLook(
  leaf: { readonly key: string; readonly icon: LineIconName },
  track: PartnerTrack,
): Omit<MenuLeafLook, 'description'> & { readonly description: MenuDescriptionKey | null } {
  const look = LEAF_LOOK[leaf.key];
  if (!look) return { icon: leaf.icon, tone: 'gray', description: null };
  return track === PARTNER_TRACK.COMMISSION && look.commission
    ? { ...look, ...look.commission }
    : look;
}

/**
 * MỘT dòng menu — dùng chung cho tấm danh sách của khối (thanh tab) và các nhóm trên màn "Tài khoản
 * của tôi". `onPress` vắng ⇒ dòng không bấm được (dòng "Giao diện" / "Ngôn ngữ": chỉ nút gạt bên
 * phải bấm được, như web).
 */
/** Lề trong của nền vàng ở dòng đang chọn - dòng giữ nguyên thẳng hàng với các dòng khác. */
const ACTIVE_INSET = 8;

export const ManageMenuRow = memo(function ManageMenuRow({
  icon,
  tone,
  title,
  description,
  trailing,
  a11yLabel,
  first = false,
  last = false,
  active = false,
  onPress,
}: {
  icon: PartnerMenuIconName | LineIconName;
  tone: MenuTileTone;
  title: string;
  description?: string | null;
  /** Huy hiệu hoặc nút gạt bên phải — trước mũi tên. */
  trailing?: ReactNode;
  a11yLabel?: string;
  /** Dòng đầu nhóm: bỏ đệm trên (Figma — nhóm trên màn Tài khoản đã có đệm thẻ 16). */
  first?: boolean;
  /** Dòng cuối: không vạch dưới. */
  last?: boolean;
  /**
   * Mục của TRANG ĐANG MỞ - tên vàng đậm + nền vàng nhạt bo góc (cùng sắc với ô đang chọn của thanh
   * dưới đáy), để mở lại tấm vẫn biết mình đang đứng ở đâu.
   */
  active?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const skin = useMenuTileTones()[tone];

  const row = (
    <XStack
      ai="center"
      gap={ROW_GAP}
      // Dòng đang chọn có nền: luôn đủ đệm dọc để chữ không chạm mép nền.
      pt={first && !active ? 0 : ROW_PAD_Y}
      pb={last && !active ? 0 : ROW_PAD_Y}
      {...(last ? {} : { borderBottomWidth: 1, bc: colors.borderSubtle })}
      {...(active
        ? {
            bg: colors.primarySubtle,
            br: radius.control,
            marginHorizontal: -ACTIVE_INSET,
            paddingHorizontal: ACTIVE_INSET,
          }
        : {})}
    >
      <YStack p={TILE_PAD} br={radius.control} bg={skin.bg}>
        <PartnerMenuIcon name={icon} size={TILE_ICON} color={skin.fg} />
      </YStack>
      <YStack f={1} minWidth={0} gap={2} jc="center">
        <Text
          col={active ? colors.primaryActive : colors.text}
          fos={typeScale.body.fontSize}
          lh={TITLE_LINE}
          fow={fontWeight.semibold}
          numberOfLines={1}
        >
          {title}
        </Text>
        {description ? (
          <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={DESCRIPTION_LINE} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </YStack>
      {trailing}
      {onPress ? <LineIcon name="chevron-right" size={CHEVRON} color={colors.placeholder} /> : null}
    </XStack>
  );

  if (!onPress) return row;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={a11yLabel ?? title}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      {row}
    </Pressable>
  );
});

/**
 * Huy hiệu "N cần xử lý" của mục menu — Figma `_Badge` đỏ (`24175:57771`). Ẩn khỏi cây truy cập:
 * tên của dòng đã mang câu đầy đủ (`needsAction` / `needsActionUrgent`).
 */
/** `flat`: viên của ngăn kéo chức năng (Figma `24512:134819`) - không viền, chữ `Status/error-high`. */
export function NeedsActionPill({ count, flat = false }: { count: number; flat?: boolean }) {
  const colors = useColors();
  const { scheme } = useAppScheme();
  const t = useTranslations('MobileShell.manageMenu');
  return (
    <YStack
      px={BADGE_PAD_X}
      py={BADGE_PAD_Y}
      br={BADGE_RADIUS}
      bg={colors.dangerSurface}
      bw={flat ? 0 : 1}
      bc={colors.dangerBorder}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        col={flat ? colors.danger : scheme === 'dark' ? FIGMA_ERROR_TEXT_DARK : FIGMA_ERROR_TEXT}
        fos={fontSize.label}
        lh={BADGE_LINE}
        fow={fontWeight.medium}
        numberOfLines={1}
      >
        {t('needsAction', { count })}
      </Text>
    </YStack>
  );
}

const useStyles = makeStyles((colors) => ({
  pressed: { backgroundColor: colors.surfaceMuted },
}));
