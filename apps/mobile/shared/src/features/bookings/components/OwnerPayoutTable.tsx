import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isPositiveMoney, LEGAL_DOC } from '@xeprime/domain';
import { TAX_EXEMPT_REASON, type components } from '@xeprime/types';
import { DeductedAmount } from '@/components/ui/DeductedAmount';
import { InfoHint } from '@/components/ui/InfoHint';
import { useCommissionTierSummary } from '@/features/fee-policies/use-commission-tier-summary';
import { useOpenLegalDoc } from '@/features/legal/use-open-legal-doc';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { DashedDivider } from '@/components/ui/DashedDivider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

export type OwnerPayout = components['schemas']['OwnerPayoutDto'];

/** `--xp-space-2` — khoảng giữa các hàng của bảng (thang native không có bậc 2 riêng). */
const ROW_GAP = 2;

/**
 * BẢNG CỘNG VÍ CHỦ XE (ADR 0068 điều 5) — bản native của `OwnerPayoutTable` web. MỘT khối cho tấm
 * duyệt yêu cầu và chi tiết đơn:
 *
 *     Đơn giá thuê · Số ngày thuê
 *     Doanh thu cho thuê xe          R
 *     Phí dịch vụ – Chủ xe (i)      −H     ← ẩn khi H = 0
 *     Thuế khấu trừ (i)             −T     ← doanh nghiệp: "Không khấu trừ"
 *     Thu nhập chủ xe (a)            R − H − T
 *     Khách thanh toán trực tiếp (b) R − D − H
 *     Số tiền cộng ví (a − b)        D − T
 *
 * Chỉ HIỆN số server dựng — client không cộng trừ, không làm tròn (ADR 0069). Chỉ ở phía đối tác.
 * `collectsHold = false` thì không có khoản nào qua XePrime nên (b) và (a − b) ẩn.
 */
export function OwnerPayoutTable({ payout, label }: { payout: OwnerPayout; label?: string }) {
  const colors = useColors();
  const t = useTranslations('Bookings.ownerPayout');
  const fmt = useAppFormat();
  const openDoc = useOpenLegalDoc();
  const percent = (value: number) => fmt.measure(value);
  const commissionTierSummary = useCommissionTierSummary();
  // Nấc của chính sách ĐÃ ĐÓNG BĂNG cùng chuyến; không có (snapshot cũ) ⇒ câu chung, không số.
  const tierSummary = payout.commissionTiers?.length
    ? commissionTierSummary(payout.commissionTiers)
    : '';

  const hint = (item: string, content: ReactNode) => (
    <InfoHint label={t('hintLabel', { item })} content={content} />
  );
  const hintText = (text: string) => (
    <Text col={colors.text} fos={fontSize.body}>
      {text}
    </Text>
  );

  const exempt = payout.taxExemptReason === TAX_EXEMPT_REASON.COMPANY;
  const showTax = exempt || isPositiveMoney(payout.taxAmount);
  const taxLabel =
    payout.vatPercent != null && payout.pitPercent != null
      ? t('taxSplit', { vat: percent(payout.vatPercent), pit: percent(payout.pitPercent) })
      : payout.taxTotalPercent != null && !exempt
        ? t('taxCombined', { percent: percent(payout.taxTotalPercent) })
        : t('tax');

  const muted = (text: string) => (
    <Text col={colors.placeholder} fos={fontSize.bodySm}>
      {text}
    </Text>
  );

  return (
    <YStack gap={ROW_GAP} accessibilityLabel={label}>
      {payout.unitAmount != null ? (
        <>
          <Row label={t('unitPrice')} value={fmt.pricePerDay(payout.unitAmount)} />
          <Row label={t('rentalDays')} value={t('rentalDaysValue', { count: payout.rentalDays })} />
        </>
      ) : (
        <Row label={t('rentForDays', { count: payout.rentalDays })} value={muted(t('variesByDay'))} />
      )}

      <Row
        groupStart
        label={t('revenue')}
        hint={hint(t('revenue'), t('revenueHint'))}
        value={fmt.money(payout.rentAmount)}
      />
      {isPositiveMoney(payout.ownerCommissionAmount) ? (
        <Row
          label={t('commission')}
          hint={hint(
            t('commission'),
            <>
              {hintText(
                tierSummary
                  ? t('commissionHintTiers', { tiers: tierSummary })
                  : t('commissionHintGeneric'),
              )}
              {hintText(t('commissionHintBody'))}
            </>,
          )}
          value={<DeductedAmount value={payout.ownerCommissionAmount} />}
        />
      ) : null}
      {showTax ? (
        <Row
          label={taxLabel}
          hint={hint(
            t('tax'),
            <>
              {hintText(t('taxHint'))}
              <Text
                col={colors.text}
                fos={fontSize.body}
                fow={fontWeight.semibold}
                textDecorationLine="underline"
                onPress={() => openDoc(LEGAL_DOC.OWNER_TAX)}
                accessibilityRole="link"
              >
                {t('taxPolicyLink')}
              </Text>
            </>,
          )}
          value={exempt ? muted(t('taxExempt')) : <DeductedAmount value={payout.taxAmount} />}
        />
      ) : null}

      <Row groupStart strong label={t('ownerNet')} value={fmt.money(payout.ownerNetAmount)} />
      {payout.collectsHold ? (
        <>
          <Row
            label={t('payAtPickup')}
            hint={hint(t('payAtPickup'), t('payAtPickupHint'))}
            value={fmt.money(payout.payAtPickupRentAmount)}
          />
          <Row
            highlight
            label={t('walletCredit')}
            hint={hint(t('walletCredit'), t('walletCreditHint'))}
            value={fmt.money(payout.ownerPayableAmount)}
          />
        </>
      ) : null}
    </YStack>
  );
}

/** Một cặp nhãn–giá trị; `groupStart` kẻ đường đứt phía trên như hai vạch "───" của đặc tả. */
function Row({
  label,
  hint,
  value,
  groupStart,
  strong,
  highlight,
}: {
  label: string;
  hint?: ReactNode;
  value: ReactNode;
  groupStart?: boolean;
  strong?: boolean;
  highlight?: boolean;
}) {
  const colors = useColors();
  const emphasis = strong || highlight;
  const labelColor = emphasis ? colors.text : colors.textMuted;
  const labelWeight = highlight
    ? fontWeight.bold
    : strong
      ? fontWeight.semibold
      : fontWeight.regular;

  const row = (
    <XStack
      ai="baseline"
      jc="space-between"
      gap={space.sm}
      {...(highlight
        ? {
            mt: ROW_GAP,
            px: space.sm,
            py: space.xs,
            br: radius.sm,
            bg: colors.primarySubtle,
          }
        : null)}
    >
      <XStack f={1} minWidth={0} ai="center" gap={space.xs}>
        <Text flexShrink={1} col={labelColor} fos={fontSize.bodySm} fow={labelWeight}>
          {label}
        </Text>
        {hint}
      </XStack>
      {typeof value === 'string' ? (
        <Text
          col={highlight ? colors.price : colors.text}
          fos={highlight ? fontSize.body : fontSize.bodySm}
          fow={labelWeight}
          ta="right"
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </XStack>
  );

  if (!groupStart) return row;
  /*
   * `.groupStart` web: vạch `1px dashed border` phía trên, đệm xs. Vạch dựng bằng `DashedDivider` —
   * `borderStyle: 'dashed'` chỉ ở cạnh trên thì RN (iOS) vẽ ra nét liền.
   */
  return (
    <YStack gap={space.xs}>
      <DashedDivider color={colors.border} />
      {row}
    </YStack>
  );
}
