import { useMemo } from 'react';
import { useFieldArray, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_COLLATERAL_MAX_ITEMS,
  BOOKING_COLLATERAL_TYPE,
  BOOKING_COLLATERAL_TYPE_VALUES,
} from '@xeprime/types';
import { Ionicons } from '@/components/icons/Ionicons';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MoneyField } from '@/components/ui/MoneyField';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import {
  STAFF_COLLATERAL_MODE,
  STAFF_COLLATERAL_MODE_VALUES,
  collateralModeHasAssets,
  collateralModeHasCash,
  type StaffBookingValues,
  type StaffCollateralMode,
} from '../staff-booking-schema';

/**
 * Thẻ "Cọc & thế chấp" của luồng ĐẶT HỘ (ADR 0109) — native port of web
 * `StaffBookingCollateralCard`: khách cọc TIỀN, để lại TÀI SẢN (CCCD, bằng lái, xe máy kèm biển
 * số…), cả hai, hoặc không cọc. Cọc tiền điền sẵn từ chính sách xe; danh sách tài sản in lên đơn và
 * hợp đồng, đánh dấu đã trả ở chi tiết đơn.
 */
export function StaffBookingCollateralCard({
  control,
  setValue,
}: {
  control: Control<StaffBookingValues>;
  setValue: UseFormSetValue<StaffBookingValues>;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.staffFlow.review.collateral');
  const domainLabel = useDomainLabel();
  const mode = useWatch({ control, name: 'collateralMode' }) as StaffCollateralMode;
  const items = useFieldArray({ control, name: 'collaterals' });
  const rows = useWatch({ control, name: 'collaterals' });

  const modeItems = useMemo(
    () => STAFF_COLLATERAL_MODE_VALUES.map((value) => ({ key: value, label: t(`mode.${value}`) })),
    [t],
  );
  const typeOptions = useMemo(
    () =>
      BOOKING_COLLATERAL_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('bookingCollateralType', value),
      })),
    [domainLabel],
  );

  const changeMode = (next: StaffCollateralMode) => {
    setValue('collateralMode', next, { shouldDirty: true });
    // Chọn có tài sản mà danh sách còn trống ⇒ mở sẵn một dòng (CCCD là thứ khách hay để lại nhất).
    if (collateralModeHasAssets(next) && items.fields.length === 0) {
      items.append({ collateralType: BOOKING_COLLATERAL_TYPE.CITIZEN_ID, description: '' });
    }
  };

  return (
    <Card>
      <YStack gap={space.md}>
        <YStack gap={space.xs}>
          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold} accessibilityRole="header">
            {t('title')}
          </Text>
          <Text col={colors.placeholder} fos={fontSize.body}>
            {t('lead')}
          </Text>
        </YStack>
        <SegmentedTabs<StaffCollateralMode>
          items={modeItems}
          value={mode}
          onChange={changeMode}
          fit
        />

        {collateralModeHasCash(mode) ? (
          <MoneyField control={control} name="depositAmount" label={t('cash')} hint={t('cashHint')} />
        ) : null}

        {collateralModeHasAssets(mode) ? (
          <>
            <YStack gap={2}>
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                {t('assetsTitle')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('assetsHint')}
              </Text>
            </YStack>
            {items.fields.map((field, index) => {
              const type = rows?.[index]?.collateralType;
              return (
                <XStack key={field.id} gap={space.sm} ai="flex-start">
                  <YStack f={1} minWidth={0} gap={space.sm}>
                    <SelectField
                      control={control}
                      name={`collaterals.${index}.collateralType`}
                      label={t('type')}
                      options={typeOptions}
                    />
                    <TextField
                      control={control}
                      name={`collaterals.${index}.description`}
                      label={t('description')}
                      placeholder={
                        type === BOOKING_COLLATERAL_TYPE.MOTORBIKE
                          ? t('descriptionMotorbike')
                          : type === BOOKING_COLLATERAL_TYPE.OTHER
                            ? t('descriptionOther')
                            : t('descriptionPlaceholder')
                      }
                      required={type === BOOKING_COLLATERAL_TYPE.OTHER}
                    />
                  </YStack>
                  <YStack pt={space.xl}>
                    <Pressable
                      onPress={() => items.remove(index)}
                      accessibilityRole="button"
                      accessibilityLabel={t('remove')}
                      hitSlop={space.sm}
                    >
                      <Ionicons name="trash-outline" size={iconSize.lg} color={colors.danger} />
                    </Pressable>
                  </YStack>
                </XStack>
              );
            })}
            {items.fields.length < BOOKING_COLLATERAL_MAX_ITEMS ? (
              <Button
                label={t('add')}
                icon="add"
                variant="secondary"
                onPress={() =>
                  items.append({
                    collateralType: BOOKING_COLLATERAL_TYPE.CITIZEN_ID,
                    description: '',
                  })
                }
              />
            ) : null}
          </>
        ) : null}

        {mode === STAFF_COLLATERAL_MODE.NONE ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('noneHint')}
          </Text>
        ) : null}
      </YStack>
    </Card>
  );
}
