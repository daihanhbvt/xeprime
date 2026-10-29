import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DEPOSIT_STATUS,
  DEPOSIT_STATUS_META,
  FEE_BEARER,
  FEE_LINE,
  HOLD_REFUND_STATUS,
  PRICE_ROW,
  hasDepositToShow,
  type DepositStatus,
} from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { DataRow, Divider } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { Button } from '@/components/ui/Button';
import type { CustomerTripDetail, CustomerTripFinance } from '../api';
import { RefundAccountSheet } from './RefundAccountSheet';
import { TripRequestPill, type TripRequestTone } from './TripRequestCards';

/**
 * Hoá đơn + tiền cọc, phía KHÁCH.
 *
 * Toàn bộ con số đã được server tính (`CustomerTripFinanceDto`); ở đây KHÔNG có một phép cộng
 * trừ nào — đó là điều kiện để hoá đơn khách nhìn và sổ của chủ xe không bao giờ lệch
 * (`apps/api/src/common/booking-money.ts` là định nghĩa duy nhất).
 *
 * Không có nút nào: phụ phí do chủ xe ghi, hoàn cọc do chủ xe thực hiện bên ngoài rồi đánh dấu
 * — khách đọc, không duyệt (ADR 0013 · ADR 0014).
 */
export function TripFinanceCard({
  finance,
  closed,
  settlement,
}: {
  finance: CustomerTripFinance;
  /** Chuyến đã khép: hiện hoá đơn dịch vụ cuối (`ClosedInvoice`) thay cho bảng giá dự kiến. */
  closed: boolean;
  /**
   * Chuyến đã khép: khoản giữ chỗ + khoản hoàn GỘP vào hoá đơn (thay thẻ `TripHoldPanel` riêng) —
   * như web. `completed` quyết nhãn trạng thái khi không có khoản hoàn.
   */
  settlement?: ClosedSettlement;
}) {
  if (closed) return <ClosedInvoice finance={finance} settlement={settlement} />;
  return <OpenFinanceCard finance={finance} />;
}

