import { Text, YStack } from 'tamagui';
import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import { useDomainLabel } from '@/i18n/domain';
import { themed } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { Pill, type PillTone } from './Pill';

/** Tông viên dịch vụ của design v2 (Figma `Status/information` · `pink` · `purple`). */
const SERVICE_PILL_TONE: Readonly<Record<string, PillTone>> = {
  [SERVICE_TYPE.SELF_DRIVE]: 'info',
  [SERVICE_TYPE.WITH_DRIVER]: 'pink',
  [SERVICE_TYPE.LONG_TERM]: 'purple',
};

type Skin = { bg: string; fg: string; border: string };

const useServiceSkins = themed<{ selfDrive: Skin; withDriver: Skin; longTerm: Skin; other: Skin }>(
  (colors) => ({
    selfDrive: { bg: colors.infoSurface, fg: colors.infoStrong, border: colors.infoBorder },
    withDriver: { bg: colors.warningSurface, fg: colors.warningStrong, border: colors.warningBorder },
    longTerm: { bg: colors.pinkSurface, fg: colors.pink, border: colors.pinkBorder },
    other: { bg: colors.neutralSurface, fg: colors.textMuted, border: colors.border },
  }),
);

/**
 * Viên loại dịch vụ trên thẻ đơn / yêu cầu / lịch sử đơn — bản native của `ServiceTypeChip` web
 * (Figma Partner-XePrime 02/11/2026): "Tự lái" xanh dương, "Có tài xế" cam, "Thuê xe dài hạn"
 * hồng, viền cùng sắc. Nhãn đọc từ namespace `Domain` (mã là dữ liệu — ADR 0012).
 */
export function ServiceTypeChip({
  value,
  variant = 'default',
}: {
  value: string;
  /**
   * `v2` — viên dịch vụ của thẻ đơn design v2 (Figma "Rental Request - MB" `_Badge`): bo 16, chữ
   * 14/20, "Tự lái" xanh dương · "Xe có tài xế" hồng · "Thuê xe dài hạn" tím.
   */
  variant?: 'default' | 'v2';
}) {
  const domainLabel = useDomainLabel();
  const skins = useServiceSkins();
  if (variant === 'v2') {
    return (
      <Pill
        label={domainLabel('serviceType', value as ServiceType)}
        tone={SERVICE_PILL_TONE[value] ?? 'neutral'}
        size="lg"
      />
    );
  }
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
      <Text col={skin.fg} fos={fontSize.body} fow={fontWeight.medium} numberOfLines={1}>
        {domainLabel('serviceType', value as ServiceType)}
      </Text>
    </YStack>
  );
}
