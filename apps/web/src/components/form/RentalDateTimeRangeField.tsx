'use client';

import { Drawer, Popover } from 'antd';
import type { Dayjs } from 'dayjs';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-media-query';
import { cx } from '@/lib/cx';
import { formatRentalDuration, formatRentalPoint } from '@/lib/datetime';
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
  /**
   * `compact` (mặc định): hai giá trị nối bằng mũi tên — cho ô hẹp trong thanh tìm kiếm, nơi đã
   * có nhãn "Thời gian thuê" ở ngoài.
   *
   * `labelled`: mỗi đầu mang nhãn riêng ("Nhận xe: …") ngăn bằng vạch đứng, kèm viên thời lượng
   * bên phải. Dùng ở chỗ rộng, khi ô này là control chính của màn và không được phép mơ hồ đầu
   * nào là nhận / đầu nào là trả.
   */
  variant?: 'compact' | 'labelled';
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
  variant = 'compact',
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

  /**
   * `T6, 08/08 · 10:00` — có THỨ, không có năm (xem `formatRentalPoint`). Chế độ theo ngày vẫn
   * hiện giờ vì giờ nhận/trả là thứ quyết định ngày tính tiền, không phải chi tiết phụ.
   */
  const fmt = (d: Dayjs | null, fallback: string) => (d ? formatRentalPoint(d) : fallback);

  const complete = Boolean(value.pickupAt && value.returnAt);
  const ariaValue = `${ariaLabel}: ${fmt(value.pickupAt, 'chưa chọn')} đến ${fmt(
    value.returnAt,
    'chưa chọn',
  )}`;

  const trigger =
    variant === 'labelled' ? (
      <button
        type="button"
        className={cx(styles.trigger, styles.triggerLabelled, className)}
        disabled={disabled}
        onClick={openPanel}
        aria-label={ariaValue}
      >
        {prefix ? <span className={styles.prefix}>{prefix}</span> : null}
        <span className={styles.endpointLabelled}>
          <span className={styles.endpointLabel}>{labels.start}:</span>
          <span className={styles.endpointValue}>{fmt(value.pickupAt, 'Chọn ngày giờ')}</span>
        </span>
        <span className={styles.divider} aria-hidden />
        <span className={styles.endpointLabelled}>
          <span className={styles.endpointLabel}>{labels.end}:</span>
          <span className={styles.endpointValue}>{fmt(value.returnAt, 'Chọn ngày giờ')}</span>
        </span>
        {complete ? (
          <span className={styles.durationPill}>
            {formatRentalDuration(value.pickupAt!, value.returnAt!)}
          </span>
        ) : null}
      </button>
    ) : (
      <button
        type="button"
        className={cx(styles.trigger, className)}
        disabled={disabled}
        onClick={openPanel}
        aria-label={ariaValue}
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
          size="auto"
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
