'use client';

import { EnvironmentOutlined } from '@ant-design/icons';
import { Select, Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { branchLabel } from '../branch-label';
import { useBranchScope } from '../hooks/use-branch-scope';
import styles from './BranchScopeSelector.module.css';

/** Giá trị sentinel cho "Tất cả chi nhánh" — `Select` của AntD không nhận `null` làm value. */
const ALL = '__all__';

/**
 * Bộ chọn chi nhánh ở thanh trên.
 *
 * Chỉ hiện khi nó có việc thật để làm: người dùng có `branches.view` VÀ gian hàng có từ hai chi
 * nhánh trở lên. Gian hàng một chi nhánh thì hiện TÊN chi nhánh như thông tin ngữ cảnh — một
 * dropdown chỉ có một mục là điều khiển chết, đúng lý do trước đây ô này bị ẩn hẳn.
 *
 * Lựa chọn CHỈ thu hẹp dữ liệu trong gian hàng hiện tại; tenant scope vẫn do backend quyết định.
 */
export function BranchScopeSelector() {
  const t = useTranslations('Branches');
  const scope = useBranchScope();
  const noProvince = t('labels.noProvince');

  const options = useMemo(
    () => [
      { value: ALL, label: t('scope.all') },
      ...scope.options.map((b) => {
        const label = branchLabel(b, noProvince);
        return { value: b.id, label: b.isDefault ? t('scope.defaultOption', { label }) : label };
      }),
    ],
    [scope.options, t, noProvince],
  );

  if (scope.isLoading) return null;

  // Đúng một chi nhánh: hiện ngữ cảnh, không dựng dropdown giả.
  if (!scope.canSelect) {
    const only = scope.options[0];
    if (!only) return null;
    return (
      <Tooltip title={t('scope.single')}>
        <span className={styles.single}>
          <EnvironmentOutlined aria-hidden />
          <span className={styles.singleName}>{branchLabel(only, noProvince)}</span>
        </span>
      </Tooltip>
    );
  }

  return (
    <Select
      className={styles.select}
      value={scope.branchId ?? ALL}
      onChange={(value: string) => scope.select(value === ALL ? null : value)}
      options={options}
      variant="filled"
      suffixIcon={<EnvironmentOutlined aria-hidden />}
      popupMatchSelectWidth={false}
      aria-label={t('scope.label')}
    />
  );
}
