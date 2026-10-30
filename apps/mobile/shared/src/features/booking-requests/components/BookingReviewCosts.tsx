import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  COLLATERAL_MODE,
  FEE_LINE,
  PRICE_ROW,
  type PublicListingDetail,
} from '@xeprime/types';
import { Card } from '@/components/ui/Card';
import { useFeeLineSublabel, type PriceBreakdownFeesInput } from '@/components/ui/PriceBreakdown';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { useCustomerCostView } from '../hooks/use-customer-cost-view';

/** Những mảnh hai thẻ tiền cần — báo giá công khai và bảng kê tạm tính của chuyến đều có đủ. */
export interface ReviewCostsBreakdown {
  rows: ReadonlyArray<{ key: string; label: string; sublabel?: string | null; amount: string }>;
  totalAmount: string;
  depositAmount?: string | null;
  fees?: PriceBreakdownFeesInput | null;
  estimateNote?: string | null;
  longTerm?: {
    packageMonths: number;
    durationDiscountPercent?: number | null;
    durationDiscountAmount: string;
  } | null;
}

/** Một dòng giá NIÊM YẾT — chỉ dùng khi báo giá không về. */
export interface ListedPriceRow {
  key: string;
  label: string;
  amount: string;
  unit: string;
  strikeAmount?: string;
}

/**
 * Hai thẻ tiền "Chi phí thuê xe" + "Các khoản khác" — bản native của `BookingReviewCosts` bên web
 * (develop), dùng ở màn Xem lại và ở các màn chuyến (`surface="trip"`).
 *
 * Mọi con số đến từ báo giá / bảng kê của SERVER; ở đây chỉ chọn dòng (`customer-price-view`) và
 * đặt tên dòng tổng — không cộng trừ. Mọi khoản đi kèm (phí nền tảng, bảo vệ xe, bảo hiểm người)
 * LUÔN hiện để các dòng cộng ra đúng tổng; tiền giữ chỗ chỉ nói MỘT lần, ở thẻ thứ hai.
 */
