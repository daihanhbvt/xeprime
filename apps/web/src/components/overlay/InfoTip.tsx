'use client';

import { InfoCircleOutlined } from '@ant-design/icons';
import { Popover } from 'antd';
import { useEffect, useId, useState, type ReactNode } from 'react';

import styles from './InfoTip.module.css';

export interface InfoTipProps {
  label: string;
  children: ReactNode;
  placement?: 'top' | 'topLeft' | 'topRight' | 'bottom' | 'bottomLeft' | 'bottomRight';
}

/**
 * Dấu ⓘ mở ghi chú ngữ cảnh - dùng chung mọi form (sinh ở form chính sách thuê, chuyển lên
 * `components/overlay` 18/11/2026 khi các ô form đổi ghi chú dưới ô thành dấu này).
 *
 * Ba trigger cùng tồn tại có chủ đích: chuột mở bằng hover, bàn phím mở bằng focus, còn thiết
 * bị cảm ứng mở bằng click. Popover của AntD tự đóng khi click ra ngoài; listener Escape bổ sung
 * đường thoát nhất quán kể cả khi focus đã chuyển khỏi nút.
 */
export function InfoTip({ label, children, placement = 'top' }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const contentId = `policy-info-${useId().replaceAll(':', '')}`;

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <Popover
      content={
        <div id={contentId} className={styles.content} role="note">
          {children}
        </div>
      }
      placement={placement}
      trigger={['hover', 'focus', 'click']}
      open={open}
      onOpenChange={setOpen}
      autoAdjustOverflow
    >
      <button
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-expanded={open}
        aria-controls={contentId}
        aria-describedby={open ? contentId : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <InfoCircleOutlined aria-hidden="true" />
      </button>
    </Popover>
  );
}
