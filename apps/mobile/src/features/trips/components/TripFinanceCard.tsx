import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DEPOSIT_STATUS,
  DEPOSIT_STATUS_META,
  hasDepositToShow,
  type DepositStatus,
} from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { DataRow, Divider } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import type { CustomerTripFinance } from '../api';

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
}: {
  finance: CustomerTripFinance;
  /** Chuyến đã khép: hiện hoá đơn cuối (có phụ phí) thay cho bảng giá dự kiến. */
  closed: boolean;
}) {
  const t = useTranslations('Trips.finance');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();

  const depositStatus = finance.depositStatus as DepositStatus;

  return (
    <Card>
      <YStack gap={space.sm}>
        <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
          {closed ? t('invoiceTitle') : t('priceTitle')}
        </Text>

        {finance.legacyPricing ? <Notice tone="info" text={t('legacy')} /> : null}

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

        <Divider />

        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {closed ? t('totalFinal') : t('total')}
          </Text>
          <Text col={colors.price} fos={fontSize.h4} fow={fontWeight.bold}>
            {fmt.money(finance.finalTotal)}
          </Text>
        </XStack>

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
