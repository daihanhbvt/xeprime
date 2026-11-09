'use client';

import { Tag } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { STATUS_COLOR, type StatusColor, type StatusMeta } from '@xeprime/types';
import type { DomainGroup } from '@/i18n/domain';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';

import styles from './StatusTag.module.css';

const PILL_TONE: Readonly<Record<StatusColor, string | undefined>> = {
  [STATUS_COLOR.NEUTRAL]: undefined,
  [STATUS_COLOR.INFO]: styles.info,
  [STATUS_COLOR.PROCESSING]: styles.processing,
  [STATUS_COLOR.SUCCESS]: styles.success,
  [STATUS_COLOR.WAITING]: styles.waiting,
  [STATUS_COLOR.WARNING]: styles.warning,
  [STATUS_COLOR.DANGER]: styles.danger,
  [STATUS_COLOR.SPECIAL]: styles.processing,
  [STATUS_COLOR.ACCENT]: styles.danger,
};

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
  appearance = 'tag',
}: {
  value: TStatus | null | undefined;
  meta: Readonly<Record<TStatus, StatusMeta>>;
  /** Nhóm từ vựng trong `messages/<locale>/domain.json`, ví dụ `bookingStatus`. */
  group: DomainGroup;
  fallbackLabel?: string;
  /**
   * `tag` (mặc định) = AntD `Tag` 12px. `pill` = viên "_Badge" 14/20 của các màn partner đã
   * redesign (11/2026). Cùng bảng meta, chỉ khác hình.
   */
  appearance?: 'tag' | 'pill';
}) {
  const t = useTranslations('Common.labels');
  const domainLabel = useDomainLabel();

  const render = (color: StatusColor, label: string) =>
    appearance === 'pill' ? (
      <StatusPill color={color}>{label}</StatusPill>
    ) : (
      <Tag color={color}>{label}</Tag>
    );

  if (!value) return render(STATUS_COLOR.NEUTRAL, fallbackLabel ?? t('emptyValue'));

  const entry = meta[value];

  // Status có trong DB nhưng chưa khai báo meta: hiện giá trị thô thay vì rỗng, để lỗi
  // nhìn thấy được ngay thay vì biến thành ô trống khó truy.
  if (!entry) return render(STATUS_COLOR.NEUTRAL, value);

  return render(entry.color, domainLabel(group, value, entry.label));
}

/** Viên "_Badge" 14/20 (biến thể `pill`) cho nhãn KHÔNG đi từ bảng meta — vd "Chưa có tỉnh/thành". */
export function StatusPill({ color, children }: { color: StatusColor; children: ReactNode }) {
  return <span className={cx(styles.pill, PILL_TONE[color])}>{children}</span>;
}
