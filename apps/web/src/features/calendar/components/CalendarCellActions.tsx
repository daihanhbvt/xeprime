'use client';

import { CalendarOutlined, DollarOutlined, LockOutlined, RightOutlined } from '@ant-design/icons';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useIsMobile } from '@/hooks/use-media-query';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { APP_TIME_ZONE, dayjs } from '@/lib/datetime';
import styles from './CalendarCellActions.module.css';

export type CellActionKey = 'booking' | 'block' | 'price';

/**
 * Khoảng ô được chọn (một ngày khi bấm, nhiều ngày khi kéo chuột) + toạ độ neo (px, trong canvas
 * lịch) để đặt panel cạnh khoảng trên desktop.
 */
export interface CellActionTarget {
  vehicleId: string;
  vehicleName: string;
  /** Ngày local `YYYY-MM-DD` ĐẦU khoảng. */
  date: string;
  /** Ngày local `YYYY-MM-DD` CUỐI khoảng (tính cả) — bằng `date` khi chọn một ô. */
  endDate: string;
  /** Khoảng có event CHIẾM lịch nào không — chỉ để nói "Ngày trống" / "Đã có lịch". */
  free: boolean;
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
 * Bảng chọn hành động khi bấm Ô TRỐNG hoặc thả chuột sau khi kéo chọn nhiều ngày (design
 * `24200:99425`) — lớp đệm bắt buộc trước khi vào một luồng thật, để một cú bấm nhầm không mở thẳng
 * form tạo đơn hay khoá xe. Mục đầu là hành động chính (viền vàng).
 *
 * Desktop: panel neo cạnh khoảng chọn. Mobile: bottom sheet. Chỉ nhận danh sách hành động ĐÃ lọc
 * theo quyền — không tự biết quyền.
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
    panel?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });

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

  const from = dayjs.tz(target.date, APP_TIME_ZONE);
  const to = dayjs.tz(target.endDate, APP_TIME_ZONE);
  const dayCount = to.diff(from, 'day') + 1;
  const multi = dayCount > 1;
  // Ngày/tháng theo NGÔN NGỮ (`DD/MM` ở vi, `MM/DD` ở en) — qua formatter, không gõ mẫu.
  const fromLabel = fmt.dayMonth(from.toISOString());
  const toLabel = fmt.dayMonth(to.toISOString());
  // THỨ phải theo ngôn ngữ ⇒ đi qua formatter của request, không qua locale toàn cục của Day.js.
  const dateLabel = multi
    ? t('cellActions.rangeLabel', { from: fromLabel, to: toLabel, count: dayCount })
    : t('cellActions.singleDate', {
        weekday: fmt.weekdayShort(from),
        date: fmt.dateKey(target.date),
      });
  const status = t(target.free ? 'cellActions.free' : 'cellActions.busy');

  const hintFor = (key: CellActionKey) =>
    key === 'booking'
      ? t('cellActions.bookingFrom', {
          from: fromLabel,
          // Ngày TRẢ của đơn sắp lập: N ô = N ngày thuê, trả sáng hôm sau ô cuối (khớp `runCellAction`).
          to: fmt.dayMonth(to.add(1, 'day').toISOString()),
        })
      : t(`cellActions.${key}.${multi ? 'hintRange' : 'hint'}`);

  const items = actions.map((key, index) => (
    <button
      key={key}
      type="button"
      role="menuitem"
      className={cx(styles.action, index === 0 && styles.primary)}
      onClick={() => onSelect(key)}
    >
      <span className={styles.icon} aria-hidden>
        {ACTION_ICON[key]}
      </span>
      <span className={styles.texts}>
        <span className={styles.label}>{t(`cellActions.${key}.label`)}</span>
        <span className={styles.hint}>{hintFor(key)}</span>
      </span>
      <RightOutlined className={styles.chevron} aria-hidden />
    </button>
  ));

  if (isMobile) {
    return (
      <ResponsiveDialog open onClose={onClose} size="sm" title={target.vehicleName} footer={null}>
        <p className={styles.sheetDate}>
          {t('cellActions.dateStatus', { date: dateLabel, status })}
        </p>
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
        <span className={styles.headerDate}>
          {t('cellActions.dateStatus', { date: dateLabel, status })}
        </span>
      </div>
      <div className={styles.list}>{items}</div>
    </div>
  );
}
