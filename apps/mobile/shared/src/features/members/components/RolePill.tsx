import { Text, XStack, YStack } from 'tamagui';
import { TENANT_ROLE, type TenantRole } from '@xeprime/types';
import { badgeLineHeight } from '@/components/ui/StatusBadge';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';

type Colors = ReturnType<typeof useColors>;

/** Sắc của MỘT vai (chữ/chấm, nền, viền) - viên vai và chấm vai của màn Vai trò & quyền dùng chung. */
export function roleSkin(colors: Colors, roleKey: string): { fg: string; bg: string; border: string } {
  const skins: Readonly<Record<TenantRole, { fg: string; bg: string; border: string }>> = {
    [TENANT_ROLE.SHOP_OWNER]: { fg: colors.goldOnDark, bg: colors.text, border: colors.text },
    [TENANT_ROLE.SHOP_MANAGER]: {
      fg: colors.infoStrong,
      bg: colors.infoSurface,
      border: colors.infoBorder,
    },
    [TENANT_ROLE.SHOP_STAFF]: {
      fg: colors.warningStrong,
      bg: colors.warningSubtle,
      border: colors.warningBorder,
    },
    [TENANT_ROLE.SHOP_VIEWER]: {
      fg: colors.purple,
      bg: colors.purpleSurface,
      border: colors.purpleBorder,
    },
  };
  return (
    skins[roleKey as TenantRole] ?? {
      fg: colors.textMuted,
      bg: colors.neutralSurface,
      border: colors.border,
    }
  );
}

/** Chấm vai đứng một mình trên nền trắng: vai chủ là chấm ĐEN (viên của nó nền đen, chữ vàng). */
export function roleDotColor(colors: Colors, roleKey: string): string {
  return roleKey === TENANT_ROLE.SHOP_OWNER ? colors.text : roleSkin(colors, roleKey).fg;
}
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';

/**
 * Viên vai trò của màn Nhân viên & phân quyền — bản native của web `RolePill` (Figma `24035:69458`):
 * chấm + nhãn, mỗi vai một sắc, LUÔN có viền (luật chip 28/10/2026).
 *
 * Không đi qua `StatusBadge`: đây là NHÃN VAI, không phải trạng thái nghiệp vụ, và bảng màu của nó
 * (đen cho chủ, tím cho quan sát viên) không có trong `STATUS_COLOR`.
 */
export function RolePill({
  roleKey,
  badge = false,
  compact = false,
}: {
  roleKey: string;
  /** Viên gọn 12/18 medium (thẻ danh sách nhân viên) - mặc định 14/20 như Figma "_Badge" cỡ lớn. */
  compact?: boolean;
  /**
   * Đo theo đúng viên `StatusBadge size="md"` (chữ, hộp dòng, đệm, bo) — để khi đứng cạnh nhãn
   * trạng thái (đầu tấm thông tin nhân viên) hai viên cao bằng nhau.
   */
  badge?: boolean;
}) {
  const colors = useColors();
  const domainLabel = useDomainLabel();

  const skin = roleSkin(colors, roleKey);

  return (
    <XStack
      ai="center"
      alignSelf="flex-start"
      gap={space.xs}
      px={space.sm}
      py={badge ? 0 : 2}
      br={badge ? radius.pill : radius.card}
      bw={1}
      bc={skin.border}
      bg={skin.bg}
    >
      <YStack w={6} h={6} br={3} bg={skin.fg} />
      <Text
        col={skin.fg}
        fos={badge || compact ? fontSize.label : fontSize.body}
        {...(badge ? { lh: badgeLineHeight(fontSize.label) } : compact ? { lh: typeScale.label.lineHeight } : {})}
        fow={badge ? fontWeight.semibold : fontWeight.medium}
        numberOfLines={1}
      >
        {domainLabel('tenantRole', roleKey, roleKey)}
      </Text>
    </XStack>
  );
}