export function BookingReviewCosts({
  listing,
  breakdown,
  loading,
  isDelivery,
  listedRows,
  promoSlot,
  holdTag,
  emptyNote,
  surface = 'review',
  frozen = false,
  showDeposit = true,
}: {
  listing: PublicListingDetail | null;
  breakdown: ReviewCostsBreakdown | null;
  loading: boolean;
  isDelivery: boolean;
  listedRows: readonly ListedPriceRow[];
  promoSlot?: ReactNode;
  /** Nhãn TRẠNG THÁI của tiền giữ chỗ (chưa cần / cần / đã thanh toán) — chỉ các màn chuyến. */
  holdTag?: ReactNode;
  emptyNote?: string;
  surface?: 'review' | 'trip';
  /**
   * Vẽ dòng cọc thế chấp khi nhận xe. Màn Xem lại tắt nó: cọc đã nằm ở thẻ "Giấy tờ & điều kiện
   * nhận xe" — nói hai lần cùng một khoản là thừa (web #230 `showDeposit`).
   */
  showDeposit?: boolean;
  /** Số đã CHỐT — tổng không còn "dự kiến", không còn câu "giá chốt khi duyệt". */
  frozen?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const tPrice = useTranslations('Common.components.price');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const feeLineSublabel = useFeeLineSublabel();

  const {
    signedMoney,
    fees,
    rentRows,
    feeLines,
    promoDiscount,
    hasPromo,
    longTerm,
    holdAmount,
    payAtPickup,
    deposit: costDeposit,
    total,
    costNote,
  } = useCustomerCostView({ listing, breakdown, isDelivery, frozen });
  const deposit = showDeposit ? costDeposit : null;
  const totalLabel = total?.label ?? '';

  const title = (label: string) => (
    <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold} accessibilityRole="header">
      {label}
    </Text>
  );
  const row = (
    key: string,
    label: string,
    amount: string,
    opts: { sub?: string | null; tone?: 'discount' } = {},
  ) => (
    <XStack key={key} ai="flex-start" jc="space-between" gap={space.sm}>
      <YStack f={1} gap={2}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {label}
        </Text>
        {opts.sub ? (
          <Text col={colors.placeholder} fos={fontSize.label}>
            {opts.sub}
          </Text>
        ) : null}
      </YStack>
      <Text
        col={opts.tone === 'discount' ? colors.danger : colors.text}
        fos={fontSize.bodySm}
        fow={fontWeight.semibold}
      >
        {amount}
      </Text>
    </XStack>
  );
  const note = (text: string) => (
    <Text col={colors.textMuted} fos={fontSize.label}>
      {text}
    </Text>
  );
  const divider = <YStack h={1} bg={colors.borderSubtle} />;

  return (
    <>
      <Card>
        <YStack gap={space.sm}>
          {title(t('reviewPage.costs.title'))}
          {loading ? (
            <YStack gap={space.xs} accessibilityState={{ busy: true }}>
              <Skeleton width="90%" height={13} />
              <Skeleton width="70%" height={13} />
              <Skeleton width="80%" height={13} />
            </YStack>
          ) : breakdown ? (
            <>
              {rentRows.map((r) =>
                row(r.key, r.label, signedMoney(r.amount), {
                  sub: r.sublabel ?? null,
                  ...(r.key === PRICE_ROW.DISCOUNT ? { tone: 'discount' as const } : {}),
                }),
              )}
              {feeLines.map((line) =>
                row(line.key, dl('feeLine', line.key), fmt.money(line.amount), {
                  sub: feeLineSublabel(line) || null,
                }),
              )}
              {/* Ô áp mã (khi có) tự hiện mã + số giảm — dòng chỉ-đọc chỉ khi không có ô. */}
              {!promoSlot && hasPromo
                ? row(FEE_LINE.PROMO, dl('feeLine', FEE_LINE.PROMO), `−${fmt.money(promoDiscount)}`, {
                    sub: fees?.promo?.code ?? null,
                    tone: 'discount',
                  })
                : null}
              {promoSlot}
              {divider}
              <XStack ai="baseline" jc="space-between" gap={space.sm}>
                <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
                  {totalLabel}
                </Text>
                <Text col={colors.primaryHover} fos={fontSize.lead} fow={fontWeight.semibold}>
                  {fmt.money(total?.amount ?? breakdown.totalAmount)}
                </Text>
              </XStack>
              {/* "Tiết kiệm" CHỈ nói về ưu đãi cam kết thời hạn (ADR 0011). */}
              {longTerm?.durationDiscountPercent ? (
                <Text col={colors.success} fos={fontSize.bodySm} fow={fontWeight.bold}>
                  {t('price.savings', {
                    amount: fmt.money(longTerm.durationDiscountAmount),
                    months: longTerm.packageMonths,
                  })}
                </Text>
              ) : null}
              {note(costNote)}
            </>
          ) : listedRows.length > 0 ? (
            <>
              {listedRows.map((r) =>
                row(
                  r.key,
                  r.label,
                  `${r.strikeAmount ? `${fmt.money(r.strikeAmount)} → ` : ''}${fmt.money(r.amount)}${r.unit}`,
                ),
              )}
              {note(t('reviewPage.costs.listedNote'))}
            </>
          ) : (
            note(emptyNote ?? t('price.onRequest'))
          )}
        </YStack>
      </Card>

      {holdAmount || deposit ? (
        <Card>
          <YStack gap={space.sm}>
            {title(t('reviewPage.others.title'))}
            {holdAmount ? (
              <YStack gap={space.xs}>
                {row('hold', tPrice('holdAmount'), fmt.money(holdAmount))}
                {surface === 'trip' && holdTag ? <XStack>{holdTag}</XStack> : null}
                {note(tPrice('holdHint'))}
                {payAtPickup ? row('payAtPickup', tPrice('payAtHandover'), fmt.money(payAtPickup)) : null}
              </YStack>
            ) : null}
            {holdAmount && deposit ? divider : null}
            {deposit ? (
              <YStack gap={space.xs}>
                {row(
                  'deposit',
                  tPrice('deposit'),
                  deposit.mode === COLLATERAL_MODE.CASH && deposit.amount
                    ? fmt.money(deposit.amount)
                    : dl('collateralMode', deposit.mode),
                )}
                {note(deposit.note)}
              </YStack>
            ) : null}
          </YStack>
        </Card>
      ) : null}
    </>
  );
}