function OpenFinanceCard({ finance }: { finance: CustomerTripFinance }) {
  const colors = useColors();
  const t = useTranslations('Trips.finance');
  const tPrice = useTranslations('Common.components.price');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();

  const depositStatus = finance.depositStatus as DepositStatus;
  /*
   * Kế hoạch trả tiền của chuyến ĐÃ CỌC nằm NGAY trong khối giá, không chỉ là một dòng nhỏ ở
   * khối giữ chỗ. Ba số do server trả sẵn — client KHÔNG tự lấy tổng trừ cọc; `null` ở bất kỳ
   * số nào nghĩa là chuyến không đi qua khoản giữ chỗ XePrime, và lúc đó không dựng khối này.
   */
  const hasHoldPaymentPlan =
    finance.customerTotalAmount != null &&
    finance.holdPaidAmount != null &&
    finance.payAtPickupAmount != null;
  /*
   * Gấp bảng kê từng dòng theo mặc định — khách chỉ cần "phải trả bao nhiêu" và tình trạng cọc
   * ngay khi mở màn; cách tính ra con số đó là tra cứu, không phải thứ đầu tiên cần đọc. Tổng,
   * tiền đã trả và khối cọc KHÔNG nằm sau nút này — chúng không phải "chi tiết".
   */
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <YStack gap={space.sm}>
        <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
          {t('priceTitle')}
        </Text>

        {finance.legacyPricing ? <Notice tone="info" text={t('legacy')} /> : null}

        <Pressable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <XStack ai="center" gap={space.xs}>
            <Text col={colors.primary} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {expanded ? tPrice('collapse') : tPrice('viewDetails')}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={iconSize.sm}
              color={colors.primary}
            />
          </XStack>
        </Pressable>

        {expanded ? (
          <>
            <DataRow label={t('rental')} value={fmt.money(finance.baseAmount)} />
            {isZeroMoney(finance.discountAmount) ? null : (
              <DataRow
                label={t('discount')}
                value={`−${fmt.money(finance.discountAmount)}`}
                tone="discount"
              />
            )}
            {/*
          Phí giao nhận mặc định miễn phí; chủ xe chốt lại sau khi thoả thuận NGOÀI ứng dụng.
          Khách thấy số MỚI NHẤT — không có bước chấp nhận, nên cũng không có nút nào ở đây.
        */}
            <DataRow
              label={t('deliveryFee')}
              value={isZeroMoney(finance.deliveryFee) ? t('free') : fmt.money(finance.deliveryFee)}
              tone={isZeroMoney(finance.deliveryFee) ? 'muted' : 'default'}
            />

            {finance.surcharges.length > 0 ? (
              <YStack gap={space.xs} pt={space.xs}>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {t('surchargesTitle')}
                </Text>
                {finance.surcharges.map((row, index) => (
                  <DataRow
                    key={`${row.category}-${row.recordedAt}-${index}`}
                    label={domainLabel('surchargeCategory', row.category)}
                    hint={row.reason}
                    value={fmt.money(row.amount)}
                  />
                ))}
              </YStack>
            ) : null}
          </>
        ) : null}

        <Divider />

        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {t('total')}
          </Text>
          <Text col={colors.price} fos={fontSize.h4} fow={fontWeight.bold}>
            {fmt.money(finance.finalTotal)}
          </Text>
        </XStack>

        {hasHoldPaymentPlan ? (
          <YStack gap={space.xs} p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {t('paymentPlanTitle')}
            </Text>
            <DataRow
              label={tPrice('customerTotal')}
              value={fmt.money(finance.customerTotalAmount as string)}
            />
            <DataRow label={t('holdPaid')} value={fmt.money(finance.holdPaidAmount as string)} />
            {/* Số khách còn đưa tận tay chủ xe lúc nhận — con số hành động, nhấn màu tiền. */}
            <DataRow
              label={tPrice('payAtHandover')}
              value={fmt.money(finance.payAtPickupAmount as string)}
              tone="price"
              strong
            />
          </YStack>
        ) : null}

        {isZeroMoney(finance.rentalPaid) ? null : (
          <DataRow label={t('paid')} value={fmt.money(finance.rentalPaid)} />
        )}

        {/*
          Chỉ `none` (chưa từng có cọc) mới ẩn khối cọc. Mọi trạng thái còn lại đều dính tới một
          khoản tiền có thật — đang chờ thu, đang giữ, đã khấu trừ, hay đã hoàn — và giấu nó đi
          vì "chuyến chưa xong" là giấu tiền của khách.
        */}
        {hasDepositToShow(depositStatus) ? (
          <DepositBlock finance={finance} status={depositStatus} />
        ) : null}

        {isZeroMoney(finance.additionalDue) ? null : (
          <Notice
            tone="warning"
            text={t('additionalDue', { amount: fmt.money(finance.additionalDue) })}
            hint={t('additionalDueBody')}
          />
        )}
      </YStack>
    </Card>
  );
}

/**
 * Khối cọc — mỗi trạng thái một câu chuyện khác nhau, và cái sai đắt nhất là gộp
 * `Chưa nhận cọc` với `Không yêu cầu cọc`: câu đầu nghĩa là còn một khoản tiền đang treo.
 */
