import { useMemo, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isZeroMoney } from '@xeprime/domain';
import {
  BOOKING_COLLATERAL_DESCRIPTION_MAX,
  BOOKING_COLLATERAL_MAX_ITEMS,
  BOOKING_COLLATERAL_TYPE,
  BOOKING_COLLATERAL_TYPE_VALUES,
  PERMISSION,
  bookingCollateralNeedsDescription,
  isBookingCollateralEditable,
  type BookingCollateralType,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { Pill } from '@/components/ui/Pill';
import { SelectControl } from '@/components/ui/SelectControl';
import { TextControl } from '@/components/ui/TextControl';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import type { BookingCollateral, BookingDetail } from '../api';
import {
  useAddBookingCollateral,
  useRemoveBookingCollateral,
  useSetBookingCollateralReturned,
} from '../hooks/use-booking-collaterals';
import { SideCard, SideTitle } from './BookingDetailSide';

/**
 * Thẻ "Cọc & thế chấp" ở chi tiết đơn (ADR 0109) — native port of web
 * `detail/CollateralSideCard.tsx`: cọc tiền + từng món tài sản khách để lại. Đánh dấu đã trả / hoàn
 * tác được ở mọi trạng thái đơn; thêm / gỡ chỉ khi đơn chưa khép (server chặn cùng luật). Quyền
 * `bookings.update`. Đơn không có gì để giữ và không còn sửa được thì ẩn hẳn thẻ.
 */
export function CollateralSideCard({ booking }: { booking: BookingDetail }) {
  const colors = useColors();
  const t = useTranslations('Bookings.detailPage.side.collateral');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const { has } = usePermissions();

  const add = useAddBookingCollateral(booking.id);
  const remove = useRemoveBookingCollateral(booking.id);
  const setReturned = useSetBookingCollateralReturned(booking.id);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<BookingCollateralType>(BOOKING_COLLATERAL_TYPE.CITIZEN_ID);
  const [description, setDescription] = useState('');
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<BookingCollateral | null>(null);

  const typeOptions = useMemo(
    () =>
      BOOKING_COLLATERAL_TYPE_VALUES.map((value) => ({
        value,
        label: dl('bookingCollateralType', value),
      })),
    [dl],
  );

  const items = booking.collaterals ?? [];
  const canUpdate = has(PERMISSION.BOOKING_UPDATE);
  const editable = canUpdate && isBookingCollateralEditable(booking.status);
  const hasCash = !isZeroMoney(booking.depositAmount);
  const held = items.filter((item) => !item.returnedAt).length;

  if (!hasCash && items.length === 0 && !editable) return null;

  const onError = (err: unknown) => toast.showError(errorMessage(err));
  const needsDescription = bookingCollateralNeedsDescription(type);

  function resetForm() {
    setAdding(false);
    setType(BOOKING_COLLATERAL_TYPE.CITIZEN_ID);
    setDescription('');
    setDescriptionError(null);
  }

  function submitAdd() {
    if (add.isPending) return;
    const text = description.trim();
    if (needsDescription && !text) {
      setDescriptionError(t('descriptionRequired'));
      return;
    }
    add.mutate(
      { collateralType: type, description: text || null },
      {
        onSuccess: () => {
          toast.showSuccess(t('added'));
          resetForm();
        },
        onError,
      },
    );
  }

  return (
    <SideCard label={t('title')}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <SideTitle>{t('title')}</SideTitle>
        {items.length > 0 ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('heldCount', { held, total: items.length })}
          </Text>
        ) : null}
      </XStack>

      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.textMuted} fos={fontSize.body}>
          {t('cash')}
        </Text>
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
          {hasCash ? fmt.money(booking.depositAmount) : t('noCash')}
        </Text>
      </XStack>

      {items.length === 0 ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('empty')}
        </Text>
      ) : (
        <YStack gap={space.sm}>
          {items.map((item) => {
            const returned = Boolean(item.returnedAt);
            const busy = setReturned.isPending && setReturned.variables?.id === item.id;
            return (
              <YStack
                key={item.id}
                gap={space.xs}
                pt={space.sm}
                borderTopWidth={1}
                borderTopColor={colors.borderSubtle}
              >
                <XStack ai="center" gap={space.xs} flexWrap="wrap">
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {dl('bookingCollateralType', item.collateralType)}
                  </Text>
                  {returned ? <Pill size="sm" shape="tag" tone="success" label={t('returnedTag')} /> : null}
                </XStack>
                {item.description ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {item.description}
                  </Text>
                ) : null}
                {returned && item.returnedAt ? (
                  <Text col={colors.placeholder} fos={fontSize.label}>
                    {item.returnedByName
                      ? t('returnedBy', {
                          name: item.returnedByName,
                          time: fmt.dateTime(item.returnedAt),
                        })
                      : t('returnedAt', { time: fmt.dateTime(item.returnedAt) })}
                  </Text>
                ) : null}
                {canUpdate ? (
                  <XStack gap={space.sm} jc="flex-end">
                    {editable && !returned ? (
                      <Button
                        label={t('remove')}
                        variant="ghostDanger"
                        size="sm"
                        block={false}
                        onPress={() => setRemoving(item)}
                      />
                    ) : null}
                    {returned ? (
                      <Button
                        label={tCommon('undo')}
                        variant="ghost"
                        size="sm"
                        block={false}
                        loading={busy}
                        onPress={() => setReturned.mutate({ id: item.id, returned: false }, { onError })}
                      />
                    ) : (
                      <Button
                        label={t('markReturned')}
                        variant="secondary"
                        size="sm"
                        block={false}
                        loading={busy}
                        onPress={() =>
                          setReturned.mutate(
                            { id: item.id, returned: true },
                            { onSuccess: () => toast.showSuccess(t('returnedToast')), onError },
                          )
                        }
                      />
                    )}
                  </XStack>
                ) : null}
              </YStack>
            );
          })}
        </YStack>
      )}

      {editable && items.length < BOOKING_COLLATERAL_MAX_ITEMS ? (
        adding ? (
          <YStack gap={space.sm}>
            <SelectControl
              label={t('type')}
              value={type}
              options={typeOptions}
              onChange={(next) => {
                setType(next as BookingCollateralType);
                setDescriptionError(null);
              }}
            />
            <TextControl
              label={t('description')}
              value={description}
              onChangeText={(next) => {
                setDescription(next);
                if (descriptionError) setDescriptionError(null);
              }}
              maxLength={BOOKING_COLLATERAL_DESCRIPTION_MAX}
              required={needsDescription}
              placeholder={
                type === BOOKING_COLLATERAL_TYPE.MOTORBIKE
                  ? t('descriptionMotorbike')
                  : needsDescription
                    ? t('descriptionOther')
                    : t('descriptionPlaceholder')
              }
              {...(descriptionError ? { error: descriptionError } : {})}
            />
            <XStack gap={space.sm}>
              <YStack f={1}>
                <Button label={tCommon('cancel')} variant="secondary" onPress={resetForm} />
              </YStack>
              <YStack f={1}>
                <Button label={tCommon('add')} loading={add.isPending} onPress={submitAdd} />
              </YStack>
            </XStack>
          </YStack>
        ) : (
          <Button label={t('add')} icon="add" variant="secondary" onPress={() => setAdding(true)} />
        )
      ) : null}

      <ConfirmSheet
        open={removing !== null}
        title={t('removeConfirm')}
        confirmLabel={t('remove')}
        tone="danger"
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(removing.id, {
            onSuccess: () => setRemoving(null),
            onError: (err) => {
              setRemoving(null);
              onError(err);
            },
          });
        }}
      />
    </SideCard>
  );
}
