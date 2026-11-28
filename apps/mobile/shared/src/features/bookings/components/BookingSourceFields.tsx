import { useMemo } from 'react';
import {
  useController,
  useWatch,
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
} from 'react-hook-form';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_DIRECT_SOURCE_VALUES,
  BOOKING_SOURCE,
  BOOKING_SOURCE_LABEL_MAX,
  bookingSourceTakesLabel,
} from '@xeprime/types';
import { Chip } from '@/components/ui/Chip';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useDomainLabel } from '@/i18n/domain';
import { space } from '@/theme/tokens';
import { useBookingSourceLabels } from '../hooks/use-bookings';

interface BookingSourceFieldsProps<T extends FieldValues> {
  control: Control<T>;
  sourceName: Path<T>;
  labelName: Path<T>;
}

/** Số gợi ý tối đa hiện dưới ô tên - lọc theo chữ đang gõ, như danh sách thả của AutoComplete web. */
const SUGGESTION_LIMIT = 8;

/**
 * Hai ô NGUỒN ĐƠN của đơn tự lập (ADR 0110) — native port of web `BookingSourceFields`: chọn kênh khách
 * tới, và - với "Nền tảng khác" / "Nguồn khác" - gõ tên nguồn. Web dùng AutoComplete; app thay bằng
 * hàng chip gợi ý chạm-để-điền dưới ô (những nhãn gian hàng đã từng nhập), để một nguồn chỉ có MỘT
 * cách viết và bộ lọc gom được.
 *
 * `xeprime` không có trong danh sách: nguồn đó do server gắn cho đơn khách đặt qua sàn.
 */
export function BookingSourceFields<T extends FieldValues>({
  control,
  sourceName,
  labelName,
}: BookingSourceFieldsProps<T>) {
  const t = useTranslations('Bookings.source');
  const domainLabel = useDomainLabel();
  const source = useWatch({ control, name: sourceName }) as string | undefined;
  const takesLabel = Boolean(source) && bookingSourceTakesLabel(source as string);
  const labels = useBookingSourceLabels({ enabled: takesLabel });
  const isPlatform = source === BOOKING_SOURCE.OTHER_PLATFORM;
  const { field: labelField } = useController({ control, name: labelName });
  const typed = String(labelField.value ?? '').trim().toLowerCase();

  const options = useMemo(
    () =>
      BOOKING_DIRECT_SOURCE_VALUES.map((value) => ({
        value,
        label: domainLabel('bookingSource', value),
      })),
    [domainLabel],
  );
  const suggestions = useMemo(
    () =>
      (labels.data ?? [])
        .filter((value) => value.toLowerCase() !== typed && value.toLowerCase().includes(typed))
        .slice(0, SUGGESTION_LIMIT),
    [labels.data, typed],
  );

  return (
    <YStack gap={space.md}>
      <SelectField
        control={control}
        name={sourceName}
        label={t('label')}
        placeholder={t('placeholder')}
        options={options}
        required
      />
      {takesLabel ? (
        <YStack gap={space.sm}>
          <TextField
            control={control}
            name={labelName}
            label={isPlatform ? t('platformLabel') : t('nameLabel')}
            placeholder={isPlatform ? t('platformPlaceholder') : t('namePlaceholder')}
            maxLength={BOOKING_SOURCE_LABEL_MAX}
            required
          />
          {suggestions.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <XStack gap={space.sm}>
                {suggestions.map((value) => (
                  <Chip
                    key={value}
                    label={value}
                    size="sm"
                    variant="soft"
                    role="button"
                    onPress={() => labelField.onChange(value as PathValue<T, Path<T>>)}
                  />
                ))}
              </XStack>
            </ScrollView>
          ) : null}
        </YStack>
      ) : null}
    </YStack>
  );
}
