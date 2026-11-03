'use client';

import { STATUS_COLOR, type StatusColor, type StatusMeta } from '@xeprime/types';
import type { DomainGroup } from '@/i18n/domain';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import styles from './StatusBadge.module.css';

/**
 * Nhãn trạng thái kiểu Figma "_Badge" có chấm (site partner, Figma Partner-XePrime 02/11/2026):
 * nền nhạt, viền cùng sắc, chấm màu đứng trước chữ.
 *
 * Cùng hợp đồng với `StatusTag` — `meta` cấp MÀU, `group` cấp NHÃN (ADR 0005) — chỉ khác hình.
 * Bản tag AntD vẫn là mặc định ở mọi màn chưa ráp design mới; nơi nào design vẽ viên có chấm thì
 * dùng cái này, không tự vẽ lại một viên thứ hai.
 */
export function StatusBadge<TStatus extends string>({
  value,
  meta,
  group,
  tone,
  className,
}: {
  value: TStatus;
  meta: Readonly<Record<TStatus, StatusMeta>>;
  group: DomainGroup;
  /** Ghi đè SẮC khi design của màn nhóm trạng thái theo nghĩa riêng; nhãn vẫn đọc từ `group`. */
  tone?: StatusColor;
  className?: string;
}) {
  const domainLabel = useDomainLabel();
  const entry = meta[value] as StatusMeta | undefined;
  return (
    <ToneDotBadge color={tone ?? entry?.color} className={className}>
      {/* Trạng thái chưa khai meta: hiện mã thô để lỗi nhìn thấy được, không thành ô trống. */}
      {entry ? domainLabel(group, value, entry.label) : value}
    </ToneDotBadge>
  );
}

/** Cùng viên có chấm, cho nhãn mà nơi gọi tự dịch (vd. "Khách không đến" trên thẻ đơn). */
export function ToneDotBadge({
  color,
  className,
  children,
}: {
  color: StatusColor | undefined;
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={cx(styles.badge, toneClass(color), className)}>{children}</span>;
}

function toneClass(color: StatusColor | undefined): string | undefined {
  switch (color) {
    case STATUS_COLOR.SUCCESS:
      return styles.success;
    case STATUS_COLOR.DANGER:
      return styles.danger;
    case STATUS_COLOR.WARNING:
    case STATUS_COLOR.WAITING:
      return styles.warning;
    case STATUS_COLOR.INFO:
    case STATUS_COLOR.PROCESSING:
      return styles.info;
    case STATUS_COLOR.ACCENT:
      return styles.accent;
    default:
      return styles.neutral;
  }
}
