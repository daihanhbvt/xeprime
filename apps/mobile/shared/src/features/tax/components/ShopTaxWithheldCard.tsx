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
import { Card } from '@/components/ui/Card';
import { MonthPeriodField } from '@/components/ui/MonthPeriodField';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import type { StatCell } from '@/components/ui/StatGrid';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { InfoHint } from '@/components/ui/InfoHint';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
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

  // Như web: "Tháng 11/2026" (`monthValue` với MM/YYYY).
  const [periodYear, periodMonth] = period.split('-');
  const periodText = t('monthValue', { month: `${periodMonth}/${periodYear}` });

  /*
    Câu giải thích: ở trang Ví (nhúng) đứng TRƯỚC con số như web; ở Tổng quan doanh thu đứng CUỐI
    thẻ như Figma (`24228:99290`, người dùng chốt 25/11/2026).
  */
  const explainer = (
    <YStack p={EXPLAINER_PAD} br={radius.control} bg={colors.infoLow}>
      <Text col={colors.infoStrong} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
        {t('explainer')}
      </Text>
    </YStack>
  );

  const content = (
    <>
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
            {/* Figma `24228:99211`: ô xám đệm 8 bo 8, lưới 2 cột căn giữa - nhãn 12 trên, số 14 đậm vừa dưới. */}
            <XStack flexWrap="wrap" rowGap={GRID_ROW_GAP} p={BOX_PAD} br={BOX_RADIUS} bg={colors.background}>
              {stats.map((cell) => (
                <YStack key={cell.key} w="50%" ai="center" gap={2} px={space.xs}>
                  <Text
                    col={colors.textMuted}
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    ta="center"
                    numberOfLines={1}
                  >
                    {cell.label}
                  </Text>
                  <Text
                    col={colors.text}
                    fos={typeScale.body.fontSize}
                    lh={typeScale.body.lineHeight}
                    fow={fontWeight.semibold}
                    ta="center"
                    numberOfLines={1}
                  >
                    {cell.value}
                  </Text>
                </YStack>
              ))}
            </XStack>

            {data.items.map((row) => (
              <TaxRowLine key={row.id} row={row} />
            ))}
          </>
        )
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <YStack gap={space.sm}>
        {/*
          Web: `DatePicker picker="month"` KHÔNG đặt trần ở thẻ này — nên không truyền `maxPeriod`.
          12 kỳ gần nhất là lối tắt; ‹ › tới mọi tháng khác.
        */}
        <MonthPeriodField label={t('period')} value={period} onChange={setPeriod} />
        {explainer}
        {content}
      </YStack>
    );
  }

  return (
    <Card lift="flat">
      <YStack gap={CARD_GAP}>
        <SectionHeader>{t('title')}</SectionHeader>
        {/*
          Bộ lọc tháng như WEBSITE (người dùng 26/11/2026, không theo Figma): `DatePicker picker="month"`
          nhãn "Tháng MM/YYYY", ở khổ ≤640 xuống hàng rộng hết khổ dưới tiêu đề.
        */}
        <MonthPeriodField
          variant="select"
          label={t('period')}
          value={period}
          display={periodText}
          onChange={setPeriod}
        />
        {content}
        {explainer}
      </YStack>
    </Card>
  );
}

/** Figma "Thuế đã khấu trừ" (`24228:99209`): khoảng 12 trong thẻ, ô xám đệm 8 bo 8, giải thích đệm 16. */
const CARD_GAP = 12;
const GRID_ROW_GAP = 12;
const BOX_PAD = 8;
const BOX_RADIUS = 8;
const EXPLAINER_PAD = 16;
/** Thẻ một dòng khấu trừ: viền, bo 12, đệm 12, khoảng 4. */
const ROW_PAD = 12;
const ROW_GAP = 4;
const INFO_GAP = 4;