function DepositBlock({
  finance,
  status,
}: {
  finance: CustomerTripFinance;
  status: DepositStatus;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.finance');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();

  const refunded = finance.refundAmount != null;
  const meta = DEPOSIT_STATUS_META[status];

  const tail =
    refunded && finance.refundAmount != null
      ? [
          t('refundedBy', {
            method: domainLabel('refundMethod', finance.refundMethod, t('refundMethodOther')),
          }),
          finance.refundedAt ? t('refundedAt', { date: fmt.dateTime(finance.refundedAt) }) : '',
          finance.refundReference ? t('refundRef', { reference: finance.refundReference }) : '',
          t('refundedTail'),
        ].join('')
      : status === DEPOSIT_STATUS.AWAITING_REFUND
        ? t('awaitingRefund')
        : status === DEPOSIT_STATUS.RECEIVED
          ? t('holding')
          : status === DEPOSIT_STATUS.SETTLED
            ? t('settled')
            : null;

  return (
    <YStack gap={space.xs} pt={space.sm}>
      <Divider />
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {t('depositTitle')}
        </Text>
        <StatusBadge
          label={domainLabel('depositStatus', status, meta.label)}
          color={meta.color}
          size="sm"
        />
      </XStack>

      {status === DEPOSIT_STATUS.NOT_RECEIVED ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('depositNotReceived', { amount: fmt.money(finance.depositRequired) })}
        </Text>
      ) : (
        <>
          <DataRow label={t('depositReceived')} value={fmt.money(finance.depositReceived)} />
          {isZeroMoney(finance.depositDeducted) ? null : (
            <DataRow
              label={t('depositDeducted')}
              value={`−${fmt.money(finance.depositDeducted)}`}
              tone="discount"
            />
          )}
          {/*
            Chuyến chưa xong thì chưa có "dự kiến hoàn": cọc đang làm đúng việc của nó, và một
            con số hoàn lại lúc này chỉ là phỏng đoán trước khi biết có phát sinh gì không.
          */}
          {status === DEPOSIT_STATUS.RECEIVED ? null : (
            <XStack ai="center" jc="space-between" gap={space.sm}>
              <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {refunded ? t('refundActual') : t('refundExpected')}
              </Text>
              <Text col={colors.price} fos={fontSize.body} fow={fontWeight.bold}>
                {fmt.money(refunded ? finance.refundAmount : finance.expectedRefund)}
              </Text>
            </XStack>
          )}
        </>
      )}

      {isZeroMoney(finance.depositDeducted) ? null : (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('deductNote')}
        </Text>
      )}
      {tail ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {tail}
        </Text>
      ) : null}
    </YStack>
  );
}

