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
import { SummaryRow } from '@/components/ui/SummaryRow';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';

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
export function OwnerPayoutTable({
  payout,
  label,
  variant = 'default',
  summaryOnly = false,
}: {
  payout: OwnerPayout;
  label?: string;
  /**
   * `v2` = "Nhóm thông tin" của tấm duyệt (Figma `24145:96837`): dòng `SummaryRow` cách 12, không
   * vạch đứt, dòng CUỐI là tổng 16/24 xanh. Cùng các dòng, cùng số - chỉ khác hình.
   */
  variant?: 'default' | 'v2';
  /** Chỉ dòng CUỐI (tổng) - thân khối khi thu gọn (Figma `24145:96975`). */
  summaryOnly?: boolean;
}) {
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
  // App: nhãn gọn "Thuế khấu trừ" - mức GTGT/TNCN nằm trong ⓘ (người dùng 20/11/2026).
  const taxLabel = t('tax');

  // v2: số trừ / chữ mờ CÙNG cỡ 14 với các số khác của bảng (người dùng 20/11/2026).
  const valueSize = variant === 'v2' ? typeScale.body.fontSize : fontSize.bodySm;
  const muted = (text: string) => (
    <Text col={colors.placeholder} fos={variant === 'v2' ? typeScale.body.fontSize : fontSize.label}>
      {text}
    </Text>
  );

  const rows: RowSpec[] = [];
  if (payout.unitAmount != null && payout.rentalDays > 0) {
    rows.push({ key: 'unit', label: t('unitPrice'), value: fmt.pricePerDay(payout.unitAmount) });
    rows.push({
      key: 'days',
      label: t('rentalDays'),
      value: t('rentalDaysValue', { count: payout.rentalDays }),
    });
  } else {
    rows.push({
      key: 'rent',
      label:
        payout.rentalDays > 0 ? t('rentForDays', { count: payout.rentalDays }) : t('rentPlain'),
      value: muted(t('variesByDay')),
    });
  }
  rows.push({
    key: 'revenue',
    groupStart: true,
    label: t('revenue'),
    hint: hint(t('revenue'), t('revenueHint')),
    value: fmt.money(payout.rentAmount),
  });
  if (isPositiveMoney(payout.ownerCommissionAmount)) {
    rows.push({
      key: 'commission',
      label: t('commission'),
      hint: hint(
        t('commission'),
        <>
          {hintText(
            tierSummary
              ? t('commissionHintTiers', { tiers: tierSummary })
              : t('commissionHintGeneric'),
          )}
          {hintText(t('commissionHintBody'))}
        </>,
      ),
      value: <DeductedAmount value={payout.ownerCommissionAmount} size={valueSize} />,
    });
  }
  if (showTax) {
    rows.push({
      key: 'tax',
      label: taxLabel,
      hint: hint(
        t('tax'),
        <>
          {/* Chia rõ thuế gồm những gì (người dùng 20/11/2026) - chỉ khi server có đủ số. */}
          {payout.vatPercent != null && payout.pitPercent != null && payout.vatAmount && payout.pitAmount ? (
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {t('taxBreakdown', {
                vat: percent(payout.vatPercent),
                pit: percent(payout.pitPercent),
                vatAmount: fmt.money(payout.vatAmount),
                pitAmount: fmt.money(payout.pitAmount),
              })}
            </Text>
          ) : payout.vatPercent != null && payout.pitPercent != null ? (
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {t('taxRates', { vat: percent(payout.vatPercent), pit: percent(payout.pitPercent) })}
            </Text>
          ) : null}
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
      ),
      value: exempt ? muted(t('taxExempt')) : <DeductedAmount value={payout.taxAmount} size={valueSize} />,
    });
  }
  rows.push({
    key: 'ownerNet',
    groupStart: true,
    strong: true,
    label: t('ownerNet'),
    value: fmt.money(payout.ownerNetAmount),
  });
  if (payout.collectsHold) {
    rows.push({
      key: 'payAtPickup',
      label: t('payAtPickup'),
      hint: hint(t('payAtPickup'), t('payAtPickupHint')),
      value: fmt.money(payout.payAtPickupRentAmount),
    });
    rows.push({
      key: 'walletCredit',
      highlight: true,
      label: t('walletCredit'),
      hint: hint(t('walletCredit'), t('walletCreditHint')),
      value: fmt.money(payout.ownerPayableAmount),
    });
  }

  const shown = summaryOnly ? rows.slice(-1) : rows;

  if (variant === 'v2') {
    return (
      <YStack gap={V2_ROW_GAP} accessibilityLabel={label}>
        {shown.map((row) => {
          const final = row.key === rows[rows.length - 1]?.key;
          const summary = (
            <SummaryRow
              key={row.key}
              label={row.label}
              {...(row.hint ? { labelExtra: row.hint } : {})}
              value={row.value}
              emphasis={final ? 'success' : 'none'}
            />
          );
          // Figma "Lợi nhuận chuyến" `24512:131124`: vạch kẻ liền trước dòng cuối (số cộng ví).
          return final && !summaryOnly && shown.length > 1 ? (
            <YStack key={row.key} gap={V2_ROW_GAP}>
              <YStack h={1} bg={colors.borderSubtle} />
              {summary}
            </YStack>
          ) : (
            summary
          );
        })}
      </YStack>
    );
  }

  return (
    <YStack gap={ROW_GAP} accessibilityLabel={label}>
      {shown.map((row) => (
        <Row
          key={row.key}
          label={row.label}
          {...(row.hint ? { hint: row.hint } : {})}
          value={row.value}
          {...(row.groupStart && !summaryOnly ? { groupStart: true } : {})}
          {...(row.strong ? { strong: true } : {})}
          {...(row.highlight ? { highlight: true } : {})}
        />
      ))}
    </YStack>
  );
}

interface RowSpec {
  key: string;
  label: string;
  hint?: ReactNode;
  value: ReactNode;
  groupStart?: boolean;
  strong?: boolean;
  highlight?: boolean;
}

/** Figma "Vehicle Pricing" v2: các dòng cách 12. */
const V2_ROW_GAP = 12;

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
        <Text flexShrink={1} col={labelColor} fos={fontSize.body} fow={labelWeight}>
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
