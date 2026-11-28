import { memo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, typeScale } from '@/theme/tokens';
import { LEGEND_SERVICES, serviceAccent } from '../calendar-tone';

interface LegendItem {
  key: string;
  label: string;
  fill: string;
  /** Viền ô mẫu - chỉ khi Figma vẽ viền ("Giá riêng", "Ngày lễ"). */
  border?: string;
}

/** Figma "Selection Indicator" `24729:83810`: ô 8 bo 2. */
const SWATCH = 8;
const SWATCH_RADIUS = 2;
/** Khoảng cách ô ↔ chữ 6, giữa hai mục 20, giữa hai hàng 4 (Figma `24729:83807`). */
const ITEM_GAP = 6;
const COLUMN_GAP = 20;
const ROW_GAP = 4;

/**
 * Chú giải lịch v2 - Figma Lịch thuê xe "Header MB" (`24729:83807`): ô vuông 8px tô ĐẶC theo dịch
 * vụ + Khoá/Bảo dưỡng · Giá riêng · Ngày lễ, chữ 12/18 `text/gray/medium`, XUỐNG DÒNG (không cuộn
 * ngang). Hai mục ADR 0110 ("Đơn tự khai thác", "Đã thu đủ") Figma không vẽ - người dùng chốt giữ
 * (27/11/2026), vẽ cùng khuôn ô 8px.
 *
 * Màu đi qua `serviceAccent` - đúng hàm thẻ đơn trên lưới dùng, nên chú giải không thể nói một màu
 * khác với lưới.
 */
export const CalendarLegend = memo(function CalendarLegend() {
  const colors = useColors();
  const t = useTranslations('Calendar');

  const items: LegendItem[] = [
    ...LEGEND_SERVICES.map((service) => ({
      key: `service-${service}`,
      label: t(`legend.service.${service}`),
      fill: serviceAccent(service, colors).accent,
    })),
    { key: 'off', label: t('legend.off'), fill: colors.textPlaceholder },
    {
      key: 'customPrice',
      label: t('legend.customPrice'),
      fill: colors.brandLow,
      border: colors.brandIconBg,
    },
    {
      key: 'holiday',
      label: t('legend.holiday'),
      fill: colors.dangerBorder,
      border: colors.danger,
    },
    {
      key: 'direct',
      label: t('legend.direct'),
      fill: colors.surfaceMuted,
      border: colors.borderInput,
    },
    { key: 'paidFull', label: t('legend.paidFull'), fill: colors.success },
  ];

  return (
    <XStack
      flexWrap="wrap"
      columnGap={COLUMN_GAP}
      rowGap={ROW_GAP}
      accessibilityLabel={t('legend.ariaLabel')}
    >
      {items.map((item) => (
        <XStack key={item.key} ai="center" gap={ITEM_GAP}>
          <YStack
            w={SWATCH}
            h={SWATCH}
            br={SWATCH_RADIUS}
            bg={item.fill}
            {...(item.border ? { bw: 1, bc: item.border } : {})}
          />
          <Text
            col={colors.textMuted}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            fow={fontWeight.regular}
          >
            {item.label}
          </Text>
        </XStack>
      ))}
    </XStack>
  );
});
