import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, TextInput } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useQuery } from '@tanstack/react-query';
import {
  normalizePromoCode,
  PROMO_DISCOUNT_TYPE,
  PROMO_INELIGIBLE_REASON,
  PROMO_INELIGIBLE_REASON_VALUES,
} from '@xeprime/types';
import { queryKeys } from '@xeprime/api-client';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { FieldShell } from '@/components/ui/Field';
import { InfoHint } from '@/components/ui/InfoHint';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppFormat } from '@/i18n/use-app-format';
import { FONT_FAMILY } from '@/theme/fonts';
import {
  colors,
  fieldFontSize,
  fontSize,
  fontWeight,
  iconSize,
  radius,
  space,
} from '@/theme/tokens';
import { availablePromoCodes, type PromoPreview, type PromoTripParams } from '@/api/promo-codes/api';

/**
 * Ô ÁP MÃ KHUYẾN MÃI của luồng đặt xe trên APP — bản native của `PromoCodeField` bên web
 * (ADR 0046).
 *
 * Cùng bốn trạng thái, cùng nhãn, cùng bộ lý do: mời gõ · đang kiểm · đã áp · không áp được (kèm
 * lý do). Khác hình thái ở đúng một chỗ, và nó là chỗ bắt buộc phải khác: danh sách mã mở bằng
 * TẤM TRƯỢT chứ không phải modal giữa màn — trên điện thoại một hộp thoại giữa màn bị bàn phím
 * đẩy lệch ngay khi khách chạm vào ô nhập trong đó.
 *
 * Component KHÔNG cộng trừ tiền. Số giảm và tổng khách trả do server tính; một phép trừ ở client
 * sẽ hiện con số khác với con số in lên mã QR.
 */
export function PromoCodeField({
  trip,
  appliedCode,
  applied,
  checking,
  reason,
  unavailable = false,
  droppedCode = null,
  onApply,
  onRemove,
}: {
  /** `null` = chuyến chưa báo giá được ⇒ khối tự ẩn. */
  trip: PromoTripParams | null;
  appliedCode: string | null;
  applied: PromoPreview | null;
  checking: boolean;
  reason: string | null;
  /** Chuyến không thu trước ⇒ không có dòng tiền nào để tài trợ vào (ADR 0046 điều 2). */
  unavailable?: boolean;
  droppedCode?: string | null;
  onApply: (code: string) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('PromoCodes');
  const fmt = useAppFormat();
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const hasApplied = Boolean(appliedCode && applied?.applicable);

  function submitDraft() {
    const code = normalizePromoCode(draft);
    if (!code) return;
    setDraft('');
    onApply(code);
  }

  if (!trip) return null;

  return (
    <YStack
      gap={space.xs}
      px={space.md}
      py={space.sm}
      br={radius.sm}
      bw={1}
      bc={hasApplied ? colors.success : colors.borderSubtle}
      bg={hasApplied ? colors.successSurface : 'transparent'}
      borderStyle={hasApplied ? 'solid' : 'dashed'}
    >
      <XStack ai="center" gap={space.xs}>
        <Ionicons name="pricetag-outline" size={iconSize.sm} color={colors.primary} />
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {t('field.label')}
        </Text>
        <InfoHint content={t('field.hint')} label={t('field.hintLabel')} />
        {/* Sau khi áp, việc tiếp theo là BỎ mã — không phải chọn thêm mã thứ hai (một chuyến một mã). */}
        {!hasApplied && !unavailable ? (
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            hitSlop={space.sm}
            style={{ marginLeft: 'auto' }}
          >
            <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.semibold}>
              {t('field.browse')}
            </Text>
          </Pressable>
        ) : null}
      </XStack>

      {unavailable ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('field.unavailableForTrip')}
        </Text>
      ) : hasApplied && applied ? (
        <>
          <XStack ai="center" gap={space.sm}>
            <XStack bg={colors.surface} br={radius.sm} px={space.xs} py={2}>
              <Text col={colors.success} fos={fontSize.bodySm} fow={fontWeight.bold}>
                {applied.code}
              </Text>
            </XStack>
            <Text f={1} flexShrink={1} col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
              {applied.name}
            </Text>
            <Text col={colors.success} fos={fontSize.bodySm} fow={fontWeight.bold}>
              −{fmt.money(applied.discountAmount ?? '0')}
            </Text>
            <Pressable
              onPress={onRemove}
              accessibilityRole="button"
              accessibilityLabel={t('field.removeLabel')}
              hitSlop={12}
            >
              <Ionicons name="close" size={iconSize.sm} color={colors.textMuted} />
            </Pressable>
          </XStack>
          {applied.clamped ? (
            <Text col={colors.placeholder} fos={fontSize.label}>
              {t('field.clamped', { amount: fmt.money(applied.discountAmount ?? '0') })}
            </Text>
          ) : null}
        </>
      ) : (
        <XStack ai="center" gap={space.sm}>
          <YStack f={1}>
            <FieldShell focused={focused} disabled={checking}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                editable={!checking}
                placeholder={t('field.placeholder')}
                placeholderTextColor={colors.placeholder}
                accessibilityLabel={t('field.label')}
                maxLength={24}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={submitDraft}
                style={{
                  flex: 1,
                  color: colors.text,
                  fontFamily: FONT_FAMILY.body,
                  fontSize: fieldFontSize.value,
                  padding: 0,
                }}
              />
            </FieldShell>
          </YStack>
          <Button
            label={t('field.apply')}
            variant="secondary"
            size="sm"
            loading={checking}
            disabled={normalizePromoCode(draft).length === 0}
            onPress={submitDraft}
          />
        </XStack>
      )}

      {checking ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('field.checking')}
        </Text>
      ) : null}
      {!checking && reason && !hasApplied ? (
        <Text col={colors.danger} fos={fontSize.label} fow={fontWeight.semibold}>
          {reasonText(t, reason)}
        </Text>
      ) : null}
      {droppedCode ? (
        <Text col={colors.warning} fos={fontSize.label} fow={fontWeight.semibold}>
          {t('field.dropped', { code: droppedCode })}
        </Text>
      ) : null}

      {pickerOpen ? (
        <PromoPickerSheet
          trip={trip}
          appliedCode={appliedCode}
          onClose={() => setPickerOpen(false)}
          onApply={(code) => {
            setPickerOpen(false);
            onApply(code);
          }}
        />
      ) : null}
    </YStack>
  );
}

