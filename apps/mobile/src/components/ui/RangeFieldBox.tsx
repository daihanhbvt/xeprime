import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { FieldLabel, FieldMessage, FieldShell } from './Field';
import { colors, fieldFontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/**
 * Ô khoảng thuê — bản native của `RentalDateTimeRangeField variant="labelled"` bên web.
 *
 * Vì sao KHÔNG dùng `FieldBox` một dòng: ô này chứa HAI mốc, và một dòng
 * `10:00 21/08 – 10:00 24/08` bắt người đọc tự đoán đầu nào là nhận đầu nào là trả — đúng lý do
 * web bỏ `variant="compact"` ở chỗ này ("không được phép mơ hồ đầu nào là nhận / đầu nào là
 * trả"). Web đặt hai đầu cạnh nhau ngăn bằng vạch đứng; ở bề ngang điện thoại thì hai đầu XẾP
 * DỌC, vạch ngăn nằm ngang — cùng cấu trúc, xoay 90°.
 *
 * Cả khối là MỘT vùng chạm mở cùng một tấm lịch: hai đầu của cùng một khoảng, không phải hai ô
 * độc lập.
 */
export function RangeFieldBox({
  label,
  startValue,
  endValue,
  durationText,
  hint,
  error,
  required = false,
  onPress,
}: {
  label: string;
  /** Chuỗi đã định dạng của mốc nhận. Rỗng ⇒ hiện chữ mời chọn. */
  startValue: string;
  endValue: string;
  /** Viên thời lượng bên phải khi đã chọn đủ hai đầu — web có, và nó trả lời "thuê mấy ngày". */
  durationText?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  onPress: () => void;
}) {
  const t = useTranslations('Common.components.rentalRange');
  const filled = startValue.length > 0 && endValue.length > 0;

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={label} required={required} />

      <FieldShell
        onPress={onPress}
        invalid={Boolean(error)}
        align="flex-start"
        accessibilityRole="button"
        accessibilityLabel={t('ariaValue', {
          label,
          start: startValue || t('notSelected'),
          end: endValue || t('notSelected'),
        })}
      >
        <YStack pt={space.sm} pb={space.sm}>
          <Ionicons name="calendar-outline" size={iconSize.sm} color={colors.textMuted} />
        </YStack>

        <YStack f={1} py={space.sm}>
          <Endpoint label={t('pickup')} value={startValue} />
          <YStack height={1} bg={colors.borderSubtle} my={space.xs} />
          <Endpoint label={t('return')} value={endValue} />
        </YStack>

        <YStack jc="center" minHeight={40}>
          {filled && durationText ? (
            <XStack bg={colors.surfaceSelected} br={radius.sm} px={space.xs} py={2}>
              <Text col={colors.primaryActive} fos={fieldFontSize.affix} fow={fontWeight.semibold}>
                {durationText}
              </Text>
            </XStack>
          ) : (
            <Ionicons name="chevron-down" size={iconSize.sm} color={colors.textMuted} />
          )}
        </YStack>
      </FieldShell>

      <FieldMessage error={error} hint={hint} />
    </YStack>
  );
}

/** Một đầu của khoảng: nhãn nhỏ bên trái, giá trị bên phải — nhãn dính liền giá trị của nó. */
function Endpoint({ label, value }: { label: string; value: string }) {
  const t = useTranslations('Common.components.rentalRange');

  return (
    <XStack ai="baseline" gap={space.xs}>
      <Text col={colors.textMuted} fos={fieldFontSize.affix} width={58}>
        {label}
      </Text>
      <Text
        f={1}
        col={value ? colors.text : colors.placeholder}
        fos={fieldFontSize.value}
        fow={value ? fontWeight.semibold : fontWeight.regular}
      >
        {value || t('pickDateTime')}
      </Text>
    </XStack>
  );
}
