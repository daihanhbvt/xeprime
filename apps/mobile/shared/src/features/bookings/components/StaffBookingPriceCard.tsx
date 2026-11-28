import { useState } from 'react';
import { useFieldArray, useWatch, type Control } from 'react-hook-form';
import { AddLink, EditableSummaryRow } from '@/components/ui/EditableSummaryRow';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MoneyControl } from '@/components/ui/MoneyControl';
import { TextControl } from '@/components/ui/TextControl';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_EXTRA_CHARGE_MAX_LINES } from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { InfoHint } from '@/components/ui/InfoHint';
import { MoneyField } from '@/components/ui/MoneyField';
import { PriceBreakdown } from '@/components/ui/PriceBreakdown';
import { Skeleton } from '@/components/ui/Skeleton';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
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
/** `editingExtra` khi đang THÊM mới. */
const NEW_ROW = -1;

export function StaffBookingPriceCard({
  control,
  quote,
  quoteLoading,
  quoteUnavailable,
  isDelivery,
  onToggleNegotiated,
  manualTotal,
}: {
  control: Control<StaffBookingValues>;
  quote: QuoteBreakdown | null;
  quoteLoading: boolean;
  quoteUnavailable: boolean;
  isDelivery: boolean;
  onToggleNegotiated: (on: boolean) => void;
  /**
   * Tổng "Giá thoả thuận" do màn cha tính (cùng số với chân trang) - một nguồn duy nhất để hai chỗ
   * không lệch nhau. `null` ⇒ thẻ tự tính (dùng ở nơi không có chân trang).
   */
  manualTotal?: string | null;
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
  const tActions = useTranslations('Common.actions');
  /* Popup nhập NHÁP: "Xác nhận" mới thêm/sửa khoản, "Huỷ" không đổi gì (người dùng 28/11/2026). */
  const [editingExtra, setEditingExtra] = useState<number | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftAmount, setDraftAmount] = useState<number | null>(null);
  const [draftErrors, setDraftErrors] = useState<{ label?: string; amount?: string }>({});
  const openExtra = (index: number) => {
    const row = index === NEW_ROW ? null : extraRows?.[index];
    setDraftLabel(row?.label ?? '');
    setDraftAmount(row?.amount ?? null);
    setDraftErrors({});
    setEditingExtra(index);
  };
  const confirmExtra = () => {
    const value = { label: draftLabel.trim(), amount: draftAmount };
    // Tên khoản và số tiền đều bắt buộc (> 0) - chặn ngay trong popup, không để lọt xuống lúc tạo đơn.
    const errors = {
      ...(value.label ? {} : { label: t('validation.extraLabelRequired') }),
      ...(value.amount != null && value.amount > 0 ? {} : { amount: t('validation.extraAmountPositive') }),
    };
    if (errors.label || errors.amount) {
      setDraftErrors(errors);
      return;
    }
    if (editingExtra === NEW_ROW) extras.append(value);
    else if (editingExtra != null) extras.update(editingExtra, value);
    setEditingExtra(null);
  };

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
        {/* Cùng hình bảng giá: công tắc · tiêu đề · các dòng nhãn ↔ tiền · dòng tổng. */}
        <YStack gap={space.sm}>
          <XStack jc="flex-end">
            <Skeleton width={140} height={20} round />
          </XStack>
          <Skeleton width="40%" height={20} />
          {Array.from({ length: 3 }, (_, i) => (
            <XStack key={i} jc="space-between" gap={space.md}>
              <Skeleton width="45%" height={14} />
              <Skeleton width="25%" height={14} />
            </XStack>
          ))}
          <YStack h={1} bg={colors.borderSubtle} />
          <XStack jc="space-between" gap={space.md}>
            <Skeleton width="35%" height={18} />
            <Skeleton width="30%" height={22} />
          </XStack>
        </YStack>
      </Card>
    );
  }

  if (!negotiated && !quoteUnavailable && quote) {
    // Bảng giá là MỘT khối tự có tiêu đề (như trước ADR 0109) — công tắc đứng ngay trên nó.
    // Bọc trong thẻ như các khối khác của màn Xem lại (không để bảng giá nằm trơ trên nền).
    return (
      <Card>
      <YStack gap={space.sm}>
        {/* Tiêu đề + (i) ghi chú (tạm tính, "giá theo hệ thống") bên trái, công tắc bên phải. */}
        <XStack ai="center" jc="space-between" gap={space.sm} flexWrap="wrap">
          <XStack ai="center" gap={4}>
            <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold} accessibilityRole="header">
              {t('review.costs.title')}
            </Text>
            <InfoHint
              label={t('review.costs.title')}
              content={`${quote.estimateNote ? `${quote.estimateNote}. ` : ''}${t('review.costs.systemNote')}`}
              size={fontSize.bodyLg}
            />
          </XStack>
          {toggle}
        </XStack>
        <PriceBreakdown
            rows={quote.rows}
            totalAmount={quote.totalAmount}
            totalLabel={quote.estimateNote ? t('trip.barEstimate') : t('trip.barTotal')}
            footer={
              quote.longTerm?.durationDiscountPercent ? (
                <Text col={colors.success} fos={fontSize.label} fow={fontWeight.semibold}>
                  {tFlow('price.savings', {
                    amount: fmt.money(quote.longTerm.durationDiscountAmount),
                    months: quote.longTerm.packageMonths,
                  })}
                </Text>
              ) : undefined
            }
        />
      </YStack>
      </Card>
    );
  }

  const total =
    manualTotal ??
    String(
      negotiatedTotal({
        base,
        discount,
        delivery: isDelivery ? delivery : 0,
        extras: extraRows,
      }),
    );

  return (
    <Card>
      <YStack gap={space.md}>
        <XStack ai="center" jc="space-between" gap={space.sm} flexWrap="wrap">
          <XStack ai="center" gap={4}>
            <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold} accessibilityRole="header">
              {t('review.costs.title')}
            </Text>
            {quoteUnavailable ? null : (
              <InfoHint label={t('review.costs.title')} content={t('review.negotiated.lead')} size={fontSize.bodyLg} />
            )}
          </XStack>
          {toggle}
        </XStack>
        {quoteUnavailable ? (
          <Callout tone="warning" title={t('review.costs.noPrice')} />
        ) : null}
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
            hintInLabel
          />
        ) : null}

        <XStack ai="center" gap={4}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {t('review.negotiated.extrasTitle')}
          </Text>
          <InfoHint label={t('review.negotiated.extrasTitle')} content={t('review.negotiated.extrasHint')} />
        </XStack>
        {/*
          Như danh sách bậc ở chính sách gian hàng (người dùng 28/11/2026): mỗi khoản là MỘT dòng tóm
          tắt "Tên khoản / Số tiền" + xoá/sửa; thêm hay sửa đều mở POPUP nhập hai ô.
        */}
        {extras.fields.map((field, index) => {
          const row = extraRows?.[index];
          return (
            <EditableSummaryRow
              key={field.id}
              lines={[
                { label: `${t('review.negotiated.extraLabel')}:`, value: row?.label?.trim() || '-' },
                {
                  label: `${t('review.negotiated.extraAmount')}:`,
                  value: row?.amount == null ? '-' : fmt.money(String(row.amount)),
                },
              ]}
              removeLabel={t('review.negotiated.removeExtra')}
              editLabel={t('review.negotiated.extraLabel')}
              disabled={false}
              onRemove={() => extras.remove(index)}
              onEdit={() => openExtra(index)}
            />
          );
        })}
        {extras.fields.length < BOOKING_EXTRA_CHARGE_MAX_LINES ? (
          <AddLink
            label={t('review.negotiated.addExtra')}
            onPress={() => openExtra(NEW_ROW)}
          />
        ) : null}
        <BottomSheet
          open={editingExtra != null}
          onClose={() => setEditingExtra(null)}
          title={t('review.negotiated.extrasTitle')}
          footer={
            <XStack gap={8}>
              <YStack f={1}>
                <Button label={tActions('cancel')} variant="secondary" onPress={() => setEditingExtra(null)} />
              </YStack>
              <YStack f={1}>
                <Button label={tActions('confirm')} variant="gradient" onPress={confirmExtra} />
              </YStack>
            </XStack>
          }
        >
          {editingExtra == null ? null : (
            <YStack gap={12}>
              <TextControl
                label={t('review.negotiated.extraLabel')}
                value={draftLabel}
                onChangeText={(next) => {
                  setDraftLabel(next);
                  if (draftErrors.label) setDraftErrors((e) => ({ ...e, label: undefined }));
                }}
                placeholder={t('review.negotiated.extraLabelPlaceholder')}
                required
                {...(draftErrors.label ? { error: draftErrors.label } : {})}
              />
              <MoneyControl
                label={t('review.negotiated.extraAmount')}
                value={draftAmount}
                onChange={(next) => {
                  setDraftAmount(next);
                  if (draftErrors.amount) setDraftErrors((e) => ({ ...e, amount: undefined }));
                }}
                required
                {...(draftErrors.amount ? { error: draftErrors.amount } : {})}
              />
            </YStack>
          )}
        </BottomSheet>

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
