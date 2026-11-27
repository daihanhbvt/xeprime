import type { AntIconDefinition } from '@/components/icons/AntIcon';
import { memo, useMemo } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { nowInAppTz } from '@xeprime/domain';
import { LineIcon } from '@/components/icons/LineIcon';
import { InfoGroupCard, type InfoGroupLink } from '@/components/ui/InfoGroupCard';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';

/** Tông ô icon - web `StatTone` (giữ cho nơi ghép thẻ; design v2 không vẽ ô icon). */
export type KpiTone = 'green' | 'blue' | 'gold' | 'red';

/** Một thẻ KPI tháng - dữ liệu thuần, màn ghép rồi đưa cho {@link MonthKpis}. */
export interface KpiCard {
  key: string;
  icon: AntIconDefinition;
  label: string;
  value: string;
  hint?: string;
  /**
   * `undefined` = không có dòng so sánh; `value: null` = "Chưa có số cùng kỳ để so".
   * `previous` = số CÙNG KỲ tháng trước đã định dạng, hiện trong ngoặc ("vs tháng trước (5,3 tr)").
   */
  change?: { value: number | null; unit?: 'percent' | 'points'; previous?: string };
  tone: KpiTone;
  onPress?: () => void;
  /** Đang tải lần đầu - giá trị `…`, ẩn gợi ý và dòng so sánh. */
  loading?: boolean;
}

/**
 * Khối KPI tháng — vẽ theo Figma "Nhóm thông tin" `24175:52446` ("Tháng 11 vs tháng trước" +
 * link "Báo cáo →"): một khung viền bo 12, đệm 12, các ô xếp HAI cột, hàng cách nhau bằng kẻ 1.
 * Mỗi ô: nhãn 10/14 · số 16/24 đậm vừa · mũi tên tròn + % (xanh tốt / đỏ xấu) · "vs tháng trước".
 * Ô không có phép so (xe sẵn sàng, cọc đang giữ) giữ dòng gợi ý của web ở chỗ đó.
 */
export function MonthKpis({
  cards,
  report,
}: {
  cards: readonly KpiCard[];
  /** "Báo cáo →" - chỉ khi người xem có sổ thu chi. */
  report?: InfoGroupLink;
}) {
  const colors = useColors();
  // Chữ nguyên văn Figma "Tháng 11 vs tháng trước" - khoá riêng app (người dùng chốt 20/11/2026).
  const tApp = useTranslations('Dashboard.partnerApp');
  const month = nowInAppTz().month() + 1;
  const rows = useMemo(() => {
    const list: KpiCard[][] = [];
    for (let i = 0; i < cards.length; i += 2) list.push(cards.slice(i, i + 2));
    return list;
  }, [cards]);

  if (cards.length === 0) return null;
  return (
    <InfoGroupCard title={tApp('monthTitle', { month })} {...(report ? { headerLink: report } : {})}>
      <YStack bw={1} bc={colors.border} br={radius.control} p={BOX_PAD} gap={BOX_GAP}>
        {rows.map((row, index) => (
          <YStack key={row.map((card) => card.key).join('|')} gap={BOX_GAP}>
            {index > 0 ? <YStack h={1} br={radius.pill} bg={colors.surfaceMuted} /> : null}
            <XStack ai="flex-start">
              {row.map((card) => (
                <KpiCell key={card.key} card={card} />
              ))}
              {row.length === 1 ? <YStack f={1} /> : null}
            </XStack>
          </YStack>
        ))}
      </YStack>
    </InfoGroupCard>
  );
}

/** Figma "Vehicle Summary": `p 12 · gap 8`. */
const BOX_PAD = 12;
const BOX_GAP = 8;

const KpiCell = memo(function KpiCell({ card }: { card: KpiCard }) {
  const colors = useColors();
  const body = (
    <YStack gap={2}>
      <Text
        col={colors.textMuted}
        fos={typeScale.caption.fontSize}
        lh={typeScale.caption.lineHeight}
        numberOfLines={1}
      >
        {card.label}
      </Text>
      <Text
        col={colors.text}
        fos={typeScale.title.fontSize}
        lh={typeScale.title.lineHeight}
        fow={fontWeight.semibold}
        numberOfLines={1}
      >
        {card.loading ? '…' : card.value}
      </Text>
      {card.loading ? null : card.change ? (
        <ChangeLine change={card.change} />
      ) : card.hint ? (
        <Text
          col={colors.placeholder}
          fos={typeScale.caption.fontSize}
          lh={typeScale.caption.lineHeight}
          numberOfLines={2}
        >
          {card.hint}
        </Text>
      ) : null}
    </YStack>
  );

  const a11y = [card.label, card.value, card.hint].filter(Boolean).join(': ');
  if (!card.onPress) {
    return (
      <YStack f={1} minWidth={0} accessible accessibilityLabel={a11y}>
        {body}
      </YStack>
    );
  }
  return (
    <Pressable
      onPress={card.onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [CELL, pressed ? PRESSED : null]}
    >
      {body}
    </Pressable>
  );
});

const CELL = { flex: 1, minWidth: 0 } as const;
const PRESSED = { opacity: 0.7 } as const;

/**
 * Dòng so sánh cùng kỳ - Figma: mũi tên tròn 12 + "20%" 10/14, dưới là "vs tháng trước (5,3tr)",
 * cả hai cùng màu (xanh tăng · đỏ giảm · xám không đổi). `null` = câu nghiêng "Chưa có số cùng kỳ
 * để so", KHÔNG bao giờ "0%".
 */
function ChangeLine({ change }: { change: NonNullable<KpiCard['change']> }) {
  const colors = useColors();
  const t = useTranslations('Dashboard.change');
  const tApp = useTranslations('Dashboard.partnerApp');
  const { value, unit = 'percent', previous } = change;

  if (value === null) {
    return (
      <Text
        col={colors.placeholder}
        fos={typeScale.caption.fontSize}
        lh={typeScale.caption.lineHeight}
        fontStyle="italic"
      >
        {t('none')}
      </Text>
    );
  }

  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const accent =
    direction === 'up' ? colors.success : direction === 'down' ? colors.danger : colors.textMuted;
  const magnitude = Math.abs(value);
  const amount =
    direction === 'flat'
      ? t('flat')
      : unit === 'points'
        ? t('points', { value: magnitude })
        : t('percent', { value: magnitude });

  return (
    <YStack gap={2}>
      <XStack ai="center" gap={4}>
        {direction === 'flat' ? null : (
          <LineIcon name={direction === 'up' ? 'up-circle' : 'down-circle'} color={accent} size={ICON} />
        )}
        <Text col={accent} fos={typeScale.caption.fontSize} lh={typeScale.caption.lineHeight}>
          {amount}
        </Text>
      </XStack>
      <Text col={accent} fos={typeScale.caption.fontSize} lh={typeScale.caption.lineHeight} numberOfLines={1}>
        {previous ? tApp('vsPrevious', { value: previous }) : tApp('vsPreviousBare')}
      </Text>
    </YStack>
  );
}

/** Figma "Icon / Arrows" 12. */
const ICON = 12;
