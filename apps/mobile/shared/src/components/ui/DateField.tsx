import { useState } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { dayjs } from '@xeprime/domain';
import { DatePickerSheet } from './DatePickerSheet';
import { LineIcon } from '@/components/icons/LineIcon';
import {
  FIELD_V2,
  FieldLabel,
  FieldMessage,
  FieldShell,
  inLabelHint,
  belowHint,
  useFieldGap,
} from './Field';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { iconSize, space } from '@/theme/tokens';

/**
 * Sàn ngày MẶC ĐỊNH của mọi ô ngày trong form.
 *
 * DatePickerSheet mặc định chặn quá khứ vì nó sinh ra cho lịch ĐẶT XE. Form hồ sơ thì ngược lại:
 * ngày mua, ngày ký hợp đồng vay, hạn một tờ CCCD đã hết hạn đều nằm ở quá khứ. 1980 khớp
 * MIN_VEHICLE_YEAR của vehicleFormSchema — không có chiếc xe nào trong hệ thống cũ hơn thế.
 */
export const FORM_DATE_FLOOR = dayjs('1980-01-01');

/**
 * Ô chọn NGÀY (không kèm giờ) cho React Hook Form — giá trị là chuỗi `YYYY-MM-DD`.
 *
 * Giữ nguyên chuỗi ngày chứ không quy về `Date`: `purchaseDate`, `startDate`, `endDate` là NGÀY
 * LỊCH, không phải một mốc thời gian. Đưa qua `Date` là mở đường cho lệch một ngày khi thiết bị
 * ở múi giờ khác `Asia/Ho_Chi_Minh`.
 *
 * Xoá được giá trị — đúng `allowClear` của `<DatePicker>` bên web. Không có nút xoá thì một ngày
 * lỡ chọn ở ô KHÔNG bắt buộc (ngày kết thúc hợp đồng "nếu biết") là vĩnh viễn.
 */
export function DateField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  placeholder,
  required = false,
  disabled = false,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Common');
  const fmt = useAppFormat();
  const { field, fieldState } = useController({ control, name });
  const [open, setOpen] = useState(false);

  const value = (field.value as string | null) ?? '';
  const error = fieldState.error?.message;
  // Ô BẮT BUỘC không có nút xoá - xoá đi chỉ để báo lỗi; giữ icon lịch như Figma.
  const clearable = Boolean(value) && !disabled && !required;
  const fieldGap = useFieldGap();

  return (
    <YStack gap={fieldGap}>
      <FieldLabel label={label} required={required} hint={inLabelHint(hint)} />

      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
      >
        <FieldShell focused={open} invalid={Boolean(error)} disabled={disabled} align="center">
          <Text f={1} col={value ? colors.text : colors.textPlaceholder} fos={FIELD_V2.selectFontSize}>
            {value ? fmt.dateKey(value) : (placeholder ?? t('labels.selectDate'))}
          </Text>

          {/*
            Nút xoá nằm TRONG vỏ ô nhưng là `Pressable` riêng: lồng trong `Pressable` mở lịch thì
            chạm vào dấu × cũng bung luôn bảng chọn ngày, tức không bao giờ xoá được.
          */}
          {clearable ? (
            <Pressable
              onPress={() => field.onChange(null)}
              accessibilityRole="button"
              accessibilityLabel={t('actions.clearValue')}
              hitSlop={space.sm}
            >
              <XStack ai="center" jc="center">
                <Ionicons name="close-circle" size={iconSize.sm} color={colors.textMuted} />
              </XStack>
            </Pressable>
          ) : (
            <LineIcon name="calendar" size={FIELD_V2.icon} color={colors.placeholder} />
          )}
        </FieldShell>
      </Pressable>

      <FieldMessage error={error} hint={belowHint(hint)} />

      <DatePickerSheet
        open={open}
        onClose={() => setOpen(false)}
        value={value}
        title={label}
        minDate={FORM_DATE_FLOOR}
        onChange={(next) => {
          field.onChange(next);
          setOpen(false);
        }}
      />
    </YStack>
  );
}
