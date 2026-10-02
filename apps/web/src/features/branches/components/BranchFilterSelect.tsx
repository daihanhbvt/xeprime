'use client';

import { Select } from 'antd';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { ALL_FILTER } from '@/constants/filters';

import type { BranchFilterState } from '../hooks/use-branch-filter';

/**
 * Ô lọc chi nhánh cho các màn KHÔNG dùng `FilterBar` — ADR 0052.
 *
 * Màn nào có `FilterBar` thì dựng ô từ `branch.field` và không cần component này. Nhưng Tổng quan,
 * Lịch và hộp chọn xe của người bán có thanh công cụ riêng, nên trước đây mỗi màn tự dựng một
 * `Select`: ba bản chép của cùng một quy ước (`ALL_FILTER` là một GIÁ TRỊ thật, nhãn đổi khi bị
 * khoá, chỉ cho gõ tìm khi danh sách dài). Và bản thứ ba đã trôi đúng như mọi bản chép thứ ba:
 * `StaffVehiclePicker` quên `locked`, nên một nhân viên chỉ phụ trách một chi nhánh vẫn thấy ô
 * mời họ chọn "Tất cả chi nhánh" — một lựa chọn mà server sẽ lặng lẽ thu hẹp lại.
 *
 * Nên quy ước sống ở ĐÂY, một lần. Màn hình chỉ còn truyền phần thật sự khác nhau: lớp CSS, cỡ ô,
 * và cái icon đứng trước.
 */
export function BranchFilterSelect({
  branch,
  value,
  className,
  size,
  prefix,
}: {
  branch: BranchFilterState;
  /** `branchId` trên URL — nguồn sự thật duy nhất của bộ lọc (ADR 0004). */
  value: string | null | undefined;
  className?: string;
  size?: 'small' | 'middle' | 'large';
  prefix?: ReactNode;
}) {
  const t = useTranslations('Branches');

  if (!branch.visible) return null;

  /*
   * Bị giới hạn đúng một chi nhánh: ô KHOÁ và mang tên chi nhánh đó. Cả `ALL_FILTER` (URL không
   * mang gì) lẫn id thật (đến từ một link) đều phải hiện cùng một nhãn, vì với người này "tất cả
   * phần tôi thấy" CHÍNH LÀ chi nhánh của họ — server đã thu hẹp sẵn, ô chỉ nói lại cho đúng.
   */
  const allOption = branch.locked
    ? { value: ALL_FILTER, label: branch.options[0]!.label }
    : { value: ALL_FILTER, label: t('scope.all') };

  return (
    <Select
      className={className}
      size={size}
      value={value ?? ALL_FILTER}
      onChange={(next: string) => branch.select(next === ALL_FILTER ? undefined : next)}
      disabled={branch.locked}
      options={[allOption, ...branch.options]}
      prefix={prefix}
      // Ô khoá thì không có gì để gõ tìm; danh sách ngắn thì ô tìm kiếm chỉ là một bước thừa.
      showSearch={!branch.locked && branch.options.length > 8}
      optionFilterProp="label"
      // Nhãn là `Tên · Tỉnh`, dài hơn hẳn ô lọc — bám bề rộng ô thì hai chi nhánh cùng tỉnh
      // trông y hệt nhau.
      popupMatchSelectWidth={false}
      aria-label={t('filter.label')}
    />
  );
}
