import { useMemo } from 'react';
import { useFieldArray, useWatch, type Control } from 'react-hook-form';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_COLLATERAL_MAX_ITEMS,
  BOOKING_COLLATERAL_TYPE,
  BOOKING_COLLATERAL_TYPE_VALUES,
} from '@xeprime/types';
import { Ionicons } from '@/components/icons/Ionicons';
import { Card } from '@/components/ui/Card';
import { MoneyField } from '@/components/ui/MoneyField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import type { StaffBookingValues } from '../staff-booking-schema';

/**
 * Thẻ "Cọc & thế chấp" của luồng ĐẶT HỘ (ADR 0109) — native port of web `StaffBookingCollateralCard`
 * (26/11/2026): một ô tiền cọc và một danh sách tài sản (CCCD, bằng lái, xe máy kèm biển số…). Nhập
 * khoản nào thì đơn ghi khoản đó - tiền cọc để 0 và danh sách trống nghĩa là không cọc. Không có ô
 * chọn "hình thức": server suy chế độ từ dữ liệu.
 */
export function StaffBookingCollateralCard({ control }: { control: Control<StaffBookingValues> }) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.staffFlow.review.collateral');
  const domainLabel = useDomainLabel();
  const items = useFieldArray({ control, name: 'collaterals' });
  const rows = useWatch({ control, name: 'collaterals' });
  const canAdd = items.fields.length < BOOKING_COLLATERAL_MAX_ITEMS;

  const typeOptions = useMemo(
    () =>
      BOOKING_COLLATERAL_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('bookingCollateralType', value),
      })),
    [domainLabel],
  );

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

        <MoneyField control={control} name="depositAmount" label={t('cash')} hint={t('cashHint')} />

        <YStack gap={space.sm}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {t('assetsTitle')}
            </Text>
            {canAdd ? (
              <Pressable
                onPress={() =>
                  items.append({ collateralType: BOOKING_COLLATERAL_TYPE.CITIZEN_ID, description: '' })
                }
                accessibilityRole="button"
                accessibilityLabel={t('add')}
                hitSlop={space.sm}
              >
                <XStack ai="center" gap={space.xs}>
                  <Ionicons name="add" size={iconSize.md} color={colors.brandLink} />
                  <Text col={colors.brandLink} fos={fontSize.body} fow={fontWeight.medium}>
                    {t('add')}
                  </Text>
                </XStack>
              </Pressable>
            ) : null}
          </XStack>

          {items.fields.length === 0 ? (
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('assetsHint')}
            </Text>
          ) : (
            items.fields.map((field, index) => {
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
            })
          )}
        </YStack>
      </YStack>
    </Card>
  );
}
