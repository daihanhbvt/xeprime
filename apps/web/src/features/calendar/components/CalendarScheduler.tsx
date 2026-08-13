'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { Alert, App, Empty, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  API_ERROR_CODE,
  BOOKING_STATUS_META,
  OCCUPANCY_SOURCE_TYPE,
  PERMISSION,
  occupiesSchedule,
  type BookingStatus,
} from '@xeprime/types';
import {
  BookingFormDrawer,
  type BookingPrefill,
} from '@/features/bookings/components/BookingFormDrawer';
import { useRescheduleBooking } from '@/features/bookings/hooks/use-booking-mutations';
import { bookingPath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { APP_TIME_ZONE, dayjs } from '@/lib/datetime';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import type { BookingDetail } from '@/features/bookings/types';
import { useCalendarData } from '../hooks/use-calendar-data';
import { listDays } from '../utils/calendar-date.util';
import { assignLanes, computeEventPosition } from '../utils/calendar-position.util';
import type { CalendarEvent } from '../types/calendar.types';
import { CalendarToolbar } from './CalendarToolbar';
import styles from './CalendarScheduler.module.css';

/** Giờ nhận xe mặc định khi tạo đơn từ ô lịch (giờ Việt Nam). */
const DEFAULT_PICKUP_HOUR = 8;
/** Dịch chuột nhỏ hơn ngưỡng này coi là "click" (mở chi tiết), không phải kéo đổi lịch. */
const DRAG_THRESHOLD_PX = 4;
type DragMode = 'move' | 'resize';

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
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { range, resources, eventsByResource, isLoading, error } = useCalendarData();
  const { has } = usePermissions();
  const { message } = App.useApp();
  const reschedule = useRescheduleBooking();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BookingDetail | null>(null);
  const [prefill, setPrefill] = useState<BookingPrefill | null>(null);

  const canCreate = has(PERMISSION.BOOKING_CREATE);
  const canReschedule = has(PERMISSION.BOOKING_UPDATE);

  const rowVirtualizer = useVirtualizer({
    count: resources.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    // 1.000 xe × 30 ngày là kịch bản thật (fe_base_stack §9). Không virtualize thì
    // trình duyệt phải giữ hàng chục nghìn node và cuộn sẽ giật.
    overscan: 8,
  });

  const days = listDays(range);

  /** Click ô trống trên hàng một xe → tạo đơn, prefill xe + ngày (suy từ vị trí click). */
  function handleCellClick(e: React.MouseEvent<HTMLDivElement>, vehicleId: string) {
    if (!canCreate) return;
    // Chỉ xử lý khi bấm THẲNG vào nền ô trống. Bấm/kéo trúng thanh event sẽ nổi bọt lên đây
    // (stopPropagation ở pointerdown không chặn được `click` tổng hợp) — bỏ qua để không đè
    // modal tạo đơn lên thao tác xem chi tiết / kéo thả.
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dayIndex = Math.max(
      0,
      Math.min(days.length - 1, Math.floor((e.clientX - rect.left) / DAY_WIDTH_PX)),
    );
    const pickupAt = dayjs(range.startAt)
      .tz(APP_TIME_ZONE)
      .add(dayIndex, 'day')
      .hour(DEFAULT_PICKUP_HOUR)
      .minute(0)
      .second(0)
      .millisecond(0);
    setEditing(null);
    setPrefill({ vehicleId, pickupAt, returnAt: pickupAt.add(1, 'day') });
    setFormOpen(true);
  }

  /**
   * Click thanh event: chỉ đơn thuê mới mở chi tiết (bảo dưỡng/khoá xe bỏ qua).
   *
   * Wave 10: đi tới TRANG chi tiết đơn thay vì mở drawer riêng — trước đây lịch và danh sách
   * đơn mỗi bên dựng một bản chi tiết, hai bề mặt cùng một thứ và chỉ một bên được cập nhật
   * khi luồng vận hành đổi.
   */
  function handleEventSelect(event: CalendarEvent) {
    if (event.type === OCCUPANCY_SOURCE_TYPE.BOOKING && event.sourceId) {
      router.push(bookingPath.detail(event.sourceId));
    }
  }

  /** Kéo/resize xong → đổi khung giờ. `deltaDays` là số ngày dịch (đã snap). */
  function handleReschedule(event: CalendarEvent, deltaDays: number, mode: DragMode) {
    if (!event.sourceId) return;
    const pickup = dayjs(event.startAt);
    const ret = dayjs(event.endAt);
    const newPickup = mode === 'move' ? pickup.add(deltaDays, 'day') : pickup;
    let newReturn = ret.add(deltaDays, 'day');
    if (mode === 'resize' && !newReturn.isAfter(newPickup)) newReturn = newPickup.add(1, 'day');

    reschedule.mutate(
      { id: event.sourceId, pickupAt: newPickup.toISOString(), returnAt: newReturn.toISOString() },
      {
        onSuccess: () => message.success('Đã đổi lịch'),
        onError: (err) =>
          message.error(
            getErrorCode(err) === API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT
              ? 'Xe đã bận khung giờ mới'
              : getErrorMessage(err),
          ),
      },
    );
  }

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
                      className={[styles.rowTrack, canCreate ? styles.rowTrackClickable : '']
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        height: ROW_HEIGHT_PX,
                        width: days.length * DAY_WIDTH_PX,
                      }}
                      onClick={(e) => handleCellClick(e, resource.vehicleId)}
                    >
                      {laned.map(({ event, lane }) => (
                        <EventBar
                          key={event.id}
                          event={event}
                          lane={lane}
                          range={range}
                          canReschedule={canReschedule}
                          onSelect={handleEventSelect}
                          onReschedule={handleReschedule}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <BookingFormDrawer
        open={formOpen}
        editing={editing}
        prefill={prefill}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}

function EventBar({
  event,
  lane,
  range,
  canReschedule,
  onSelect,
  onReschedule,
}: {
  event: CalendarEvent;
  lane: number;
  range: ReturnType<typeof useCalendarData>['range'];
  canReschedule: boolean;
  onSelect: (event: CalendarEvent) => void;
  onReschedule: (event: CalendarEvent, deltaDays: number, mode: DragMode) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ mode: DragMode; startX: number } | null>(null);
  const [dx, setDx] = useState(0);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);

  const position = computeEventPosition(event, range);
  if (!position) return null;

  const palette = eventPalette(event);
  const isBooking = event.type === OCCUPANCY_SOURCE_TYPE.BOOKING && Boolean(event.sourceId);
  const draggable = canReschedule && isBooking && occupiesSchedule(event.status as BookingStatus);

  function beginDrag(e: React.PointerEvent, mode: DragMode) {
    if (!draggable) return;
    e.stopPropagation();
    barRef.current?.setPointerCapture(e.pointerId);
    dragStart.current = { mode, startX: e.clientX };
    setDragMode(mode);
    setDx(0);
  }

  function moveDrag(e: React.PointerEvent) {
    if (!dragStart.current) return;
    setDx(e.clientX - dragStart.current.startX);
  }

  function endDrag(e: React.PointerEvent) {
    const start = dragStart.current;
    dragStart.current = null;
    setDragMode(null);
    setDx(0);
    if (!start) return;
    const delta = e.clientX - start.startX;
    // Dịch nhỏ = click → mở chi tiết. Dịch đủ lớn = kéo đổi lịch (snap theo ngày).
    if (Math.abs(delta) < DRAG_THRESHOLD_PX) {
      if (isBooking) onSelect(event);
      return;
    }
    const deltaDays = Math.round(delta / DAY_WIDTH_PX);
    if (deltaDays !== 0) onReschedule(event, deltaDays, start.mode);
  }

  // Không kéo được (thiếu quyền / không phải đơn đang giữ lịch) → chỉ click mở chi tiết.
  function clickSelect(e: React.SyntheticEvent) {
    e.stopPropagation();
    if (isBooking) onSelect(event);
  }

  const moveDx = dragMode === 'move' ? dx : 0;
  const resizeDx = dragMode === 'resize' ? dx : 0;

  return (
    <div
      ref={barRef}
      className={[
        styles.eventBar,
        draggable ? styles.eventDraggable : '',
        dragMode ? styles.eventDragging : '',
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
          '--xp-bar-width': `${Math.max(position.spanDays * DAY_WIDTH_PX - 2 + resizeDx, 6)}px`,
          top: 4 + lane * 24,
          background: palette.bg,
          color: palette.fg,
          borderColor: palette.border,
          transform: moveDx ? `translateX(${moveDx}px)` : undefined,
        } as React.CSSProperties
      }
      title={`${event.title} · ${event.startAt} → ${event.endAt}`}
      role="button"
      tabIndex={0}
      onPointerDown={draggable ? (e) => beginDrag(e, 'move') : undefined}
      onPointerMove={draggable ? moveDrag : undefined}
      onPointerUp={draggable ? endDrag : undefined}
      onClick={draggable ? undefined : isBooking ? clickSelect : undefined}
      onKeyDown={
        isBooking
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') clickSelect(e);
            }
          : undefined
      }
    >
      <span className={styles.eventLabel}>{event.title}</span>
      {draggable ? (
        <span
          className={styles.resizeHandle}
          onPointerDown={(e) => beginDrag(e, 'resize')}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

/**
 * Màu lấy từ `BOOKING_STATUS_META` của @xeprime/types, không tự chế bảng màu ở đây —
 * CLAUDE.md mục 5 cấm hard code status/màu nghiệp vụ trong component.
 */
function eventPalette(event: CalendarEvent): { bg: string; fg: string; border: string } {
  if (event.type === OCCUPANCY_SOURCE_TYPE.MAINTENANCE) {
    return {
      bg: 'var(--xp-color-purple-bg)',
      fg: 'var(--xp-color-purple)',
      border: 'var(--xp-color-purple-border)',
    };
  }
  if (event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE) {
    return {
      bg: 'var(--xp-color-fill-secondary)',
      fg: 'var(--xp-color-text-secondary)',
      border: 'var(--xp-color-border)',
    };
  }

  const meta = event.status ? BOOKING_STATUS_META[event.status as BookingStatus] : undefined;
  const token = meta?.color ?? 'default';

  return {
    bg: `var(--xp-color-${token}-bg)`,
    fg: `var(--xp-color-${token})`,
    border: `var(--xp-color-${token}-border)`,
  };
}