function Notice({
  tone,
  text,
  hint,
}: {
  tone: 'info' | 'warning';
  text: string;
  hint?: string;
}): ReactNode {
  const colors = useColors();
  const skin =
    tone === 'warning'
      ? { fg: colors.warning, bg: colors.warningSurface, icon: 'alert-circle-outline' as const }
      : { fg: colors.info, bg: colors.infoSurface, icon: 'information-circle-outline' as const };

  return (
    <XStack gap={space.sm} bg={skin.bg} p={space.sm} br={space.xs}>
      <Ionicons name={skin.icon} size={iconSize.md} color={skin.fg} />
      <YStack f={1} gap={2}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {text}
        </Text>
        {hint ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {hint}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
}

type ClosedSettlement = { hold: CustomerTripDetail['hold']; tripId: string; completed: boolean };
type HoldRefund = NonNullable<NonNullable<ClosedSettlement['hold']>['refund']>;

type RefundPillKey =
  | 'paid'
  | 'refundPaid'
  | 'refundCredited'
  | 'refundProcessing'
  | 'refundNeedsAccount'
  | 'noRefund';

/** Tình trạng khoản hoàn → nhãn + sắc thái viên thuốc "Trạng thái" (web `refundPill`). */
function refundPill(refund: HoldRefund): { key: RefundPillKey; tone: TripRequestTone } {
  switch (refund.status) {
    case HOLD_REFUND_STATUS.PAID:
      return { key: 'refundPaid', tone: 'success' };
    case HOLD_REFUND_STATUS.CREDITED:
      return { key: 'refundCredited', tone: 'success' };
    case HOLD_REFUND_STATUS.REJECTED:
      return { key: 'noRefund', tone: 'danger' };
    default:
      return refund.hasAccount
        ? { key: 'refundProcessing', tone: 'warning' }
        : { key: 'refundNeedsAccount', tone: 'warning' };
  }
}

/** `--xp-space-12` — khe giữa nhãn và tiền của một dòng hoá đơn. */
const ROW_GAP = space.sm + space.xs;

/**
 * Hoá đơn dịch vụ của chuyến ĐÃ KHÉP — bản native của `ClosedInvoice` web (Figma `21621:68465`
 * hoàn thành · `21621:67915` đã huỷ).
 *
 * Kê PHẲNG mọi khoản phía khách: tiền thuê kèm cách tính, khuyến mãi của chủ xe, phí giao xe, các
 * khoản đi kèm do KHÁCH chịu (dòng 0đ không vẽ), mã khuyến mãi XePrime; rồi tổng, đã thanh toán, phần
 * trả tay chủ xe (chỉ chuyến hoàn thành), phụ phí lúc trả xe, khoản hoàn, trạng thái. Khoản giữ chỗ
 * và khoản hoàn GỘP vào đây. KHÔNG bao giờ hiện thuế, hoa hồng hay dòng phía chủ xe (ADR 0064 điều
 * 11). Mọi con số là của server; ở đây không cộng trừ.
 */
function ClosedInvoice({
  finance,
  settlement,
}: {
  finance: CustomerTripFinance;
  settlement?: ClosedSettlement;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.finance');
  const tInv = useTranslations('Trips.finance.invoice');
  const tPrice = useTranslations('Common.components.price');
  const tRefund = useTranslations('BankAccounts.refund');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const [accountOpen, setAccountOpen] = useState(false);

  const fees = finance.breakdown?.fees ?? null;
  const baseRow = finance.breakdown?.rows.find((row) => row.key === PRICE_ROW.BASE);
  const feeLines = (fees?.lines ?? []).filter(
    (line) =>
      line.bearer !== FEE_BEARER.OWNER &&
      !isZeroMoney(line.amount) &&
      line.key !== FEE_LINE.TAX &&
      line.key !== FEE_LINE.OWNER_COMMISSION,
  );
  const promoDiscount = fees?.promoDiscountAmount ?? '0';
  const totalAmount = finance.customerTotalAmount ?? finance.finalTotal;

  const hold = settlement?.hold ?? null;
  const completed = settlement?.completed ?? false;
  const paidAmount =
    finance.holdPaidAmount ??
    (hold && !isZeroMoney(hold.paidAmount) ? hold.paidAmount : null) ??
    (!isZeroMoney(finance.rentalPaid) ? finance.rentalPaid : null);
  const refund = hold?.refund ?? null;
  const needsAccount =
    refund != null &&
    refund.status === HOLD_REFUND_STATUS.PENDING &&
    !refund.hasAccount &&
    settlement != null;

  const status: { key: RefundPillKey; tone: TripRequestTone } | null = refund
    ? refundPill(refund)
    : completed
      ? { key: 'paid', tone: 'success' }
      : paidAmount
        ? { key: 'noRefund', tone: 'danger' }
        : null;

  const depositStatus = finance.depositStatus as DepositStatus;
  const note = refund
    ? [
        refund.paidAt ? tInv('refundPaidAt', { date: fmt.dateTime(refund.paidAt) }) : null,
        refund.bankReference ? tInv('refundRef', { reference: refund.bankReference }) : null,
        refund.accountHint ? tInv('refundAccount', { hint: refund.accountHint }) : null,
        needsAccount ? tInv('refundNeedsAccount') : null,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  return (
    <YStack
      gap={space.md}
      p={space.lg}
      bw={1}
      bc={colors.primaryBorder}
      br={radius.card}
      bg={colors.surface}
      accessibilityLabel={t('invoiceTitle')}
    >
      <Text
        col={colors.text}
        fos={fontSize.bodyLg}
        fow={fontWeight.semibold}
        accessibilityRole="header"
      >
        {t('invoiceTitle')}
      </Text>

      {finance.legacyPricing ? <Notice tone="info" text={t('legacy')} /> : null}

      <YStack gap={space.md}>
        <InvoiceRow
          label={tInv('rentFee')}
          sub={baseRow?.sublabel ?? null}
          value={fmt.money(finance.baseAmount)}
        />

        {!isZeroMoney(finance.discountAmount) ? (
          <InvoiceRow
            label={t('discount')}
            value={`−${fmt.money(finance.discountAmount)}`}
            discount
          />
        ) : null}

        {!isZeroMoney(finance.deliveryFee) ? (
          <InvoiceRow label={t('deliveryFee')} value={fmt.money(finance.deliveryFee)} />
        ) : null}

        {feeLines.map((line) => {
          const sub =
            line.unitAmount && line.quantity
              ? tPrice('dailyRate', { days: line.quantity, amount: fmt.money(line.unitAmount) })
              : null;
          const subText = [sub, line.partnerName].filter(Boolean).join(' · ');
          return (
            <InvoiceRow
              key={line.key}
              label={dl('feeLine', line.key)}
              sub={subText || null}
              value={fmt.money(line.amount)}
            />
          );
        })}

        {!isZeroMoney(promoDiscount) ? (
          <InvoiceRow
            label={dl('feeLine', FEE_LINE.PROMO)}
            sub={
              fees?.promo
                ? `${fees.promo.code}${fees.promo.name ? ` · ${fees.promo.name}` : ''}`
                : null
            }
            value={`−${fmt.money(promoDiscount)}`}
            discount
          />
        ) : null}

        <InvoiceRow label={tInv('total')} value={fmt.money(totalAmount)} />

        {paidAmount ? <InvoiceRow label={tInv('paid')} value={fmt.money(paidAmount)} /> : null}

        {/* Phần trả tay chủ xe lúc nhận xe — chỉ có nghĩa khi chuyến thật sự diễn ra. */}
        {completed && finance.payAtPickupAmount != null && paidAmount ? (
          <InvoiceRow
            label={tPrice('payAtHandover')}
            value={fmt.money(finance.payAtPickupAmount)}
          />
        ) : null}

        {/* Phụ phí ghi lúc trả xe — đứng riêng, kèm lý do để khách đối chiếu. */}
        {finance.surcharges.map((row, index) => (
          <InvoiceRow
            key={`${row.category}-${row.recordedAt}-${index}`}
            label={dl('surchargeCategory', row.category)}
            sub={`${tInv('surchargesAfter')}${row.reason ? ` · ${row.reason}` : ''}`}
            value={fmt.money(row.amount)}
          />
        ))}

        {refund ? (
          <>
            <YStack h={1} bg={colors.border} />
            <XStack ai="center" jc="space-between" gap={ROW_GAP}>
              <Text f={1} minWidth={0} col={colors.textMuted} fos={fontSize.body}>
                {tInv('refundAmount')}
              </Text>
              {/* "Khoản hoàn trả" — `Text/brand/primary` 20/30 semibold. */}
              <Text col={colors.primary} fos={fontSize.lead} lh={30} fow={fontWeight.semibold}>
                {fmt.money(refund.amount)}
              </Text>
            </XStack>
          </>
        ) : null}

        {status ? (
          <XStack ai="center" jc="space-between" gap={ROW_GAP}>
            <Text f={1} minWidth={0} col={colors.textMuted} fos={fontSize.body}>
              {tInv('status')}
            </Text>
            <TripRequestPill tone={status.tone}>{tInv(`pill.${status.key}`)}</TripRequestPill>
          </XStack>
        ) : null}
      </YStack>

      {note ? (
        <Text col={colors.placeholder} fos={fontSize.bodySm}>
          {note}
        </Text>
      ) : null}

      {needsAccount && settlement && refund ? (
        <>
          <Button label={tRefund('submit')} onPress={() => setAccountOpen(true)} />
          {/* Chỉ mount khi ĐÃ MỞ — tấm tự gọi danh sách tài khoản của khách. */}
          {accountOpen ? (
            <RefundAccountSheet
              tripId={settlement.tripId}
              amount={fmt.money(refund.amount)}
              open={accountOpen}
              onClose={() => setAccountOpen(false)}
            />
          ) : null}
        </>
      ) : null}

      {hasDepositToShow(depositStatus) ? (
        <DepositBlock finance={finance} status={depositStatus} />
      ) : null}

      {isZeroMoney(finance.additionalDue) ? null : (
        <Notice
          tone="warning"
          text={t('additionalDue', { amount: fmt.money(finance.additionalDue) })}
          hint={t('additionalDueBody')}
        />
      )}
    </YStack>
  );
}

/** Một dòng hoá đơn — `.invoiceRow` web: nhãn (+ dòng phụ) co bên trái, tiền giữ nguyên cụm bên phải. */
function InvoiceRow({
  label,
  sub = null,
  value,
  discount = false,
}: {
  label: string;
  sub?: string | null;
  value: string;
  discount?: boolean;
}) {
  const colors = useColors();
  return (
    <XStack ai="center" jc="space-between" gap={ROW_GAP}>
      <YStack f={1} minWidth={0} gap={space.xs}>
        <Text col={colors.textMuted} fos={fontSize.body}>
          {label}
        </Text>
        {sub ? (
          <Text col={colors.placeholder} fos={fontSize.bodySm}>
            {sub}
          </Text>
        ) : null}
      </YStack>
      <Text
        col={discount ? colors.success : colors.text}
        fos={fontSize.bodyLg}
        fow={fontWeight.medium}
        numberOfLines={1}
      >
        {value}
      </Text>
    </XStack>
  );
}
