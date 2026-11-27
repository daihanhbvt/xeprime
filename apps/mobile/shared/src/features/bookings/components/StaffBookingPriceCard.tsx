import { useFieldArray, useWatch, type Control } from 'react-hook-form';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_EXTRA_CHARGE_MAX_LINES } from '@xeprime/types';
import { Ionicons } from '@/components/icons/Ionicons';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { MoneyField } from '@/components/ui/MoneyField';
import { PriceBreakdown } from '@/components/ui/PriceBreakdown';
import { Skeleton } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import type { QuoteBreakdown } from '@/api/bookings/api';
import { negotiatedTotal, type StaffBookingValues } from '../staff-booking-schema';

/**
 * Thẻ "Tiền thuê" của màn Xem lại luồng ĐẶT HỘ (ADR 0109) — native port of web
 * `StaffBookingPriceCard`.
 *
 * - Tắt "Giá thoả thuận": bảng giá hệ thống (`PriceBreakdown`), công tắc ở hàng trên bảng.
 * - Bật: nhập tiền thuê, giảm giá, phí giao xe (chỉ khi giao tận nơi) và phụ phí theo dòng. Tổng
 *   tính lại ngay — chỉ để HIỂN THỊ; server tính lại bằng cùng công thức.
 * - Xe chưa cấu hình giá (`quoteUnavailable`): công tắc bật sẵn, không tắt được.
 */
export function StaffBookingPriceCard({
  control,
  quote,
  quoteLoading,
  quoteUnavailable,
  isDelivery,
  onToggleNegotiated,
}: {
  control: Control<StaffBookingValues>;
  quote: QuoteBreakdown | null;
  quoteLoading: boolean;
  quoteUnavailable: boolean;
  isDelivery: boolean;
  onToggleNegotiated: (on: boolean) => void;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.staffFlow');
  const tFlow = useTranslations('BookingRequests.flow');
  const fmt = useAppFormat();
  const negotiated = useWatch({ control, name: 'negotiated' });
  const [base, discount, delivery, extraRows] = useWatch({
    control,
    name: ['manualBaseAmount', 'manualDiscount', 'manualDeliveryFee', 'extraCharges'],
  });
  const extras = useFieldArray({ control, name: 'extraCharges' });

  const toggle = (
    <XStack ai="center" gap={space.sm}>
      <ToggleSwitch
        size="sm"
        value={negotiated || quoteUnavailable}
        disabled={quoteUnavailable}
        onValueChange={onToggleNegotiated}
        accessibilityLabel={t('review.negotiated.toggle')}
      />
      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
        {t('review.negotiated.toggle')}
      </Text>
    </XStack>
  );

  if (quoteLoading) {
    return (
      <Card>
        <Skeleton height={140} />
      </Card>
    );
  }

  if (!negotiated && !quoteUnavailable && quote) {
    // Bảng giá là MỘT khối tự có tiêu đề (như trước ADR 0109) — công tắc đứng ngay trên nó.
    return (
      <YStack gap={space.sm}>
        <XStack jc="flex-end">{toggle}</XStack>
        <PriceBreakdown
            rows={quote.rows}
            totalAmount={quote.totalAmount}
            totalLabel={quote.estimateNote ? t('trip.barEstimate') : t('trip.barTotal')}
            title={t('review.costs.title')}
            footer={
              <Text col={colors.textMuted} fos={fontSize.label}>
                {quote.longTerm?.durationDiscountPercent ? (
                  <Text fow={fontWeight.semibold}>
                    {tFlow('price.savings', {
                      amount: fmt.money(quote.longTerm.durationDiscountAmount),
                      months: quote.longTerm.packageMonths,
                    })}{' '}
                  </Text>
                ) : null}
                {quote.estimateNote ? `${quote.estimateNote}. ` : ''}
                {t('review.costs.systemNote')}
              </Text>
            }
        />
      </YStack>
    );
  }

  const total = negotiatedTotal({
    base,
    discount,
    delivery: isDelivery ? delivery : 0,
    extras: extraRows,
  });

  return (
    <Card>
      <YStack gap={space.md}>
        <XStack ai="center" jc="space-between" gap={space.sm} flexWrap="wrap">
          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold} accessibilityRole="header">
            {t('review.costs.title')}
          </Text>
          {toggle}
        </XStack>
        {quoteUnavailable ? (
          <Callout tone="warning" title={t('review.costs.noPrice')} />
        ) : (
          <Text col={colors.placeholder} fos={fontSize.body}>
            {t('review.negotiated.lead')}
          </Text>
        )}
        <MoneyField
          control={control}
          name="manualBaseAmount"
          label={t('review.costs.baseAmount')}
          required
        />
        <MoneyField control={control} name="manualDiscount" label={t('review.negotiated.discount')} />
        {isDelivery ? (
          <MoneyField
            control={control}
            name="manualDeliveryFee"
            label={t('review.negotiated.deliveryFee')}
            hint={t('review.negotiated.deliveryFeeHint')}
          />
        ) : null}

        <YStack gap={2}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {t('review.negotiated.extrasTitle')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('review.negotiated.extrasHint')}
          </Text>
        </YStack>
        {extras.fields.map((field, index) => (
          <XStack key={field.id} gap={space.sm} ai="flex-start">
            <YStack f={1} minWidth={0} gap={space.sm}>
              <TextField
                control={control}
                name={`extraCharges.${index}.label`}
                label={t('review.negotiated.extraLabel')}
                placeholder={t('review.negotiated.extraLabelPlaceholder')}
              />
              <MoneyField
                control={control}
                name={`extraCharges.${index}.amount`}
                label={t('review.negotiated.extraAmount')}
              />
            </YStack>
            <YStack pt={space.xl}>
              <Pressable
                onPress={() => extras.remove(index)}
                accessibilityRole="button"
                accessibilityLabel={t('review.negotiated.removeExtra')}
                hitSlop={space.sm}
              >
                <Ionicons name="trash-outline" size={iconSize.lg} color={colors.danger} />
              </Pressable>
            </YStack>
          </XStack>
        ))}
        {extras.fields.length < BOOKING_EXTRA_CHARGE_MAX_LINES ? (
          <Button
            label={t('review.negotiated.addExtra')}
            icon="add"
            variant="secondary"
            onPress={() => extras.append({ label: '', amount: null })}
          />
        ) : null}

        <XStack ai="center" jc="space-between" gap={space.sm} pt={space.xs}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {t('trip.barTotal')}
          </Text>
          <Text col={colors.brandMoney} fos={fontSize.h4} fow={fontWeight.semibold}>
            {fmt.money(String(total))}
          </Text>
        </XStack>
      </YStack>
    </Card>
  );
}
