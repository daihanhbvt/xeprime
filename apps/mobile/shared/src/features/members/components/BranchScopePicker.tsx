import { YStack } from 'tamagui';
import { FieldLabel, FieldMessage } from '@/components/ui/Field';
import { MenuOption, MenuOptionList } from '@/components/ui/MenuOption';
import { space } from '@/theme/tokens';
import { toggleBranchSelection, type BranchScopeOption } from '../branch-scope';

/**
 * Danh sách TICK chi nhánh phụ trách — bản native của `<Select mode="multiple">` bên web.
 *
 * Native không có ô chọn nhiều nên mỗi chi nhánh là một dòng bật/tắt; bất biến "không bao giờ
 * rỗng" vẫn giữ nguyên qua `toggleBranchSelection` (cùng `normalizeBranchSelection` của web).
 * Mục bị khoá ("Tất cả" với người bị giới hạn) không dựng: tấm này chỉ mở với thành viên nằm gọn
 * trong phạm vi của người thao tác, nên không có thành viên `all` nào cần thấy nó.
 */
export function BranchScopePicker({
  label,
  value,
  options,
  allowAll,
  hint,
  error,
  required = false,
  onChange,
}: {
  label: string;
  value: readonly string[];
  options: readonly BranchScopeOption[];
  allowAll: boolean;
  hint?: string;
  error?: string;
  required?: boolean;
  onChange: (next: string[]) => void;
}) {
  return (
    <YStack gap={space.xs}>
      <FieldLabel label={label} required={required} />
      <MenuOptionList>
        {options
          .filter((option) => !option.disabled)
          .map((option) => (
            <MenuOption
              key={option.value}
              label={option.label}
              selected={value.includes(option.value)}
              onPress={() => onChange(toggleBranchSelection(value, option.value, allowAll))}
            />
          ))}
      </MenuOptionList>
      <FieldMessage error={error} hint={hint} />
    </YStack>
  );
}
