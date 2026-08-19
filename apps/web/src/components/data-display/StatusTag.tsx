'use client';

import { Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { STATUS_COLOR, type StatusMeta } from '@xeprime/types';
import type { DomainGroup } from '@/i18n/domain';
import { useDomainLabel } from '@/i18n/use-domain-label';

/**
 * Hiển thị một trạng thái nghiệp vụ.
 *
 * Component KHÔNG biết bất kỳ status cụ thể nào — nó nhận bảng meta từ @xeprime/types.
 * Nhờ vậy thêm status mới chỉ phải sửa một chỗ (ADR 0005), và CLAUDE.md mục 5 (cấm hard
 * code status trong component) được giữ về mặt cấu trúc chứ không chỉ bằng kỷ luật.
 *
 *   <StatusTag value={booking.status} meta={BOOKING_STATUS_META} group="bookingStatus" />
 *
 * `meta` cấp MÀU, `group` cấp NHÃN. Tách đôi vì hai thứ đó đổi theo hai nhịp khác nhau: màu
 * là quyết định thiết kế dùng chung cả web lẫn api, còn nhãn đổi theo ngôn ngữ người xem.
 * `label` tiếng Việt trong meta vẫn là bản dự phòng cho status cũ chưa kịp khai báo message.
 */
export function StatusTag<TStatus extends string>({
  value,
  meta,
  group,
  fallbackLabel,
}: {
  value: TStatus | null | undefined;
  meta: Readonly<Record<TStatus, StatusMeta>>;
  /** Nhóm từ vựng trong `messages/<locale>/domain.json`, ví dụ `bookingStatus`. */
  group: DomainGroup;
  fallbackLabel?: string;
}) {
  const t = useTranslations('Common.labels');
  const domainLabel = useDomainLabel();

  if (!value) return <Tag color={STATUS_COLOR.NEUTRAL}>{fallbackLabel ?? t('emptyValue')}</Tag>;

  const entry = meta[value];

  // Status có trong DB nhưng chưa khai báo meta: hiện giá trị thô thay vì rỗng, để lỗi
  // nhìn thấy được ngay thay vì biến thành ô trống khó truy.
  if (!entry) return <Tag color={STATUS_COLOR.NEUTRAL}>{value}</Tag>;

  return <Tag color={entry.color}>{domainLabel(group, value, entry.label)}</Tag>;
}
