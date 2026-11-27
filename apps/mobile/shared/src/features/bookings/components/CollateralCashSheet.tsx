import { useEffect, useMemo } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { absoluteMoney, isNegativeMoney, isZeroMoney, subtractMoney } from '@xeprime/domain';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { FieldAppearanceProvider } from '@/components/ui/Field';
import { MoneyField } from '@/components/ui/MoneyField';
import {
  DepositRequiredSavedError,
  useSaveDepositEdit,
} from '@/features/settlement/hooks/use-settlement';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';

const DEPOSIT_MAX = 999_999_999_999;

/**
 * Hộp "Sửa tiền cọc" - native port of web `detail/CollateralCashDialog.tsx`. Hai con số, hai đường
 * ghi: "Mức cọc phải thu" (`PATCH /bookings/:id`) và "Đã thu" (`POST …/deposit-adjustments` - server
 * ghi thêm khoản thu cọc hoặc khoản trả lại khách, không sửa khoản cũ). Dòng tóm tắt (thu dư /
 * còn thiếu / đã đủ) tính lại khi gõ, bằng phép trừ trên chuỗi tiền.
 */
export function CollateralCashSheet({
  bookingId,
  current,
  received,
  collectedEditable,
  open,
  onClose,
}: {
  bookingId: string;
  /** Cọc tiền đang ghi trên đơn (chuỗi tiền). */
  current: string;
  /** Cọc RÒNG đã thu - `null` = chưa đọc được, ẩn phần "Đã thu". */
  received: string | null;
  /** Có quyền ghi thu tiền và cọc chưa sang chặng hoàn. */
  collectedEditable: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.detailPage.side.collateral.cashDialog');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const save = useSaveDepositEdit(bookingId);
  const showCollected = received !== null;
  const receivedNum = Number(received ?? 0) || 0;

  const schema = useMemo(
    () =>
      yup.object({
        depositAmount: yup
          .number()
          .typeError(t('invalid'))
          .min(0, t('negative'))
          .max(DEPOSIT_MAX, t('invalid'))
          .required(t('required')),
        collectedAmount: yup
          .number()
          .typeError(t('invalid'))
          .min(0, t('negative'))
          .max(DEPOSIT_MAX, t('invalid'))
          .required(t('collectedRequired')),
      }),
    [t],
  );
  type Values = yup.InferType<typeof schema>;

  const { control, handleSubmit, reset } = useForm<Values>({
    resolver: yupResolver(schema),
    defaultValues: { depositAmount: Number(current) || 0, collectedAmount: receivedNum },
  });

  useEffect(() => {
    if (open) reset({ depositAmount: Number(current) || 0, collectedAmount: receivedNum });
  }, [open, current, receivedNum, reset]);

  const [requiredLive, collectedLive] = useWatch({
    control,
    name: ['depositAmount', 'collectedAmount'],
  });
  const requiredStr = String(Math.max(0, Number(requiredLive) || 0));
  const collectedStr = String(Math.max(0, Number(collectedLive) || 0));
  const balance = subtractMoney(collectedStr, requiredStr);
  const adjustDiff = subtractMoney(collectedStr, received ?? '0');
  const collectedChanged = showCollected && collectedEditable && !isZeroMoney(adjustDiff);

  const summary = isZeroMoney(collectedStr)
    ? isZeroMoney(requiredStr)
      ? null
      : { text: t('summaryNone'), color: colors.warning }
    : isZeroMoney(balance)
      ? { text: t('summaryEven'), color: colors.success }
      : isNegativeMoney(balance)
        ? {
            text: t('summaryShort', { amount: fmt.money(absoluteMoney(balance) ?? '0') }),
            color: colors.warning,
          }
        : { text: t('summaryOver', { amount: fmt.money(balance) }), color: colors.danger };

  const pending = save.isPending;

  const submit = handleSubmit(async (values) => {
    if (pending) return;
    const nextRequired = String(values.depositAmount);
    const requiredChanged = nextRequired !== String(Number(current) || 0);
    if (requiredChanged || collectedChanged) {
      try {
        await save.mutateAsync({
          depositAmount: requiredChanged ? nextRequired : null,
          collectedAmount: collectedChanged ? String(values.collectedAmount) : null,
        });
      } catch (error) {
        toast.showError(
          error instanceof DepositRequiredSavedError
            ? t('requiredSavedAdjustFailed', { error: errorMessage(error.cause) })
            : errorMessage(error),
        );
        return;
      }
    }
    toast.showSuccess(t('saved'));
    onClose();
  });

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('title')}
      chrome="v2"
      headerDivider
      footer={
        <XStack gap={space.sm}>
          <YStack flexShrink={0}>
            <Button label={tCommon('cancel')} variant="neutral" block={false} onPress={onClose} />
          </YStack>
          <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
            <Button
              label={tCommon('save')}
              variant="gradient"
              loading={pending}
              onPress={() => void submit()}
            />
          </YStack>
        </XStack>
      }
    >
      <FieldAppearanceProvider value="v2">
        <YStack gap={space.lg}>
          <XStack jc="space-between" gap={space.md}>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('current')}
            </Text>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
              {isZeroMoney(current) ? t('none') : fmt.money(current)}
            </Text>
          </XStack>
          <MoneyField
            control={control}
            name="depositAmount"
            label={t('requiredLabel')}
            hint={t('hint')}
            required
          />
          {showCollected ? (
            collectedEditable ? (
              <YStack gap={space.sm}>
                <MoneyField
                  control={control}
                  name="collectedAmount"
                  label={t('collected')}
                  hint={t('collectedHint')}
                  required
                />
                {collectedChanged ? (
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {isNegativeMoney(adjustDiff)
                      ? t('adjustDown', { amount: fmt.money(absoluteMoney(adjustDiff) ?? '0') })
                      : t('adjustUp', { amount: fmt.money(adjustDiff) })}
                  </Text>
                ) : null}
              </YStack>
            ) : (
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('collectedLocked', { amount: fmt.money(received ?? '0') })}
              </Text>
            )
          ) : null}
          {showCollected && summary ? (
            <Text col={summary.color} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {summary.text}
            </Text>
          ) : null}
        </YStack>
      </FieldAppearanceProvider>
    </BottomSheet>
  );
}
