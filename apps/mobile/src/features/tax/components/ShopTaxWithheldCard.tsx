import { useMemo, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isNegativeMoney, nowInAppTz } from '@xeprime/domain';
import {
  PERMISSION,
  STATUS_COLOR,
  TAX_WITHHOLDING_STATUS_META,
  type TaxWithholdingStatus,
} from '@xeprime/types';
import { ScreenError } from '@/components/state/ScreenError';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/DataRow';
import { SelectControl } from '@/components/ui/SelectControl';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatGrid, type StatCell } from '@/components/ui/StatGrid';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { TAX_PERIOD_FORMAT, type TaxRow } from '@/api/tax/api';
import { useShopTaxSummary } from '../hooks/use-tax';

/**
 * Số kỳ chọn được trong tấm chọn.
 *
 * Web dùng `DatePicker picker="month"` — một cái lịch tháng vô hạn. Native không có ô đó, và dựng
 * một lịch tháng riêng cho một thẻ là thừa: thứ người ta mở màn thuế để xem là kỳ vừa rồi, còn kỳ
 * của hai năm trước thì đã nằm trong tờ khai đã nộp. Mười hai kỳ gần nhất phủ trọn một năm tài
 * chính, đúng phạm vi người ta còn phải đối chiếu.
 */
const PERIOD_CHOICES = 12;

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
export function ShopTaxWithheldCard() {
  const t = useTranslations('Finance.taxWithheld');
  const fmt = useAppFormat();
  const { has } = usePermissions();

  const [period, setPeriod] = useState(() => nowInAppTz().format(TAX_PERIOD_FORMAT));
  const canView = has(PERMISSION.FINANCE_VIEW);

  const { data, isLoading, isError, error, refetch } = useShopTaxSummary(period, canView);

  const periodOptions = useMemo(() => {
    const now = nowInAppTz();
    return Array.from({ length: PERIOD_CHOICES }, (_, index) => {
      const month = now.subtract(index, 'month');
      return { value: month.format(TAX_PERIOD_FORMAT), label: fmt.monthYear(month.toDate()) };
    });
  }, [fmt]);

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
  }, [data, fmt, t]);

  if (!canView) return null;

  return (
    <YStack gap={space.sm}>
      <BlockTitle>{t('title')}</BlockTitle>

      <SelectControl
        label={t('period')}
        value={period}
        options={periodOptions}
        onChange={setPeriod}
      />

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
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('empty')}
          </Text>
        ) : (
          <>
            <Card padded={false}>
              <StatGrid cells={stats} variant="list" />
            </Card>

            <Card padded={false}>
              <YStack p={space.md} gap={space.sm}>
                {data.items.map((row, index) => (
                  <YStack key={row.id} gap={space.sm}>
                    {index > 0 ? <Divider /> : null}
                    <TaxRowLine row={row} />
                  </YStack>
                ))}
              </YStack>
            </Card>
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
 */
function TaxRowLine({ row }: { row: TaxRow }) {
  const t = useTranslations('Finance.taxWithheld');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  // Tiền đọc trên CHUỖI, không qua `Number` (ADR 0007).
  const negative = isNegativeMoney(row.amount);

  return (
    <XStack ai="flex-start" gap={space.sm}>
      <YStack f={1} minWidth={0} gap={2}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {row.bookingCode}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {row.label}
        </Text>
        <Text col={colors.placeholder} fos={fontSize.label}>
          {fmt.money(row.taxableBase)} · {t('percentOf', { percent: row.percent })}
        </Text>
      </YStack>

      <YStack ai="flex-end" gap={space.xs}>
        <Text
          col={negative ? colors.success : colors.text}
          fos={fontSize.bodySm}
          fow={fontWeight.semibold}
        >
          {fmt.money(row.amount)}
        </Text>
        <StatusBadge
          label={domainLabel('taxWithholdingStatus', row.status)}
          color={
            TAX_WITHHOLDING_STATUS_META[row.status as TaxWithholdingStatus]?.color ??
            STATUS_COLOR.NEUTRAL
          }
          size="sm"
        />
      </YStack>
    </XStack>
  );
}