/**
 * Tấm trượt chọn mã — gõ tay HOẶC chọn từ danh sách đã công bố.
 *
 * Chỉ dựng khi ĐÃ mở (`pickerOpen ? … : null` ở nơi gọi): một `Modal` ngủ đông trong màn đặt xe
 * là một cây DOM native nữa cho mỗi chuyến khách xem.
 */
function PromoPickerSheet({
  trip,
  appliedCode,
  onClose,
  onApply,
}: {
  trip: PromoTripParams;
  appliedCode: string | null;
  onClose: () => void;
  onApply: (code: string) => void;
}) {
  const t = useTranslations('PromoCodes');
  const fmt = useAppFormat();
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  const listQ = useQuery({
    queryKey: queryKeys.marketplace.promoCodes({
      vehicleId: trip.vehicleId,
      serviceType: trip.serviceType ?? null,
      pickupAt: trip.pickupAt ?? null,
      returnAt: trip.returnAt ?? null,
      packageMonths: trip.packageMonths ?? null,
      routeType: trip.routeType ?? null,
    }),
    queryFn: () => availablePromoCodes(trip),
    staleTime: 60_000,
  });

  function submitDraft() {
    const code = normalizePromoCode(draft);
    if (!code) return;
    setDraft('');
    onApply(code);
  }

  return (
    <BottomSheet open onClose={onClose} title={t('picker.title')}>
      <YStack gap={space.md} pb={space.md}>
        <XStack ai="center" gap={space.sm}>
          <YStack f={1}>
            <FieldShell focused={focused}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={t('field.placeholder')}
                placeholderTextColor={colors.placeholder}
                accessibilityLabel={t('picker.manualLabel')}
                maxLength={24}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={submitDraft}
                style={{
                  flex: 1,
                  color: colors.text,
                  fontFamily: FONT_FAMILY.body,
                  fontSize: fieldFontSize.value,
                  padding: 0,
                }}
              />
            </FieldShell>
          </YStack>
          <Button
            label={t('picker.apply')}
            variant="secondary"
            size="sm"
            disabled={normalizePromoCode(draft).length === 0}
            onPress={submitDraft}
          />
        </XStack>

        {listQ.isPending ? (
          <YStack gap={space.sm}>
            <Skeleton width="100%" height={64} />
            <Skeleton width="100%" height={64} />
          </YStack>
        ) : listQ.isError ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('picker.error')}
          </Text>
        ) : (listQ.data?.length ?? 0) === 0 ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('picker.empty')}
          </Text>
        ) : (
          <YStack gap={space.sm}>
            {listQ.data?.map((promo) => (
              <PickerRow
                key={promo.code}
                promo={promo}
                inUse={promo.code === appliedCode}
                money={fmt.money}
                onApply={() => onApply(promo.code)}
              />
            ))}
          </YStack>
        )}
      </YStack>
    </BottomSheet>
  );
}

