'use client';

import { useTranslations } from 'next-intl';
import { EmptyState } from './EmptyState';

/**
 * Ô rỗng MẶC ĐỊNH của antd (Table, List, Select, Transfer…) — gắn qua `ConfigProvider.renderEmpty`
 * ở `app/providers.tsx`, nên mọi bảng/danh sách chưa tự truyền ô rỗng riêng đều mang hình "Không tìm
 * thấy kết quả" của bản vẽ chung (Figma `22306:67026`) thay vì hộp xám của antd.
 *
 * Ô chọn (Select/Cascader…) chỉ có chỗ cho một dòng chữ — giữ câu ngắn, không hình.
 */
export function AntdEmpty({ componentName }: { componentName?: string }) {
  const t = useTranslations('Common.statePages.noResults');
  if (componentName && COMPACT.has(componentName)) {
    return <span className="xp-antd-empty-compact">{t('title')}</span>;
  }
  return <EmptyState variant="no-results" title={t('title')} description={t('description')} />;
}

const COMPACT = new Set(['Select', 'TreeSelect', 'Cascader', 'AutoComplete', 'Mentions']);
