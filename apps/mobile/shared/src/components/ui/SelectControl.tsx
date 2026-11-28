import { useState, type ReactNode } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { LineIcon } from '@/components/icons/LineIcon';
import { Pressable, TextInput } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BottomSheet } from './BottomSheet';
import { FIELD_V2, FieldLabel, FieldMessage, FieldShell, useFieldAppearance, inLabelHint, belowHint } from './Field';
import { MenuOption, MenuOptionList } from './MenuOption';
import { FONT_FAMILY } from '@/theme/fonts';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fieldFontSize, fontWeight, iconSize, radius, sizing, space, typeScale } from '@/theme/tokens';
import { layout } from '@/theme/layout';

/**
 * `fontFamily` PHẢI khai: `TextInput` là primitive của RN, nằm NGOÀI cây Tamagui nên không nhận
 * font mặc định của `tamagui.config` — `font-coverage.test` canh chỗ này.
 *
 * Dựng MỘT lần ở module scope: ô tìm kiếm render lại theo từng ký tự người dùng gõ, và một object
 * style mới mỗi lần gõ là một lần `TextInput` không thể bỏ qua việc cập nhật.
 */
const useStyles = makeStyles((colors) => ({
  searchInput: {
    flex: 1,
    fontSize: fieldFontSize.value,
    fontFamily: FONT_FAMILY.body,
    color: colors.text,
  },
}));

export interface SelectControlOption {
  readonly value: string;
  readonly label: string;
  /** Dòng phụ dưới nhãn trong danh sách — dùng khi nhãn thôi chưa đủ để chọn đúng. */
  readonly hint?: string;
  /** Phần tử đứng trước nhãn trong danh sách — vd logo ngân hàng. */
  readonly leading?: ReactNode;
  /** Phần tử đứng trước giá trị ĐÃ CHỌN trong ô - vd logo ngân hàng nhỏ (Figma `24228:102448`). */
  readonly valueLeading?: ReactNode;
  /** Hiện trong danh sách nhưng không chọn được (mờ) - vd tài xế đang trùng chuyến. */
  readonly disabled?: boolean;
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
  publishRequired = false,
  placeholder,
  disabled = false,
  onSearch,
  searchPlaceholder,
  emptyText,
  allowClear = false,
  hideLabel = false,
  compact = false,
  inline = false,
}: {
  /**
   * Ô chọn dạng CHỮ (Figma "Discount Toggle" `24789:85353`): "Nhãn giá trị ▾" trên một dòng, không
   * khung ô - mốc ưu đãi dài hạn. Bấm vẫn mở cùng tấm chọn.
   */
  inline?: boolean;
  label: string;
  value: string | null;
  options: readonly SelectControlOption[];
  onChange: (next: string) => void;
  hint?: string;
  error?: string;
  /** Dấu `●` cần-cho-duyệt-công-khai — xem docblock ở `FieldLabel`. */
  publishRequired?: boolean;
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
  /**
   * Cho phép BỎ CHỌN — hiện nút xoá khi ô đang có giá trị, và bỏ chọn trả về chuỗi rỗng.
   *
   * Chỉ bật ở những ô mà "không chọn gì" là một câu trả lời HỢP LỆ và KHÁC với mọi lựa chọn
   * trong danh sách — thời lượng thuê tối thiểu chẳng hạn: bỏ trống nghĩa là không đặt sàn,
   * chứ không phải sàn bằng 1 giờ. Thiếu nó thì ô một chiều: chọn xong không có đường lùi, và
   * người dùng phải đoán xem giá trị nhỏ nhất có phải là "tắt" hay không.
   */
  allowClear?: boolean;
  /**
   * Không vẽ nhãn phía trên (vẫn là tên trợ năng + tiêu đề tấm chọn) - ô lọc của thanh công cụ, nơi
   * web dùng `Select` trần với `aria-label` (nhãn đứng trên đẩy ô lệch khỏi nút cùng hàng).
   */
  hideLabel?: boolean;
  /** Khung thấp 40 + chữ "chưa chọn" màu đậm - ô lọc nằm cạnh ô tìm (Figma "Tab List"). */
  compact?: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  const t = useTranslations('Common.actions');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const current = options.find((option) => option.value === value);
  /** Bộ ô `v2` (Figma Partner-XePrime): chữ trong ô 16, mũi tên 20, placeholder `text/gray/very-low`. */
  const v2 = useFieldAppearance() === 'v2';

  const sheet = (
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
          px={layout.padX}
          h={sizing.touchTarget}
          br={radius.md}
          bw={1}
          bc={colors.border}
        >
          <Ionicons name="search" size={iconSize.sm} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
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
            {...(option.leading === undefined ? {} : { leading: option.leading })}
            disabled={option.disabled ?? false}
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
  );

  if (inline) {
    return (
      <YStack gap={space.xs}>
        <Pressable
          onPress={() => {
            if (!disabled) setOpen(true);
          }}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
        >
          <XStack ai="center" gap={space.sm} opacity={disabled ? 0.6 : 1}>
            <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} numberOfLines={1}>
              {label}
            </Text>
            <Text
              col={current ? colors.text : colors.textPlaceholder}
              fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {current?.label ?? placeholder ?? t('choose')}
            </Text>
            <LineIcon name="chevron-down-md" size={FIELD_V2.icon} color={colors.text} />
          </XStack>
        </Pressable>
        <FieldMessage error={error} />
        {sheet}
      </YStack>
    );
  }

  return (
    <YStack gap={v2 ? FIELD_V2.labelGap : space.xs}>
      {hideLabel ? null : (
        <FieldLabel label={label} required={required} publishRequired={publishRequired} hint={inLabelHint(hint)} />
      )}

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
        <FieldShell focused={false} invalid={Boolean(error)} disabled={disabled} align="center" compact={compact}>
          {current?.valueLeading ?? null}
          <Text
            f={1}
            // Ô khoá: chữ MỜ như web `disabled`, không đậm như ô chọn được.
            col={(current || compact) && !disabled ? colors.text : v2 ? colors.textPlaceholder : colors.placeholder}
            fos={v2 ? FIELD_V2.selectFontSize : fieldFontSize.value}
            numberOfLines={1}
          >
            {current?.label ?? placeholder ?? t('choose')}
          </Text>
          {/*
            Nút xoá là một Pressable RIÊNG lồng trong vỏ chạm, kèm hitSlop: biểu tượng chỉ 16dp,
            mà một vùng chạm 16dp nằm sát mép phải màn hình là thứ người ta bấm trượt sang mở
            tấm chọn — đúng thao tác họ vừa tránh.
          */}
          {allowClear && current && !disabled ? (
            <Pressable
              onPress={() => onChange('')}
              hitSlop={space.sm}
              accessibilityRole="button"
              accessibilityLabel={t('clearSelection')}
            >
              <Ionicons name="close-circle" size={iconSize.sm} color={colors.textMuted} />
            </Pressable>
          ) : null}
          {v2 ? (
            // Figma "Down 2" (khung 20) - bộ ô `v2` vẽ bằng nét Figma, không bằng Ionicons.
            <LineIcon
              name="chevron-down-md"
              size={FIELD_V2.icon}
              color={disabled ? colors.textDisabled : colors.placeholder}
            />
          ) : (
            <Ionicons
              name="chevron-down"
              size={iconSize.sm}
              color={disabled ? colors.textDisabled : colors.textMuted}
            />
          )}
        </FieldShell>
      </Pressable>

      <FieldMessage error={error} hint={belowHint(hint)} />

      {sheet}
    </YStack>
  );
}
