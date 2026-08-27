'use client';

import { Popover } from 'antd';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useIsMobile } from '@/hooks/use-media-query';
import { cx } from '@/lib/cx';
import styles from './SearchPopover.module.css';

interface SearchPopoverProps {
  /** Tiêu đề panel — hiện trong popover ở desktop, làm tiêu đề sheet ở mobile. */
  title: string;
  /** Nội dung bên trong nút mở (icon + giá trị đang chọn). */
  trigger: ReactNode;
  /** Tên khả truy cập của nút mở — luôn kèm giá trị hiện tại, không chỉ tên trường. */
  triggerLabel: string;
  triggerClassName?: string;
  children: (close: () => void) => ReactNode;
  /** Bề rộng panel desktop; mobile luôn chiếm trọn bề ngang sheet. */
  panelSize?: 'sm' | 'md';
  /**
   * Nơi render popup. Mặc định `<body>` là đúng cho ô nằm trong luồng trang, nhưng SAI cho ô
   * nằm trong thanh `position: fixed`: popup ở `<body>` được đặt theo toạ độ TÀI LIỆU nên cuộn
   * một cái là nó trôi khỏi ô. Thanh thu gọn truyền chính nó vào đây.
   */
  popupContainer?: () => HTMLElement;
}

/**
 * Vỏ cho MỌI panel chỉnh sửa của thẻ tìm kiếm (địa điểm, loại xe + dịch vụ, lộ trình):
 * **Popover neo vào chính nút vừa bấm** trên desktop, **bottom sheet** ở ≤640px.
 *
 * Vì sao tồn tại: hero và thanh thu gọn là hai bề mặt khác nhau của cùng một trạng thái, nên
 * mỗi bên phải có NÚT và NEO riêng — bấm ô địa điểm ở thanh thu gọn mà panel bung ra ở hero
 * (đang nằm ngoài màn hình) là hỏng. Vỏ này giữ phần "neo đúng chỗ + đóng đúng cách" ở một nơi.
 *
 * Component tự dựng cả cái NÚT (chỉ nhận nội dung + nhãn) thay vì để nơi gọi tự dựng: có vậy
 * `ref`, `aria-expanded`/`aria-haspopup`/`aria-controls` mới không thể bị quên ở một trong ba
 * chỗ dùng, và ref gắn thẳng vào JSX chứ không đi qua một callback chạy lúc render.
 *
 * Ba hành vi mà `Popover` trần không cấp, và mỗi chỗ tự chế lại sẽ lệch nhau:
 *   - **Esc đóng.** rc-trigger không nghe phím; ở đây nghe trên `document` khi đang mở.
 *   - **Trả focus về nút đã mở** sau khi đóng — nhưng CHỈ khi focus đang rơi về `<body>`.
 *     Bấm sang một nút khác thì nút đó đã nhận focus; cướp lại là phá luồng bàn phím.
 *   - **Chỉ một panel mở tại một thời điểm** — dùng đúng cơ chế outside-click sẵn có của
 *     rc-trigger (bấm vào nút của panel khác = bấm ra ngoài panel này ⇒ nó tự đóng), thay vì
 *     dựng thêm một state "panel nào đang mở" để có dịp lệch với trạng thái thật của overlay.
 */
export function SearchPopover({
  title,
  trigger,
  triggerLabel,
  triggerClassName,
  children,
  panelSize = 'md',
  popupContainer,
}: SearchPopoverProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Trả focus khi panel ĐÓNG. Chỉ khi focus đã rơi về `<body>`: đóng vì bấm sang nút khác thì
  // nút đó đang giữ focus, giật lại là phá luồng bàn phím.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && document.activeElement === document.body) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  /*
   * Đưa focus VÀO panel khi mở (chỉ desktop — mobile là Drawer, AntD đã tự bẫy focus).
   *
   * Bắt buộc vì Popover render nội dung qua portal ở cuối `<body>`: theo thứ tự DOM, Tab từ nút
   * mở sẽ nhảy sang ô KẾ TIẾP trên thanh tìm kiếm chứ không vào panel. Không có bước này thì
   * panel loại xe/dịch vụ và panel lộ trình không thể dùng được bằng bàn phím.
   *
   * `contains` guard: panel nào tự lấy focus (ô tìm tỉnh có `autoFocus`) thì không giật lại.
   */
  useEffect(() => {
    if (!open || isMobile) return;
    const raf = requestAnimationFrame(() => {
      const panel = document.getElementById(panelId);
      // `preventScroll` là bắt buộc: focus mặc định sẽ CUỘN phần tử vào tầm nhìn, và với popup
      // vừa mở ra thì trình duyệt giật trang lên đầu — đúng triệu chứng "nháy thanh cuộn".
      if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [open, isMobile, panelId]);

  const triggerNode = (
    <button
      ref={triggerRef}
      type="button"
      className={triggerClassName}
      aria-label={triggerLabel}
      aria-expanded={open}
      aria-haspopup="dialog"
      // Trỏ tới một id chưa tồn tại lúc đóng là tham chiếu chết — chỉ khai khi panel có thật.
      aria-controls={open ? panelId : undefined}
      onClick={() => setOpen((prev) => !prev)}
    >
      {trigger}
    </button>
  );

  const close = () => setOpen(false);

  if (isMobile) {
    return (
      <>
        {triggerNode}
        <ResponsiveDialog
          open={open}
          onClose={close}
          title={title}
          size="sm"
          mobileMode="sheet"
          footer={null}
        >
          <div id={panelId}>{children(close)}</div>
        </ResponsiveDialog>
      </>
    );
  }

  return (
    <Popover
      open={open}
      // Chỉ nhận tín hiệu ĐÓNG (bấm ra ngoài); mở luôn đi qua nút, nếu không hai nguồn đá nhau.
      onOpenChange={(next) => {
        if (!next) setOpen(false);
      }}
      trigger={['click']}
      placement="bottomLeft"
      arrow={false}
      getPopupContainer={popupContainer}
      classNames={{ container: styles.popoverBody }}
      content={
        // Dialog KHÔNG modal: Esc đóng và focus quay về nút, nhưng trang phía sau vẫn dùng được.
        <div
          id={panelId}
          role="dialog"
          aria-label={title}
          // Nhận được focus bằng script (không nằm trong luồng Tab) — xem effect đưa focus vào.
          tabIndex={-1}
          className={cx(styles.panel, panelSize === 'sm' && styles.panelSm)}
        >
          <p className={styles.title}>{title}</p>
          {children(close)}
        </div>
      }
    >
      {triggerNode}
    </Popover>
  );
}
