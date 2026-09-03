'use client';

import { Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { PlanFeature } from '@xeprime/types';
import { useFeature } from '@/hooks/use-feature';

/**
 * Bọc một nút GHI của tính năng nâng cao: ở `read_only` thì nút bị khoá và có lời giải thích.
 *
 * Vì sao là một component chứ không phải `disabled={!canWrite}` rải khắp nơi: một nút bị khoá mà
 * không nói lý do là lỗi giao diện tệ nhất trong nhóm này — người dùng tưởng hệ thống hỏng. Gom
 * lại thì câu chữ và cách khoá giống nhau ở mọi khu, và đổi một lần là đổi cả tám.
 *
 * `<span>` bọc ngoài là bắt buộc: AntD `Tooltip` gắn sự kiện chuột lên phần tử con, mà nút
 * `disabled` không phát sự kiện nào — không có span thì lời giải thích không bao giờ hiện.
 *
 * ⚠️ Đây là lớp TRẢI NGHIỆM. Lớp chặn thật là `PlanFeatureGuard` ở backend (ADR 0027 điều 4);
 * ẩn/khoá nút mà không có guard chỉ là trang trí.
 */
export function FeatureWriteTooltip({
  feature,
  children,
}: {
  feature: PlanFeature;
  /** Nhận `disabled` đã tính sẵn — nút tự quyết định gắn nó vào đâu. */
  children: (disabled: boolean) => ReactElement;
}) {
  const t = useTranslations('ManageCommon');
  const { canWrite } = useFeature(feature);

  if (canWrite) return children(false);
  return (
    <Tooltip title={t('feature.readOnlyTooltip')}>
      <span>{children(true)}</span>
    </Tooltip>
  );
}
