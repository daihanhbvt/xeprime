'use client';

import { Popover, Switch, Tag } from 'antd';
import {
  CloseOutlined,
  DollarOutlined,
  FlagFilled,
  LockOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { HOLIDAY_EVENT_TYPE_META, type HolidayEventType } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import type { Dayjs } from '@/lib/datetime';
import type { Holiday } from '../types/calendar.types';
import styles from './CalendarScheduler.module.css';

/** Một cột ngày của lưới. */
export interface DayCell {
  key: string;
  at: Dayjs;
  dayOfMonth: number;
  isToday: boolean;
  isWeekend: boolean;
}

/** Hai thao tác cả-đội-xe mở từ ô ngày ở header. Mã, không phải chữ. */
export type DayActionKey = 'block' | 'price';

/**
 * Một cột ngày ở header (design `24186:88164`): thứ + số ngày; hôm nay là viên vàng; cuối tuần và
 * ngày lễ chữ đỏ trên nền đỏ nhạt; ngày lễ thêm một lá cờ.
 *
 * Đồng thời là ĐƯỜNG VÀO các thao tác cả-đội-xe cho ngày đó — design không vẽ, giữ theo chốt
 * 25/11/2026. Mở bằng CLICK (không hover): bảng chứa hành động thật, và trên cảm ứng không có hover.
 */
export function CalendarDayHeader({
  day,
  holiday,
  actions,
  panel,
  onToggle,
}: {
  day: DayCell;
  holiday: Holiday | undefined;
  /** Rỗng = người dùng không có quyền thao tác nào ⇒ cột không phải nút. */
  actions: readonly DayActionKey[];
  /** Nội dung bảng, chỉ dựng cho cột ĐANG mở — 30 cột không được sinh 30 bảng. */
  panel: React.ReactNode | null;
  onToggle: () => void;
}) {
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();

  const className = cx(
    styles.dayHeaderCell,
    day.isWeekend && styles.weekend,
    holiday && styles.holiday,
    day.isToday && styles.today,
  );

  const label = (
    <>
      <span className={styles.weekdayLabel}>{fmt.weekdayShort(day.at)}</span>
      <span className={styles.dayNumber}>{day.dayOfMonth}</span>
      {holiday ? <FlagFilled className={styles.holidayFlag} aria-hidden /> : null}
    </>
  );

  // Không quyền nào và không phải ngày lễ ⇒ không có gì để mở, đừng mời người dùng bấm.
  if (actions.length === 0 && !holiday) return <div className={className}>{label}</div>;

  const date = fmt.dateKey(day.key);
  const ariaLabel = holiday
    ? t('dayPanel.triggerHoliday', { name: holiday.name, date })
    : t('dayPanel.trigger', { date });

  // Popover neo vào CHÍNH nút của cột này — bám đúng cột khi cuộn ngang.
  return (
    <div className={className}>
      <Popover
        open={panel !== null}
        trigger={[]}
        placement="bottom"
        content={panel}
        onOpenChange={(next) => {
          if (!next) onToggle();
        }}
      >
        <button
          type="button"
          className={styles.dayTrigger}
          aria-haspopup="dialog"
          aria-expanded={panel !== null}
          aria-label={ariaLabel}
          onClick={onToggle}
        >
          {label}
        </button>
      </Popover>
    </div>
  );
}

/**
 * Bảng của một ngày: ngày (+ tên ngày lễ) và các thao tác cả-đội-xe, cùng khuôn mục của bảng thao
 * tác ô (design `24200:99430`).
 *
 * Mục "Khoá xe nhanh" có HAI đích bấm và đó là chủ đích:
 *  - **Công tắc** = khoá NGAY mọi xe rảnh trong đúng ngày này, lý do mặc định; gạt ngược lại gỡ
 *    đúng lô vừa tạo.
 *  - **"Khoá nhiều ngày"** = mở hộp đầy đủ (nhiều ngày, đổi lý do, ghi chú, xem trước).
 */
export function CalendarDayPanel({
  day,
  holiday,
  actions,
  blockState,
  onClose,
  onQuickBlock,
  onRelease,
  onOpenBlockDialog,
  onPrice,
}: {
  day: DayCell;
  holiday: Holiday | undefined;
  actions: readonly DayActionKey[];
  /** Lô khoá hàng loạt đang phủ ngày này — quyết định công tắc bật hay tắt. */
  blockState: { batchId: string | null; loading: boolean; busy: boolean };
  /** Bảng mở bằng click nên đóng cũng bằng một nút rõ ràng (cảm ứng không có "rời chuột"). */
  onClose: () => void;
  onQuickBlock: (dateKey: string) => void;
  onRelease: (batchId: string) => void;
  onOpenBlockDialog: () => void;
  onPrice: () => void;
}) {
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const typeMeta = holiday
    ? HOLIDAY_EVENT_TYPE_META[holiday.eventType as HolidayEventType]
    : undefined;

  return (
    <div className={styles.dayPanel}>
      <div className={styles.dayPanelHead}>
        <span className={styles.dayPanelTop}>
          <span className={styles.dayPanelDate}>
            {t('dayPanel.heading', {
              weekday: fmt.weekdayLong(day.at),
              date: fmt.dateKey(day.key),
            })}
          </span>
          <button
            type="button"
            className={styles.dayPanelClose}
            aria-label={tCommon('actions.close')}
            onClick={onClose}
          >
            <CloseOutlined />
          </button>
        </span>
        {holiday ? (
          <span className={styles.dayPanelHoliday}>
            <FlagFilled aria-hidden className={styles.holidayFlagInline} />
            <span className={styles.dayPanelHolidayName}>{holiday.name}</span>
            <Tag color={typeMeta?.color}>
              {domainLabel('holidayEventType', holiday.eventType, typeMeta?.label)}
            </Tag>
          </span>
        ) : null}
      </div>

      {actions.includes('block') ? (
        <div className={styles.actionItem}>
          <span className={styles.actionIcon} aria-hidden>
            <LockOutlined />
          </span>
          <span className={styles.actionTexts}>
            <span className={styles.actionLabel}>{t('dayPanel.blockAll')}</span>
            {/* Lối vào hộp nhiều ngày — chữ riêng, để "gạt khoá ngay" và "mở hộp" không lẫn nhau. */}
            <button type="button" className={styles.actionLink} onClick={onOpenBlockDialog}>
              {t('dayPanel.blockMultiDay')}
            </button>
          </span>
          <Switch
            checked={blockState.batchId !== null}
            loading={blockState.loading || blockState.busy}
            aria-label={t('dayPanel.blockAll')}
            onChange={(next) => {
              if (next) onQuickBlock(day.key);
              else if (blockState.batchId) onRelease(blockState.batchId);
            }}
          />
        </div>
      ) : null}

      {actions.includes('price') ? (
        <button type="button" className={styles.actionItem} onClick={onPrice}>
          <span className={styles.actionIcon} aria-hidden>
            <DollarOutlined />
          </span>
          <span className={styles.actionTexts}>
            <span className={styles.actionLabel}>{t('dayPanel.priceAll')}</span>
            <span className={styles.actionHint}>{t('dayPanel.priceAllHint')}</span>
          </span>
          <RightOutlined className={styles.actionChevron} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
