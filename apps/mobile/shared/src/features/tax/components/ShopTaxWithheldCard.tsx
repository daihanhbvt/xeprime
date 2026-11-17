import { useMemo, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isNegativeMoney, isZeroMoney, nowInAppTz } from '@xeprime/domain';
import {
  PERMISSION,
  STATUS_COLOR,
  TAX_WITHHOLDING_STATUS_META,
  type TaxWithholdingStatus,
} from '@xeprime/types';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { SectionHeader } from '@/components/ui/CardTitle';
import { Callout } from '@/components/ui/Callout';
import { MonthPeriodField } from '@/components/ui/MonthPeriodField';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import type { StatCell } from '@/components/ui/StatGrid';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { TAX_PERIOD_FORMAT, type TaxRow } from '@/api/tax/api';
import { useShopTaxSummary } from '../hooks/use-tax';

/**
 * "Thuế đã khấu trừ trong kỳ" — bề mặt của CHỦ XE. Bản native của `ShopTaxWithheldCard`.
 *
 * Vì sao nó tồn tại: thuế được trừ khỏi khoản XePrime phải trả (`D − T`), nên chủ xe nhận ít hơn
 * cọc đúng bằng con số này. Không có khối này thì họ chỉ thấy ví vào một số nhỏ hơn dự kiến và
 * không có chỗ nào giải thích vì sao (ADR 0032 điều 3).
 *
 * Thuộc bộ CƠ BẢN (ADR 0027 điều 1): không gác theo gói. Gói hết hạn cũng không lấy đi quyền biết
 * mình bị trừ bao nhiêu (điều 3).
 *
 * Chỉ gác theo QUYỀN, không gác theo gian hàng đang chọn: `GET /shop/tax/summary` lấy `tenant_id`
 * từ membership ở server (CLAUDE §6.1), nên thêm một điều kiện `tenant` ở client vừa không tăng
 * bảo mật vừa buộc khối này phụ thuộc một hook không khối nào khác trên màn dùng.
 */
export function ShopTaxWithheldCard({
  embedded = false,
  initialPeriod,
}: {
  /**
   * Nằm trong một tấm trượt đã mang tiêu đề (ô ghi chú thuế ở trang Số dư) - web `embedded`:
   * bỏ tiêu đề riêng của thẻ, không lặp cùng một dòng hai lần.
   */
  embedded?: boolean;
  /**
   * Tháng mở sẵn (`YYYY-MM`) — "Chi tiết" ở ô ghi chú thuế trang Quản lý ví mở đúng tháng trang
   * đang xem (web `initialPeriod`, ledger 09 §3.10 #7). Bỏ trống = tháng này.
   */
  initialPeriod?: string;
} = {}) {
  const colors = useColors();
  const t = useTranslations('Finance.taxWithheld');
  const fmt = useAppFormat();
  const { has } = usePermissions();

  const [period, setPeriod] = useState(
    () => initialPeriod ?? nowInAppTz().format(TAX_PERIOD_FORMAT),
  );
  const canView = has(PERMISSION.FINANCE_VIEW);

  const { data, isLoading, isError, error, refetch } = useShopTaxSummary(period, canView);

  const stats = useMemo<readonly StatCell[]>(() => {
    if (!data) return [];
    return [
      {
        key: 'total',
        icon: 'trending-down-outline',
        label: t('stats.total'),
        value: fmt.money(data.totalAmount),
        tone: colors.warning,
        surface: colors.warningSurface,
      },
      // GTGT + TNCN tách riêng theo loại dịch vụ (ADR 0068) — cùng thứ tự các ô của web.
      {
        key: 'vat',
        icon: 'receipt-outline',
        label: t('stats.vat'),
        value: fmt.money(data.totalVatAmount),
        tone: colors.warning,
        surface: colors.warningSurface,
      },
      {
        key: 'pit',
        icon: 'person-outline',
        label: t('stats.pit'),
        value: fmt.money(data.totalPitAmount),
        tone: colors.warning,
        surface: colors.warningSurface,
      },
      // Kỳ trộn dòng cũ không tách: phần còn lại của tổng, để GTGT + TNCN + phần này = tổng.
      ...(isZeroMoney(data.totalUnsplitAmount)
        ? []
        : [
            {
              key: 'unsplit',
              icon: 'layers-outline' as const,
              label: t('stats.unsplit'),
              value: fmt.money(data.totalUnsplitAmount),
              tone: colors.textMuted,
              surface: colors.surfaceMuted,
            },
          ]),
      {
        key: 'base',
        icon: 'calculator-outline',
        label: t('stats.base'),
        value: fmt.money(data.totalTaxableBase),
        tone: colors.info,
        surface: colors.infoSurface,
      },
      {
        key: 'trips',
        icon: 'car-outline',
        label: t('stats.trips'),
        value: fmt.count(data.rows),
        tone: colors.primary,
        surface: colors.primaryLight,
      },
    ];
  }, [colors, data, fmt, t]);

  if (!canView) return null;

  return (
    <YStack gap={space.sm}>
      {embedded ? null : <SectionHeader icon="receipt-outline">{t('title')}</SectionHeader>}

      {/*
        Web: `DatePicker picker="month"` KHÔNG đặt trần ở thẻ này — nên không truyền `maxPeriod`.
        12 kỳ gần nhất là lối tắt; ‹ › tới mọi tháng khác.
      */}
      <MonthPeriodField label={t('period')} value={period} onChange={setPeriod} />

      {/*
        Câu giải thích đứng TRƯỚC con số — y như web. Thuế là khoản duy nhất làm chủ xe nhận ít
        hơn cọc, nên "vì sao" quan trọng hơn "bao nhiêu".
      */}
      <Callout tone="info">{t('explainer')}</Callout>

      {isLoading ? <MiniRowsSkeleton rows={4} /> : null}

      {isError && !data ? (
        <ScreenError error={error} title={t('loadError')} onRetry={() => void refetch()} />
      ) : null}

      {data ? (
        data.rows === 0 ? (
          // Như web (`<Empty description>`): biểu tượng + câu "chưa có", không phải một dòng chữ trơ.
          <ScreenMessage icon="receipt-outline" title={t('empty')} />
        ) : (
          <>
            {/* Lưới 2 cột căn giữa như Figma: nhãn nhỏ trên, số đậm dưới. */}
            <XStack flexWrap="wrap" rowGap={space.md}>
              {stats.map((cell) => (
                <YStack key={cell.key} w="50%" ai="center" gap={2} px={space.xs}>
                  <Text col={colors.textMuted} fos={fontSize.label} ta="center" numberOfLines={2}>
                    {cell.label}
                  </Text>
                  <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.bold} ta="center" numberOfLines={1}>
                    {cell.value}
                  </Text>
                </YStack>
              ))}
            </XStack>

            <YStack gap={space.sm}>
              {data.items.map((row) => (
                <TaxRowLine key={row.id} row={row} />
              ))}
            </YStack>
          </>
        )
      ) : null}
    </YStack>
  );
}

