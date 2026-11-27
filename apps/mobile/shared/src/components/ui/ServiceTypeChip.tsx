import { Text, YStack } from 'tamagui';
import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import { useDomainLabel } from '@/i18n/domain';
import { themed } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';

type Skin = { bg: string; fg: string; border: string };

const useServiceSkins = themed<{ selfDrive: Skin; withDriver: Skin; longTerm: Skin; other: Skin }>(
  (colors) => ({
    selfDrive: { bg: colors.infoSurface, fg: colors.infoStrong, border: colors.infoBorder },
    withDriver: { bg: colors.pinkSurface, fg: colors.pink, border: colors.pinkBorder },
    longTerm: { bg: colors.purpleSurface, fg: colors.purple, border: colors.purpleBorder },
    other: { bg: colors.neutralSurface, fg: colors.textMuted, border: colors.border },
  }),
);

/**
 * Viên loại dịch vụ trên thẻ đơn / yêu cầu / lịch sử đơn — bản native của `ServiceTypeChip` web
 * (Figma Partner-XePrime): "Tự lái" xanh dương, "Có tài xế" hồng, "Thuê xe dài hạn" tím, viền
 * cùng sắc (người dùng chốt 20/11/2026, web + app cùng bộ màu). Nhãn đọc từ namespace `Domain`
 * (mã là dữ liệu — ADR 0012).
 */
export function ServiceTypeChip({
  value,
  size = 'sm',
}: {
  value: string;
  /** `md` = chữ 14/20 (Figma "_Badge" của thẻ chuyến ở Quản lý ví `24612:145372`). */
  size?: 'sm' | 'md';
}) {
  const type = size === 'md' ? typeScale.body : typeScale.label;
  const domainLabel = useDomainLabel();
  const skins = useServiceSkins();
  const skin =
    value === SERVICE_TYPE.SELF_DRIVE
      ? skins.selfDrive
      : value === SERVICE_TYPE.WITH_DRIVER
        ? skins.withDriver
        : value === SERVICE_TYPE.LONG_TERM
          ? skins.longTerm
          : skins.other;
  return (
    <YStack
      alignSelf="flex-start"
      bg={skin.bg}
      px={space.sm}
      py={2}
      br={radius.card}
      bw={1}
      bc={skin.border}
    >
      {/* CÙNG cỡ viên trạng thái (`Pill` md: chữ 12/18, đệm 2/8) - hai viên đứng cạnh nhau phải đều (20/11/2026). */}
      <Text col={skin.fg} fos={type.fontSize} lh={type.lineHeight} fow={fontWeight.medium} numberOfLines={1}>
        {domainLabel('serviceType', value as ServiceType)}
      </Text>
    </YStack>
  );
}
