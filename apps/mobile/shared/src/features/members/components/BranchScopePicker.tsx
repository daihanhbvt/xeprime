import { MultiSelectControl } from '@/components/ui/MultiSelectControl';
import {
  BRANCH_SCOPE_ALL,
  toggleBranchSelection,
  type BranchScopeOption,
} from '../branch-scope';

/**
 * Ô chọn chi nhánh phụ trách — bản native của `<Select mode="multiple">` bên web
 * (`MemberBranchScopeSelect`): các chi nhánh đã chọn là thẻ có nút ×, chạm ô mở tấm chọn nhiều.
 *
 * Luật của ô nằm ở đây, không ở `MultiSelectControl`: "Tất cả chi nhánh" loại trừ chi nhánh cụ
 * thể và quay lại khi gỡ chi nhánh cuối, ô không bao giờ rỗng (`toggleBranchSelection`, cùng
 * `normalizeBranchSelection` của web). Mục bị khoá ("Tất cả" với người bị giới hạn) không dựng
 * trong tấm chọn.
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
    <MultiSelectControl
      label={label}
      required={required}
      value={value}
      options={options}
      nonRemovable={[BRANCH_SCOPE_ALL]}
      onToggle={(next) => onChange(toggleBranchSelection(value, next, allowAll))}
      {...(hint === undefined ? {} : { hint })}
      {...(error === undefined ? {} : { error })}
    />
  );
}
