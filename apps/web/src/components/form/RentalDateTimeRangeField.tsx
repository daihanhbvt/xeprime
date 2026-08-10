'use client';

import { Drawer, Popover } from 'antd';
import type { Dayjs } from 'dayjs';
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
}

/**
 * Khoảng thời gian thuê — MỘT giá trị `{ pickupAt, returnAt }`, dùng chung cho hero trang chủ
 * và mọi chỗ cần chọn khoảng thuê.
 *
 * Trạng thái đóng hiện HAI đầu "Nhận xe"/"Trả xe" nhưng chúng là hai nút của cùng một khoảng:
 * bấm đầu nào cũng mở CÙNG một hộp lịch (`RentalRangePanel`), chỉ khác đầu được ưu tiên sửa —
 * bấm "Trả xe" thì cú bấm lịch đầu tiên đổi ngày trả, không reset cả khoảng.
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
}: RentalDateTimeRangeFieldProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<'pickup' | 'return'>('pickup');
  const [draft, setDraft] = useState<RentalRange>(value);

  function openAt(which: 'pickup' | 'return') {
    if (disabled) return;
    setDraft(value);
    setFocus(which);
    setOpen(true);
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  const fmt = (d: Dayjs | null, fallback: string) =>
    d ? d.format(mode === 'daily' ? 'DD/MM/YYYY' : 'DD/MM HH:mm') : fallback;

  const trigger = (
    <div className={cx(styles.trigger, className)} role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className={styles.endpoint}
        disabled={disabled}
        onClick={() => openAt('pickup')}
        aria-label={`${labels.start}: ${fmt(value.pickupAt, 'chưa chọn')}`}
      >
        {fmt(value.pickupAt, labels.start)}
      </button>
      <span className={styles.sep} aria-hidden>
        →
      </span>
      <button
        type="button"
        className={styles.endpoint}
        disabled={disabled}
        onClick={() => openAt('return')}
        aria-label={`${labels.end}: ${fmt(value.returnAt, 'chưa chọn')}`}
      >
        {fmt(value.returnAt, labels.end)}
      </button>
    </div>
  );

  const panel = (
    <RentalRangePanel
      value={draft}
      onChange={setDraft}
      mode={mode}
      onModeChange={onModeChange}
      focus={focus}
      onFocusChange={setFocus}
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
        // Chỉ nhận tín hiệu ĐÓNG (Esc/bấm ra ngoài) — mở luôn đi qua openAt để đặt focus đúng đầu.
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
