'use client';

import { CalendarOutlined, DollarOutlined, LockOutlined } from '@ant-design/icons';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useIsMobile } from '@/hooks/use-media-query';
import { APP_TIME_ZONE, dayjs } from '@/lib/datetime';
import styles from './CalendarCellActions.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

export type CellActionKey = 'booking' | 'block' | 'price';

/** Ô được chọn + toạ độ neo (px, trong canvas lịch) để đặt panel cạnh ô trên desktop. */
export interface CellActionTarget {
  vehicleId: string;
  vehicleName: string;
  /** Ngày local YYYY-MM-DD của ô. */
  date: string;
  anchor: { left: number; top: number };
}

/**
 * Chỉ ICON nằm ở đây. Nhãn và câu gợi ý đọc từ `Calendar.cellActions.<key>` — mã hành động
 * (`booking`/`block`/`price`) là DỮ LIỆU, chữ hiện ra mới là thứ đổi theo ngôn ngữ.
 */
const ACTION_ICON: Record<CellActionKey, React.ReactNode> = {
  booking: <CalendarOutlined />,
  block: <LockOutlined />,
  price: <DollarOutlined />,
};

/**
 * Bộ chọn hành động khi bấm Ô TRỐNG — lớp đệm bắt buộc trước khi vào một luồng thật, để một
 * cú bấm nhầm không mở thẳng form tạo đơn hay khoá xe.
 *
 * Desktop: panel nhỏ neo cạnh ô (định vị tuyệt đối trong canvas — toạ độ tính từ lưới nên
 * đi qua CSS custom property, ngoại lệ hợp lệ của ADR 0003). Mobile: bottom sheet.
 * Chỉ nhận danh sách hành động ĐÃ lọc theo quyền — không tự biết quyền.
 */
export function CalendarCellActions({
  target,
  actions,
  onSelect,
  onClose,
}: {
  target: CellActionTarget | null;
  actions: readonly CellActionKey[];
  onSelect: (action: CellActionKey) => void;
  onClose: () => void;
}) {
  const fmt = useAppFormat();
  const t = useTranslations('Calendar');
  const isMobile = useIsMobile();
  const panelRef = useRef<HTMLDivElement>(null);

  // Desktop: focus mục đầu khi mở; bấm ngoài / Escape đóng. (Mobile do ResponsiveDialog lo.)
  useEffect(() => {
    if (!target || isMobile) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLButtonElement>('button')?.focus();

    function onPointerDown(e: PointerEvent) {
      if (panel && !panel.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [target, isMobile, onClose]);

  if (!target || actions.length === 0) return null;

  // THỨ phải theo ngôn ngữ ⇒ đi qua formatter của request, không qua locale toàn cục của Day.js.
  const dateLabel = fmt.fullDate(dayjs.tz(target.date, APP_TIME_ZONE));
  const items = actions.map((key) => (
    <button
      key={key}
      type="button"
      role="menuitem"
      className={styles.action}
      onClick={() => onSelect(key)}
    >
      <span className={styles.icon} aria-hidden>
        {ACTION_ICON[key]}
      </span>
      <span className={styles.texts}>
        <span className={styles.label}>{t(`cellActions.${key}.label`)}</span>
        <span className={styles.hint}>{t(`cellActions.${key}.hint`)}</span>
      </span>
    </button>
  ));

  if (isMobile) {
    return (
      <ResponsiveDialog
        open
        onClose={onClose}
        size="sm"
        title={t('cellActions.sheetTitle', { vehicle: target.vehicleName, date: dateLabel })}
        footer={null}
      >
        <div role="menu" aria-label={t('cellActions.menuAriaLabel')} className={styles.sheetList}>
          {items}
        </div>
      </ResponsiveDialog>
    );
  }

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={t('cellActions.panelAriaLabel', { vehicle: target.vehicleName, date: dateLabel })}
      className={styles.panel}
      // Toạ độ chỉ biết lúc runtime (vị trí ô trong lưới) — ngoại lệ hợp lệ của ADR 0003.
      style={
        {
          '--xp-cell-menu-left': `${target.anchor.left}px`,
          '--xp-cell-menu-top': `${target.anchor.top}px`,
        } as React.CSSProperties
      }
    >
      <div className={styles.header}>
        <span className={styles.headerVehicle}>{target.vehicleName}</span>
        <span className={styles.headerDate}>{dateLabel}</span>
      </div>
      {items}
    </div>
  );
}
