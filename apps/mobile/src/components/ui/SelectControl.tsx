import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, TextInput } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BottomSheet } from './BottomSheet';
import { FieldLabel, FieldMessage, FieldShell } from './Field';
import { MenuOption, MenuOptionList } from './MenuOption';
import { colors, fieldFontSize, iconSize, radius, sizing, space } from '@/theme/tokens';

export interface SelectControlOption {
  readonly value: string;
  readonly label: string;
  /** Dòng phụ dưới nhãn trong danh sách — dùng khi nhãn thôi chưa đủ để chọn đúng. */
  readonly hint?: string;
}

/**
 * Ô CHỌN của biểu mẫu, bản KHÔNG gắn với React Hook Form.
 *
 * Tách khỏi [`SelectField`](./SelectField.tsx) vì hai lớp giải hai bài khác nhau: cái này là
 * HÌNH DẠNG + hành vi mở/chọn, còn `SelectField` chỉ thêm phần nối vào RHF. Có những giá trị
 * sống ở state component chứ không ở form — dịch vụ và gói thuê của luồng đặt hộ chẳng hạn, vì
 * chúng quyết định cả schema lẫn tham số báo giá — và trước khi tách thì chúng không có cách nào
 * dùng lại đúng ô này, nên phải rơi về hàng chip.
 *
 * **Mọi lựa chọn từ HAI giá trị trở lên đều đi qua đây**, không dùng hàng chip: chip chỉ đọc được
 * khi nhãn ngắn, còn "Thuê dài hạn" hay "Liên tỉnh một chiều" xếp ngang trên màn 360dp là tự
 * xuống ba hàng và đẩy nội dung phía dưới ra khỏi tầm nhìn.
 */
export function SelectControl({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  required = false,
  placeholder,
  disabled = false,
  onSearch,
  searchPlaceholder,
  emptyText,
}: {
  label: string;
  value: string | null;
  options: readonly SelectControlOption[];
  onChange: (next: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Chữ mờ khi chưa chọn gì. Bỏ trống thì dùng "Chọn…" của `Common.actions`. */
  placeholder?: string;
  /**
   * Ô chỉ đọc — chặn mở tấm chọn, không chỉ đổi hình. `fieldset[disabled]` của web không có bản
   * tương đương ở đây (`FieldShell` là `View`, không phải `<select>`), nên phải tự chặn `onPress`
   * — thiếu dòng này thì ô "trông khoá" nhưng vẫn đổi được giá trị.
   */
  disabled?: boolean;
  /**
   * Bật ô TÌM trong tấm chọn, và đẩy chữ đang gõ ra ngoài cho nơi gọi tự lọc.
   *
   * Cần khi danh mục dài hơn thứ cuộn nổi bằng ngón tay — xã/phường có tới 168 đơn vị trong một
   * tỉnh. Lọc ở NGOÀI chứ không lọc tại chỗ vì phép tìm của danh mục hành chính chạy ở server
   * (bỏ dấu, bỏ tiền tố loại): gõ "ba dinh" phải ra "Phường Ba Đình", mà chuỗi con thuần thì không.
   */
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  /** Chữ khi danh sách rỗng sau khi tìm. Bỏ trống thì không hiện gì. */
  emptyText?: string;
}) {
  const t = useTranslations('Common.actions');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const current = options.find((option) => option.value === value);

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={label} required={required} />

      {/*
        Vỏ chạm là `Pressable`: vai "button" đặt trên stack Tamagui không nổi lên cây khả truy
        cập, nên ô chọn sẽ đọc ra như một mảng chữ chứ không phải một nút bấm được.
      */}
      <Pressable
        onPress={() => {
          if (!disabled) setOpen(true);
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
      >
        <FieldShell focused={false} invalid={Boolean(error)} disabled={disabled} align="center">
          <Text
            f={1}
            col={current ? colors.text : colors.placeholder}
            fos={fieldFontSize.value}
            numberOfLines={1}
          >
            {current?.label ?? placeholder ?? t('choose')}
          </Text>
          <Ionicons
            name="chevron-down"
            size={iconSize.sm}
            color={disabled ? colors.textDisabled : colors.textMuted}
          />
        </FieldShell>
      </Pressable>

      <FieldMessage error={error} hint={hint} />

      <BottomSheet
        open={open}
        onClose={() => {
          setOpen(false);
          // Đóng là xoá chữ tìm: mở lại mà còn nguyên bộ lọc cũ trông như danh mục bị mất dòng.
          setSearch('');
          onSearch?.('');
        }}
        title={label}
      >
        {onSearch ? (
          <XStack
            ai="center"
            gap={space.sm}
            px={space.md}
            h={sizing.touchTarget}
            br={radius.md}
            bw={1}
            bc={colors.border}
          >
            <Ionicons name="search" size={iconSize.sm} color={colors.textMuted} />
            <TextInput
              style={{ flex: 1, fontSize: fieldFontSize.value, color: colors.text }}
              value={search}
              onChangeText={(next) => {
                setSearch(next);
                onSearch(next);
              }}
              placeholder={searchPlaceholder ?? t('search')}
              placeholderTextColor={colors.placeholder}
              autoCorrect={false}
              accessibilityLabel={searchPlaceholder ?? t('search')}
            />
          </XStack>
        ) : null}

        {options.length === 0 && emptyText ? (
          <Text col={colors.textMuted} fos={fieldFontSize.message}>
            {emptyText}
          </Text>
        ) : null}

        <MenuOptionList>
          {options.map((option) => (
            <MenuOption
              key={option.value}
              label={option.label}
              {...(option.hint === undefined ? {} : { hint: option.hint })}
              selected={option.value === value}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
                setSearch('');
                onSearch?.('');
              }}
            />
          ))}
        </MenuOptionList>
      </BottomSheet>
    </YStack>
  );
}
