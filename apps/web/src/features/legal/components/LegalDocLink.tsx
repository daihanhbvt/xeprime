'use client';

import { useState, type MouseEvent, type ReactNode } from 'react';
import { legalPath, type LegalDoc } from '@/constants/legal';
import { LegalDocDialog } from './LegalDocDialog';

interface LegalDocLinkProps {
  readonly doc: LegalDoc;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Liên kết tới một văn bản pháp lý đặt GIỮA một luồng (ô đồng ý, màn thanh toán, tab chính sách
 * của trang xe): bấm thường mở `LegalDocDialog` ngay tại chỗ, không rời trang.
 *
 * Vẫn là một `<a href>` thật trỏ tới `/legal/<doc>` (mở tab mới): Ctrl/Cmd/Shift + bấm, bấm chuột
 * giữa, "mở trong tab mới" của trình duyệt và lúc JavaScript chưa tải đều đi theo liên kết như
 * thường — popup là phần tăng cường, không phải con đường duy nhất tới văn bản.
 *
 * Bấm liên kết nằm trong `<label>` của ô tick không làm đổi ô tick: `<a>` là nội dung tương tác,
 * trình duyệt không chuyển cú bấm đó cho ô.
 */
export function LegalDocLink({ doc, children, className }: LegalDocLinkProps) {
  const [open, setOpen] = useState(false);
  /* Chỉ dựng hộp sau lần bấm đầu tiên, rồi giữ lại để hiệu ứng đóng chạy hết. */
  const [mounted, setMounted] = useState(false);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setMounted(true);
    setOpen(true);
  };

  return (
    <>
      <a
        href={legalPath.doc(doc)}
        target="_blank"
        rel="noreferrer"
        className={className}
        onClick={onClick}
      >
        {children}
      </a>
      {mounted ? <LegalDocDialog doc={doc} open={open} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