/**
 * Một dòng khấu trừ: mã chuyến + loại thuế bên trái, số tiền + trạng thái bên phải.
 *
 * Năm cột của bảng web gập thành hai cụm — `base` và `percentOf` xuống dòng phụ, vì trên 390dp
 * một hàng năm cột chỉ còn chỗ cho những con số bị cắt.
 *
 * Dòng ÂM là bút toán ĐẢO: nó phải đọc được là ÂM (màu + dấu), không chỉ là một số nhỏ hơn.
 *
 * ⚠️ Màu của dòng âm là **lỗi** (`colors.danger` = `--xp-color-error`), không phải xanh — đúng
 * `TaxSplitAmount .negative` của web. Bản trước tô
 * xanh vì "thuế hoàn lại thì tốt cho chủ xe", nhưng đó là một cách đọc app tự nghĩ ra, và nó đá
 * nhau với chính app: ở sổ ví xanh nghĩa là TIỀN VÀO. Cùng một sắc nói hai điều khác nhau trên hai
 * màn tiền là cách chắc chắn để người dùng đọc sai một con số. Ở bảng kế toán, màu này chỉ có một
 * nghĩa duy nhất: con số này ÂM.
 */
function TaxRowLine({ row }: { row: TaxRow }) {
  const colors = useColors();
  const t = useTranslations('Finance.taxWithheld');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  // Tiền đọc trên CHUỖI, không qua `Number` (ADR 0007).
  const negative = isNegativeMoney(row.amount);
  const statusColor =
    TAX_WITHHOLDING_STATUS_META[row.status as TaxWithholdingStatus]?.color ?? STATUS_COLOR.NEUTRAL;
  const body = { fos: typeScale.body.fontSize, lh: typeScale.body.lineHeight } as const;

  // Thẻ viền như Figma (`24228:98928`): mã + viên trạng thái · giá trị chịu thuế (trái) + số thuế lớn (phải) ·
  // ba cột GTGT / TNCN / Đã khấu trừ (hai sắc thuế riêng - ADR 0068; dòng một-mức cũ không bịa phép tách).
  return (
    <YStack gap={space.sm} p={space.md} br={radius.md} bw={1} bc={colors.border}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.text} {...body} fow={fontWeight.semibold} numberOfLines={1} flexShrink={1}>
          {row.bookingCode}
        </Text>
        <Pill
          label={domainLabel('taxWithholdingStatus', row.status)}
          tone={pillToneOfStatusColor(statusColor)}
        />
      </XStack>

      <XStack ai="flex-end" jc="space-between" gap={space.sm}>
        <YStack f={1} minWidth={0} gap={2}>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('stats.base')}
          </Text>
          <Text col={colors.text} {...body} fow={fontWeight.medium} numberOfLines={1}>
            {fmt.money(row.taxableBase)}
          </Text>
          <Text col={colors.placeholder} fos={fontSize.label}>
            {row.vatPercent != null && row.pitPercent != null
              ? t('ratePair', { vat: row.vatPercent, pit: row.pitPercent })
              : t('percentOf', { percent: row.percent })}
          </Text>
        </YStack>
        <Text col={negative ? colors.danger : colors.text} fos={fontSize.h4} fow={fontWeight.bold} numberOfLines={1} flexShrink={0}>
          {fmt.money(row.amount)}
        </Text>
      </XStack>

      <XStack gap={space.sm} pt={space.sm} borderTopWidth={1} borderTopColor={colors.borderSubtle}>
        <TaxCol label={t('columns.vat')} value={row.vatAmount ?? null} fallback={t('notSplit')} />
        <TaxCol label={t('columns.pit')} value={row.pitAmount ?? null} fallback={t('notSplit')} />
        <TaxCol label={t('stats.total')} value={row.amount} fallback={t('notSplit')} strong />
      </XStack>
    </YStack>
  );
}

function TaxCol({
  label,
  value,
  fallback,
  strong = false,
}: {
  label: string;
  value: string | null;
  fallback: string;
  strong?: boolean;
}) {
  const colors = useColors();
  const fmt = useAppFormat();
  return (
    <YStack f={1} minWidth={0} gap={2}>
      <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
        {label}
      </Text>
      <Text
        col={value != null && isNegativeMoney(value) ? colors.danger : colors.text}
        fos={fontSize.label}
        fow={strong ? fontWeight.bold : fontWeight.medium}
        numberOfLines={1}
      >
        {value == null ? fallback : fmt.money(value)}
      </Text>
    </YStack>
  );
}