/**
 * Một dòng khấu trừ (Figma `24228:99230`): mã + viên trạng thái · "Giá trị chịu thuế" + mức thuế
 * (trái) và giá trị chịu thuế (phải) · ô xám ba cột GTGT / TNCN / Đã khấu trừ.
 *
 * Dòng ÂM là bút toán ĐẢO: nó phải đọc được là ÂM (màu + dấu), không chỉ là một số nhỏ hơn.
 *
 * ⚠️ Màu của dòng âm là **lỗi** (`colors.danger` = `--xp-color-error`), không phải xanh — đúng
 * `TaxSplitAmount .negative` của web. Ở sổ ví xanh nghĩa là TIỀN VÀO; ở bảng kế toán màu này chỉ
 * có một nghĩa: con số này ÂM.
 */
function TaxRowLine({ row }: { row: TaxRow }) {
  const colors = useColors();
  const t = useTranslations('Finance.taxWithheld');
  // Dòng cũ (trước ADR 0068) không có GTGT/TNCN riêng: hiện "-" - chỉ là cách HIỂN THỊ, dữ liệu và tổng không đổi (người dùng 26/11/2026).
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const statusColor =
    TAX_WITHHOLDING_STATUS_META[row.status as TaxWithholdingStatus]?.color ?? STATUS_COLOR.NEUTRAL;

  return (
    <YStack gap={ROW_GAP} p={ROW_PAD} br={radius.control} bw={1} bc={colors.border}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text
          col={colors.text}
          fos={typeScale.label.fontSize}
          lh={typeScale.label.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
          flexShrink={1}
        >
          {row.bookingCode}
        </Text>
        <Pill
          label={domainLabel('taxWithholdingStatus', row.status)}
          tone={pillToneOfStatusColor(statusColor)}
        />
      </XStack>

      <XStack ai="center" jc="space-between" gap={space.md}>
        <YStack f={1} minWidth={0} gap={2}>
          {/* Figma `24692:87870`: ⓘ 16 cạnh nhãn, khoảng 4 - chạm xem "Loại thuế" (cột `label` của bảng web). */}
          <XStack ai="center" gap={INFO_GAP}>
            <Text col={colors.text} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1} flexShrink={1}>
              {t('stats.base')}
            </Text>
            <InfoHint lineIcon="info-circle-16" label={t('columns.label')} content={row.label} />
          </XStack>
          <Text col={colors.textMuted} fos={typeScale.caption.fontSize} lh={typeScale.caption.lineHeight} numberOfLines={1}>
            {row.vatPercent != null && row.pitPercent != null
              ? t('ratePair', { vat: row.vatPercent, pit: row.pitPercent })
              : t('percentOf', { percent: row.percent })}
          </Text>
        </YStack>
        <Text
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.medium}
          numberOfLines={1}
          flexShrink={0}
        >
          {fmt.money(row.taxableBase)}
        </Text>
      </XStack>

      <XStack gap={space.sm} p={BOX_PAD} br={BOX_RADIUS} bg={colors.background}>
        <TaxCol label={t('columns.vat')} value={row.vatAmount ?? null} fallback={tLabels('emptyValue')} />
        <TaxCol label={t('columns.pit')} value={row.pitAmount ?? null} fallback={tLabels('emptyValue')} />
        <TaxCol label={t('columns.amount')} value={row.amount} fallback={tLabels('emptyValue')} />
      </XStack>
    </YStack>
  );
}

function TaxCol({
  label,
  value,
  fallback,
}: {
  label: string;
  value: string | null;
  fallback: string;
}) {
  const colors = useColors();
  const fmt = useAppFormat();
  return (
    <YStack f={1} minWidth={0}>
      <Text col={colors.textMuted} fos={typeScale.caption.fontSize} lh={typeScale.caption.lineHeight} numberOfLines={1}>
        {label}
      </Text>
      <Text
        col={value != null && isNegativeMoney(value) ? colors.danger : colors.text}
        fos={typeScale.label.fontSize}
        lh={typeScale.label.lineHeight}
        fow={fontWeight.semibold}
        numberOfLines={1}
      >
        {value == null ? fallback : fmt.money(value)}
      </Text>
    </YStack>
  );
}
