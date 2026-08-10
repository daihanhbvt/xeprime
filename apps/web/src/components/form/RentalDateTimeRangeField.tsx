'use client';

import { Drawer, Popover } from 'antd';
import type { Dayjs } from 'dayjs';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-media-query';
import { cx } from '@/lib/cx';
import { RentalRangePanel, type RentalMode } from './RentalRangePanel';
import styles from './RentalDateTimeRangeField.module.css';

export type { RentalMode } from './RentalRangePanel';

export interface RentalRange {
  pickupAt: Dayjs | null;
  returnAt: Dayjs | null;
}

interface RentalDateTimeRangeFieldProps {
  value: RentalRange;
  onChange: (next: RentalRange) => void;
  /** Độ mịn chọn giờ (tab Thuê theo ngày/giờ) — parent giữ để còn ghi ra URL. */
  mode: RentalMode;
  onModeChange: (mode: RentalMode) => void;
  /** Nhãn hai đầu ở trạng thái đóng — Figma dùng "Nhận xe"/"Trả xe". */
  labels?: { start: string; end: string };
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Icon nằm trong cùng vùng bấm; dùng để toàn bộ viền control đều mở lịch. */
  prefix?: ReactNode;
}

/**
 * Khoảng thời gian thuê — MỘT giá trị `{ pickupAt, returnAt }`, dùng chung cho hero trang chủ
 * và mọi chỗ cần chọn khoảng thuê.
 *
 * Trạng thái đóng hiện HAI đầu "Nhận xe"/"Trả xe" của cùng một khoảng — bấm đầu nào cũng mở
 * CÙNG một hộp lịch. Trong hộp, chọn range theo ngữ nghĩa CHUẨN (bấm mới = bắt đầu range mới):
 * luật "đầu đang sửa" tự chế trước đây chính là nguồn bug lịch tô một đằng giá trị một nẻo (10/08).
 *
 * Overlay: desktop là Popover ngay dưới ô (Figma `177:1657` — lịch đôi); mobile là Drawer đáy
 * màn một tháng. Giá trị chỉ commit khi bấm "Áp dụng" — đóng ngang chừng không phá khoảng cũ.
 */
export function RentalDateTimeRangeField({
  value,
  onChange,
  mode,
  onModeChange,
  labels = { start: 'Nhận xe', end: 'Trả xe' },
  disabled,
  className,
  ariaLabel = 'Thời gian thuê',
  prefix,
}: RentalDateTimeRangeFieldProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RentalRange>(value);

  function openPanel() {
    if (disabled) return;
    setDraft(value);
    setOpen(true);
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  const fmt = (d: Dayjs | null, fallback: string) =>
    d ? d.format(mode === 'daily' ? 'DD/MM/YYYY' : 'DD/MM HH:mm') : fallback;

  const trigger = (
    <button
      type="button"
      className={cx(styles.trigger, className)}
      disabled={disabled}
      onClick={openPanel}
      aria-label={`${ariaLabel}: ${fmt(value.pickupAt, 'chưa chọn')} đến ${fmt(
        value.returnAt,
        'chưa chọn',
      )}`}
    >
      {prefix ? <span className={styles.prefix}>{prefix}</span> : null}
      <span className={styles.endpoint}>{fmt(value.pickupAt, labels.start)}</span>
      <span className={styles.sep} aria-hidden>
        →
      </span>
      <span className={styles.endpoint}>{fmt(value.returnAt, labels.end)}</span>
    </button>
  );

  const panel = (
    <RentalRangePanel
      value={draft}
      onChange={setDraft}
      mode={mode}
      onModeChange={onModeChange}
      months={isMobile ? 1 : 2}
      onApply={apply}
      onCancel={() => setOpen(false)}
    />
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer
          title="Chọn thời gian thuê"
          placement="bottom"
          height="auto"
          open={open}
          onClose={() => setOpen(false)}
          classNames={{ body: styles.drawerBody }}
        >
          {panel}
        </Drawer>
      </>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Chỉ nhận tín hiệu ĐÓNG (Esc/bấm ra ngoài) — mở luôn đi qua openPanel để nạp draft mới.
        if (!next) setOpen(false);
      }}
      trigger={['click']}
      placement="bottomLeft"
      content={<div className={styles.popoverBody}>{panel}</div>}
    >
      {trigger}
    </Popover>
  );
}
