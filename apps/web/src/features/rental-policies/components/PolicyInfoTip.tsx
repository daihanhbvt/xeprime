'use client';

import { InfoCircleOutlined } from '@ant-design/icons';
import { Popover } from 'antd';
import { useEffect, useId, useState, type ReactNode } from 'react';

import styles from './PolicyInfoTip.module.css';

interface PolicyInfoTipProps {
  label: string;
  children: ReactNode;
  placement?: 'top' | 'topLeft' | 'topRight' | 'bottom' | 'bottomLeft' | 'bottomRight';
}

/**
 * Ghi chú ngữ cảnh dùng chung của form policy.
 *
 * Ba trigger cùng tồn tại có chủ đích: chuột mở bằng hover, bàn phím mở bằng focus, còn thiết
 * bị cảm ứng mở bằng click. Popover của AntD tự đóng khi click ra ngoài; listener Escape bổ sung
 * đường thoát nhất quán kể cả khi focus đã chuyển khỏi nút.
 */
export function PolicyInfoTip({ label, children, placement = 'top' }: PolicyInfoTipProps) {
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
