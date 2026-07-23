'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { Alert, Empty, Spin } from 'antd';
import { useRef } from 'react';
import { BOOKING_STATUS_META, OCCUPANCY_SOURCE_TYPE, type BookingStatus } from '@xeprime/types';
import { useCalendarData } from '../hooks/use-calendar-data';
import { listDays } from '../utils/calendar-date.util';
import { assignLanes, computeEventPosition } from '../utils/calendar-position.util';
import type { CalendarEvent } from '../types/calendar.types';
import { CalendarToolbar } from './CalendarToolbar';
import styles from './CalendarScheduler.module.css';

const DAY_WIDTH_PX = 64;
const ROW_HEIGHT_PX = 56;
const RESOURCE_COL_WIDTH_PX = 220;

/**
 * Abstraction lịch của XePrime — mọi màn nghiệp vụ chỉ nói chuyện với component này.
 *
 * Lý do có abstraction (fe_base_stack §3): logic grid/drag/date math không được rải ra
 * khắp app, để sau này đổi cách render không phải sửa nghiệp vụ.
 *
 * Phase 0: read-only.
 * TODO Phase 4 — click ô trống tạo đơn, click event mở chi tiết, drag/resize đổi lịch.
 * Drag PHẢI gọi API và để backend quyết định (ADR 0006): UI không được tự kết luận là
 * khoảng trống hợp lệ, vì người khác có thể vừa đặt vào đó.
 */
export function CalendarScheduler() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { range, resources, eventsByResource, isLoading, error } = useCalendarData();

  const rowVirtualizer = useVirtualizer({
    count: resources.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    // 1.000 xe × 30 ngày là kịch bản thật (fe_base_stack §9). Không virtualize thì
    // trình duyệt phải giữ hàng chục nghìn node và cuộn sẽ giật.
    overscan: 8,
  });

  const days = listDays(range);

  return (
    <div className={styles.wrapper}>
      <CalendarToolbar />

      {error ? (
        <Alert
          type="error"
          showIcon
          message="Không tải được lịch"
          description={error instanceof Error ? error.message : String(error)}
        />
      ) : null}

      <div
        ref={scrollRef}
        className={styles.scrollArea}
        style={
          {
            '--xp-day-width': `${DAY_WIDTH_PX}px`,
            '--xp-resource-col-width': `${RESOURCE_COL_WIDTH_PX}px`,
          } as React.CSSProperties
        }
      >
        {isLoading ? (
          <div className={styles.emptyState}>
            <Spin tip="Đang tải lịch..." />
          </div>
        ) : resources.length === 0 ? (
          <div className={styles.emptyState}>
            <Empty description="Chưa có xe nào khớp bộ lọc" />
          </div>
        ) : (
          <div className={styles.grid}>
            <div className={styles.headerRow}>
              <div className={styles.resourceHeader}>Xe ({resources.length})</div>
              <div className={styles.dayHeaderTrack}>
                {days.map((day) => (
                  <div
                    key={day.key}
                    className={[
                      styles.dayHeaderCell,
                      day.isWeekend ? styles.weekend : '',
                      day.isToday ? styles.today : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className={styles.weekdayLabel}>{day.weekdayLabel}</span>
                    <span>{day.dayOfMonth}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'contents' }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const resource = resources[virtualRow.index];
                if (!resource) return null;

                const events = eventsByResource.get(resource.id) ?? [];
                const laned = assignLanes(events);

                return (
                  <div key={resource.id} style={{ display: 'contents' }}>
                    <div className={styles.resourceCell} style={{ height: ROW_HEIGHT_PX }}>
                      <span className={styles.resourceName}>{resource.name}</span>
                      {resource.plateNumber ? (
                        <span className={styles.resourcePlate}>{resource.plateNumber}</span>
                      ) : null}
                    </div>

                    <div
                      className={styles.rowTrack}
                      style={{
                        height: ROW_HEIGHT_PX,
                        width: days.length * DAY_WIDTH_PX,
                      }}
                    >
                      {laned.map(({ event, lane }) => (
                        <EventBar key={event.id} event={event} lane={lane} range={range} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EventBar({
  event,
  lane,
  range,
}: {
  event: CalendarEvent;
  lane: number;
  range: ReturnType<typeof useCalendarData>['range'];
}) {
  const position = computeEventPosition(event, range);
  if (!position) return null;

  const palette = eventPalette(event);

  return (
    <div
      className={[
        styles.eventBar,
        position.clippedStart ? styles.clippedStart : '',
        position.clippedEnd ? styles.clippedEnd : '',
      ]
        .filter(Boolean)
        .join(' ')}
      // Giá trị tính lúc runtime nên buộc phải qua inline custom property — ngoại lệ
      // hợp lệ của quy tắc "không inline style" (ADR 0003).
      style={
        {
          '--xp-bar-left': `${position.offsetDays * DAY_WIDTH_PX}px`,
          '--xp-bar-width': `${Math.max(position.spanDays * DAY_WIDTH_PX - 2, 6)}px`,
          top: 4 + lane * 24,
          background: palette.bg,
          color: palette.fg,
          borderColor: palette.border,
        } as React.CSSProperties
      }
      title={`${event.title} · ${event.startAt} → ${event.endAt}`}
      role="button"
      tabIndex={0}
    >
      {event.title}
    </div>
  );
}

/**
 * Màu lấy từ `BOOKING_STATUS_META` của @xeprime/types, không tự chế bảng màu ở đây —
 * CLAUDE.md mục 5 cấm hard code status/màu nghiệp vụ trong component.
 */
function eventPalette(event: CalendarEvent): { bg: string; fg: string; border: string } {
  if (event.type === OCCUPANCY_SOURCE_TYPE.MAINTENANCE) {
    return { bg: 'var(--xp-color-purple-bg)', fg: 'var(--xp-color-purple)', border: 'var(--xp-color-purple-border)' };
  }
  if (event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE) {
    return { bg: 'var(--xp-color-fill-secondary)', fg: 'var(--xp-color-text-secondary)', border: 'var(--xp-color-border)' };
  }

  const meta = event.status ? BOOKING_STATUS_META[event.status as BookingStatus] : undefined;
  const token = meta?.color ?? 'default';

  return {
    bg: `var(--xp-color-${token}-bg)`,
    fg: `var(--xp-color-${token})`,
    border: `var(--xp-color-${token}-border)`,
  };
}