/**
 * Một dòng mã. Mã KHÔNG đủ điều kiện vẫn hiện — mờ đi, kèm LÝ DO, nút vô hiệu hoá.
 *
 * Ẩn chúng thì khách vừa nhận mã qua email không hiểu vì sao nó biến mất; để nút bấm được thì
 * lại là một nút không có tác dụng.
 */
function PickerRow({
  promo,
  inUse,
  money,
  onApply,
}: {
  promo: PromoPreview;
  inUse: boolean;
  money: (value: string) => string;
  onApply: () => void;
}) {
  const t = useTranslations('PromoCodes');
  const disabled = !promo.applicable;

  return (
    <XStack
      ai="flex-start"
      gap={space.sm}
      px={space.md}
      py={space.sm}
      br={radius.sm}
      bw={1}
      bc={disabled ? colors.borderSubtle : colors.border}
      bg={disabled ? colors.surfaceMuted : 'transparent'}
    >
      <XStack
        ai="center"
        jc="center"
        w={34}
        h={34}
        br={radius.sm}
        bg={disabled ? colors.surface : colors.primaryLight}
        flexShrink={0}
      >
        <Ionicons
          name="gift-outline"
          size={iconSize.sm}
          color={disabled ? colors.placeholder : colors.primary}
        />
      </XStack>
      <YStack f={1} flexShrink={1} gap={2}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.bold} letterSpacing={0.6}>
          {promo.code}
        </Text>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {promo.discountType === PROMO_DISCOUNT_TYPE.PERCENT
            ? t('picker.discountPercent', { percent: promo.discountPercent ?? 0 })
            : t('picker.discountFixed', { amount: money(promo.discountAmount ?? '0') })}
          {promo.discountType === PROMO_DISCOUNT_TYPE.PERCENT && promo.maxDiscountAmount
            ? ` · ${t('picker.maxDiscount', { amount: money(promo.maxDiscountAmount) })}`
            : ''}
        </Text>
        <Text col={colors.placeholder} fos={fontSize.label}>
          {promo.description ??
            (Number(promo.minOrderAmount) > 0
              ? t('picker.minOrder', { amount: money(promo.minOrderAmount) })
              : promo.name)}
        </Text>
        {/* Số giảm THẬT của chuyến này — có thể nhỏ hơn mệnh giá vì trần. */}
        {promo.applicable && promo.discountAmount ? (
          <Text col={colors.success} fos={fontSize.label} fow={fontWeight.semibold}>
            {t('picker.savesAmount', { amount: money(promo.discountAmount) })}
          </Text>
        ) : null}
        {disabled && promo.reason ? (
          <Text col={colors.danger} fos={fontSize.label} fow={fontWeight.semibold}>
            {reasonText(t, promo.reason)}
          </Text>
        ) : null}
      </YStack>
      <YStack flexShrink={0} jc="center" alignSelf="center">
        <Button
          label={inUse ? t('picker.applied') : t('picker.apply')}
          variant="primary"
          size="sm"
          disabled={disabled || inUse}
          onPress={onApply}
        />
      </YStack>
    </XStack>
  );
}

/**
 * Lý do → chữ, dịch từ MÃ (ADR 0012 §4).
 *
 * Lọc qua `PROMO_INELIGIBLE_REASON_VALUES` TRƯỚC khi tra bản dịch: `use-intl` không ném khi
 * thiếu khoá — nó in thẳng đường dẫn khoá lên màn hình. Một `try/catch` ở đây vì thế không bao
 * giờ chạy, và một mã lý do mới ở backend sẽ hiện nguyên chuỗi kỹ thuật cho khách.
 */
function reasonText(t: ReturnType<typeof useTranslations<'PromoCodes'>>, reason: string): string {
  const known = (PROMO_INELIGIBLE_REASON_VALUES as readonly string[]).includes(reason)
    ? reason
    : PROMO_INELIGIBLE_REASON.NOT_FOUND;
  return t(`reason.${known}` as Parameters<typeof t>[0]);
}
