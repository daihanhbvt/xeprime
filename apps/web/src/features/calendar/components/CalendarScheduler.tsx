'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { Alert, App, Button, Popover, Skeleton, Switch, Tag } from 'antd';
import {
  CalendarOutlined,
  CarOutlined,
  CloseOutlined,
  DollarOutlined,
  FlagFilled,
  LeftOutlined,
  LockOutlined,
  RightOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useLayoutEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BOOKING_STATUS_META,
  HOLIDAY_EVENT_TYPE_META,
  OCCUPANCY_SOURCE_TYPE,
  OCCUPANCY_SOURCE_TYPE_META,
  PERMISSION,
  VEHICLE_BLOCK_REASON,
  VEHICLE_BLOCK_REASON_META,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_OPERATION_STATUS_META,
  type BookingStatus,
  type HolidayEventType,
  type OccupancySourceType,
  type VehicleBlockReason,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { StaffBookingDialog } from '@/features/booking-requests/components/StaffBookingDialog';
import { useIsMobile } from '@/hooks/use-media-query';
import { usePermissions } from '@/hooks/use-permissions';
import { APP_TIME_ZONE, dayjs, type Dayjs } from '@/lib/datetime';
import { getErrorMessage } from '@/services/api-client';
import { priceMarkerKey, useCalendarData } from '../hooks/use-calendar-data';
import { holidayRunAround } from '@xeprime/domain';
import { useCalendarHolidays } from '../hooks/use-calendar-holidays';
import { useBulkBlockDay, useBulkDayPreview, useReleaseBulkBlock } from '../hooks/use-bulk-day';
import { formatDateKey, formatDateTime, listDays } from '../utils/calendar-date.util';
import { assignPixelLanes, computeEventPosition } from '../utils/calendar-position.util';
import type {
  CalendarEvent,
  CalendarRange,
  CalendarResource,
  Holiday,
  VehicleBlock,
} from '../types/calendar.types';
import { BookingDetailDialog } from '@/features/bookings/components/BookingDetailDialog';
import {
  CalendarCellActions,
  type CellActionKey,
  type CellActionTarget,
} from './CalendarCellActions';
import { BulkDayBlockDialog, type BulkDayBlockState } from './BulkDayBlockDialog';
import { BulkDayPriceDialog, type BulkDayPriceState } from './BulkDayPriceDialog';
import { CalendarToolbar } from './CalendarToolbar';
import { DailyPriceDialog, type DailyPriceDialogState } from './DailyPriceDialog';
import { MaintenanceEventDialog } from './MaintenanceEventDialog';
import { VehicleBlockDetailDialog } from './VehicleBlockDetailDialog';
import { VehicleBlockDialog, type VehicleBlockDialogState } from './VehicleBlockDialog';
import styles from './CalendarScheduler.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

/** Giờ nhận xe mặc định khi tạo đơn từ ô lịch (giờ Việt Nam). */
const DEFAULT_PICKUP_HOUR = 8;

/** Kích thước lưới — JS cần biết để virtualize + định vị; CSS đọc lại qua custom property. */
const HEADER_H = 56;
const ROW_H_DESKTOP = 64;
const ROW_H_MOBILE = 52;
const RESOURCE_W_DESKTOP = 236;
const RESOURCE_W_MOBILE = 104;
/** Cột xe THU GỌN: chỉ còn ảnh — nhường tối đa bề ngang cho lưới ngày. */
const RESOURCE_W_COLLAPSED = 56;
const MIN_DAY_W_DESKTOP = 64;
/** Sàn thấp hơn desktop để 7 ngày (cột xe thu gọn) vừa khít 390px: (390−56)/7 ≈ 47. */
const MIN_DAY_W_MOBILE = 46;
/** Bề ngang panel chọn hành động — dùng để kẹp neo không tràn mép phải. */
const CELL_MENU_W = 250;

/** Hai thao tác cả-đội-xe mở từ thẻ ngày. Mã, không phải chữ. */
type DayActionKey = 'block' | 'price';

/** Overlay đang mở — đúng MỘT overlay một lúc, tất cả đi qua state này. */
type DialogState =
  | {
      kind: 'booking-create';
      vehicleId: string;
      vehicleName: string;
      vehicleImageUrl: string | null;
      pickupAt: string;
      returnAt: string;
    }
  | { kind: 'booking-detail'; bookingId: string }
  | { kind: 'block'; state: NonNullable<VehicleBlockDialogState> }
  | { kind: 'block-detail'; blockId: string }
  | { kind: 'price'; state: DailyPriceDialogState }
  | { kind: 'maintenance'; vehicleId: string; vehicleName: string; recordId: string }
  | null;

/**
 * Lịch thuê xe — workspace điều phối đội xe (bản thiết kế lại, Wave lịch).
 *
 * Cấu trúc: MỘT vùng cuộn sở hữu cả hai chiều (`overscroll-behavior: contain`, KHÔNG để body
 * cuộn thay); cột xe sticky trái, header ngày sticky trên, hàng "Xe còn trống" sticky đáy.
 * Hàng xe virtualize bằng spacer đúng tổng chiều cao + translateY theo offset ảo — hàng không
 * biến mất/đè nhau khi cuộn (lỗi của bản `display: contents` cũ).
 *
 * Ô trống mở BỘ CHỌN hành động (Đặt xe / Khóa xe / Đặt giá theo quyền) — không thao tác nào
 * chạy thẳng từ một cú bấm ô. Event mở modal chi tiết đúng loại; không điều hướng rời trang.
 * Kéo-thả đổi lịch đã bỏ CÓ CHỦ ĐÍCH: đổi giờ đi qua form sửa đơn/khoá/bảo dưỡng (có xác nhận
 * + backend quyết — ADR 0006), và cuộn ngang trên cảm ứng không bao giờ thành một cú kéo nhầm.
 */
export function CalendarScheduler() {
  const isMobile = useIsMobile();
  /**
   * Vùng cuộn giữ bằng STATE, không phải ref: nó chỉ mount SAU khi hết loading, nên một
   * `useLayoutEffect([])` với ref sẽ chạy lúc phần tử chưa tồn tại và không bao giờ đo được —
   * chính là bug "cột ngày không nở ra toàn màn hình". Callback ref + effect theo phần tử
   * bảo đảm ResizeObserver gắn đúng lúc phần tử xuất hiện.
   */
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null);
  const {
    range,
    filters,
    resources,
    eventsByResource,
    priceMarkers,
    availableByDay,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useCalendarData();
  const { has } = usePermissions();
  const t = useTranslations('Calendar');

  const canView = has(PERMISSION.CALENDAR_VIEW);
  const canCreate = has(PERMISSION.BOOKING_CREATE);
  const canBlock = has(PERMISSION.VEHICLE_BLOCK_SCHEDULE);
  const canPrice = has(PERMISSION.VEHICLE_UPDATE);
  const cellActions = useMemo<CellActionKey[]>(
    () => [
      ...(canCreate ? (['booking'] as const) : []),
      ...(canBlock ? (['block'] as const) : []),
      ...(canPrice ? (['price'] as const) : []),
    ],
    [canBlock, canCreate, canPrice],
  );
  const cellsInteractive = cellActions.length > 0;

  const [dialog, setDialog] = useState<DialogState>(null);
  const [cellTarget, setCellTarget] = useState<CellActionTarget | null>(null);
  /** Thu gọn cột xe (chỉ còn ảnh) — nhường bề ngang cho lưới; chi tiết xe vẫn xem qua popover. */
  const [resourceCollapsed, setResourceCollapsed] = useState(false);

  const rowHeight = isMobile ? ROW_H_MOBILE : ROW_H_DESKTOP;
  const resourceW = resourceCollapsed
    ? RESOURCE_W_COLLAPSED
    : isMobile
      ? RESOURCE_W_MOBILE
      : RESOURCE_W_DESKTOP;
  const minDayW = isMobile ? MIN_DAY_W_MOBILE : MIN_DAY_W_DESKTOP;

  // Cột ngày co giãn lấp đầy bề ngang ở MỌI khoảng xem (7 ngày → ô rất rộng, 30 ngày → chạm
  // sàn rồi cuộn ngang TRONG lưới, body không tràn). Đo bằng ResizeObserver theo phần tử.
  const [viewportW, setViewportW] = useState(0);
  useLayoutEffect(() => {
    if (!viewportEl) return;
    // Đo NGAY khi phần tử xuất hiện — không đợi lần resize đầu tiên.
    setViewportW(viewportEl.clientWidth);
    const observer = new ResizeObserver((entries) => {
      setViewportW(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(viewportEl);
    return () => observer.disconnect();
  }, [viewportEl]);
  const dayWidth = Math.max(
    minDayW,
    viewportW > 0 ? Math.floor((viewportW - resourceW) / range.dayCount) : minDayW,
  );

  const days = useMemo(() => listDays(range), [range]);
  const canvasWidth = resourceW + days.length * dayWidth;

  /*
   * Lớp ngày lễ — nạp RIÊNG, cố ý không đi qua `useCalendarData`. Nó chỉ tô màu và mở một thẻ
   * thông tin: hỏng thì bản đồ rỗng và lưới chạy y như cũ, không Alert, không skeleton.
   */
  const holidaysByDay = useCalendarHolidays(range);

  /**
   * Bảng hành động của một ngày (mở từ header) — và hai dialog nó dẫn tới.
   *
   * Giữ ở đây chứ không trong `DayHeaderCell` vì mỗi lúc chỉ MỘT ngày được mở, và vì hai dialog
   * phải sống ngoài cột: cột nằm trong vùng cuộn ngang, còn dialog thì không.
   */
  const [dayPanel, setDayPanel] = useState<{ day: DayCell; holiday: Holiday | undefined } | null>(
    null,
  );
  const [bulkBlock, setBulkBlock] = useState<BulkDayBlockState | null>(null);
  const [bulkPrice, setBulkPrice] = useState<BulkDayPriceState | null>(null);

  /** Thao tác cả-đội-xe dùng ĐÚNG quyền của thao tác lẻ tương ứng — làm hàng loạt không mở thêm quyền. */
  const dayActions = useMemo<DayActionKey[]>(
    () => [...(canBlock ? (['block'] as const) : []), ...(canPrice ? (['price'] as const) : [])],
    [canBlock, canPrice],
  );

  /*
   * Trạng thái công tắc "đã khoá cả ngày chưa" — chỉ hỏi khi bảng đang mở, vì nó là một câu
   * query thật và 30 cột ngày không được phép sinh ra 30 request lúc lưới vừa render.
   */
  const panelDate = dayPanel?.day.key ?? '';
  const panelPreview = useBulkDayPreview(panelDate, panelDate, dayPanel !== null);
  const releaseBatch = useReleaseBulkBlock();
  const quickBlock = useBulkBlockDay();
  const { message } = App.useApp();

  /**
   * Khoá NGAY mọi xe rảnh trong đúng ngày này — thao tác một-chạm của công tắc.
   *
   * Chỉ gửi những xe đang rảnh: xe có đơn thì `EXCLUDE USING gist` từ chối (ADR 0006), và một
   * lệnh gồm cả chúng sẽ hỏng trọn lô. Thông báo nói ra con số THẬT (`đã khoá 32 xe`) chứ không
   * phải "đã khoá toàn bộ" — người trực cần biết còn 8 chiếc vẫn nhận đơn được.
   */
  function runQuickBlock(dateKey: string) {
    const free = (panelPreview.data?.vehicles ?? []).filter((v) => v.busyDates.length === 0);
    if (free.length === 0) {
      message.warning(t('dayPanel.quickBlockNothing'));
      return;
    }
    quickBlock.mutate(
      {
        from: dateKey,
        to: dateKey,
        reason: VEHICLE_BLOCK_REASON.NOT_FOR_RENT,
        vehicleIds: free.map((v) => v.vehicleId),
      },
      {
        onSuccess: (result) => {
          const skipped = (panelPreview.data?.vehicles.length ?? 0) - result.fullyBlockedVehicles;
          message.success(
            skipped > 0
              ? t('dayPanel.quickBlockedPartial', {
                  count: result.fullyBlockedVehicles,
                  skipped,
                })
              : t('dayPanel.quickBlocked', { count: result.fullyBlockedVehicles }),
          );
        },
        onError: (error) => message.error(getErrorMessage(error)),
      },
    );
  }

  /** Cụm ngày lễ liền kề chứa ngày đang mở — khoảng gợi ý cho chế độ nhiều ngày. */
  const suggestedRange = useMemo(
    () => (panelDate ? holidayRunAround(holidaysByDay, panelDate) : { from: '', to: '' }),
    [holidaysByDay, panelDate],
  );

  const rowVirtualizer = useVirtualizer({
    count: resources.length,
    getScrollElement: () => viewportEl,
    estimateSize: () => rowHeight,
    // Header ngày chiếm 56px đầu vùng cuộn — khai báo để dải hàng hiển thị tính đúng offset.
    scrollMargin: HEADER_H,
    // 1.000 xe × 30 ngày là kịch bản thật (fe_base_stack §9). Không virtualize thì trình duyệt
    // giữ hàng chục nghìn node và cuộn giật.
    overscan: 8,
  });

  const hasAnyEvent = useMemo(
    () => [...eventsByResource.values()].some((list) => list.length > 0),
    [eventsByResource],
  );
  const filtered = Boolean(filters.q || filters.vehicleType);

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('states.forbiddenTitle')}
        description={t('states.forbiddenDescription')}
        missingPermissions={[PERMISSION.CALENDAR_VIEW]}
      />
    );
  }

  /** Bấm/kích hoạt ô trống → mở bộ chọn hành động neo cạnh ô. */
  function openCellMenu(resource: CalendarResource, dayIndex: number, rowStart: number) {
    if (!cellsInteractive) return;
    const date = days[dayIndex]?.key;
    if (!date) return;
    setCellTarget({
      vehicleId: resource.vehicleId,
      vehicleName: resource.plateNumber
        ? `${resource.name} · ${resource.plateNumber}`
        : resource.name,
      date,
      anchor: {
        left: Math.max(
          resourceW,
          Math.min(resourceW + dayIndex * dayWidth, canvasWidth - CELL_MENU_W),
        ),
        top: rowStart + rowHeight + 2,
      },
    });
  }

  function runCellAction(action: CellActionKey) {
    const target = cellTarget;
    setCellTarget(null);
    if (!target) return;
    const resource = resources.find((r) => r.vehicleId === target.vehicleId);
    if (action === 'booking') {
      // `.toISOString()` ở đây ĐÚNG và cố ý: `dayjs.tz(dateKey, APP_TIME_ZONE)` đã dựng một
      // mốc TUYỆT ĐỐI từ ngày lịch của ô vừa bấm, không phải một mặt đồng hồ người dùng chọn —
      // nên nó không đi qua `appWallClockToIso`.
      const pickupAt = dayjs
        .tz(target.date, APP_TIME_ZONE)
        .hour(DEFAULT_PICKUP_HOUR)
        .minute(0)
        .second(0)
        .millisecond(0);
      setDialog({
        kind: 'booking-create',
        vehicleId: target.vehicleId,
        vehicleName: target.vehicleName,
        vehicleImageUrl: resource?.mainImageUrl ?? null,
        pickupAt: pickupAt.toISOString(),
        returnAt: pickupAt.add(1, 'day').toISOString(),
      });
    } else if (action === 'block') {
      setDialog({
        kind: 'block',
        state: {
          mode: 'create',
          vehicleId: target.vehicleId,
          vehicleName: target.vehicleName,
          date: target.date,
        },
      });
    } else {
      setDialog({
        kind: 'price',
        state: {
          vehicleId: target.vehicleId,
          vehicleName: target.vehicleName,
          weekdayPrice: resource?.weekdayPrice ?? null,
          hourlyPrice: resource?.hourlyPrice ?? null,
          date: target.date,
        },
      });
    }
  }

  /** Bấm event → modal chi tiết đúng loại. KHÔNG điều hướng rời lịch. */
  function openEvent(event: CalendarEvent, resource: CalendarResource) {
    if (!event.sourceId) return;
    if (event.type === OCCUPANCY_SOURCE_TYPE.BOOKING) {
      setDialog({ kind: 'booking-detail', bookingId: event.sourceId });
    } else if (event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE) {
      setDialog({ kind: 'block-detail', blockId: event.sourceId });
    } else if (event.type === OCCUPANCY_SOURCE_TYPE.MAINTENANCE) {
      setDialog({
        kind: 'maintenance',
        vehicleId: resource.vehicleId,
        vehicleName: resource.plateNumber
          ? `${resource.name} · ${resource.plateNumber}`
          : resource.name,
        recordId: event.sourceId,
      });
    }
  }

  return (
    <div className={styles.wrapper}>
      <CalendarToolbar />
      <CalendarLegend />

      {error ? (
        <Alert
          type="error"
          showIcon
          className={styles.inlineAlert}
          message={t('states.loadFailed')}
          description={getErrorMessage(error)}
          action={
            <Button size="small" onClick={refetch}>
              {t('states.retry')}
            </Button>
          }
        />
      ) : null}

      {!isLoading && !error && resources.length > 0 && !hasAnyEvent ? (
        // Khoảng đang xem chưa có lịch nào: nói nhỏ một dòng, lưới VẪN hiện và bấm được —
        // không dựng thẻ rỗng chặn lên vùng thao tác.
        <div className={styles.emptyHint} role="status">
          {t(cellsInteractive ? 'states.noEventsInRangeActionable' : 'states.noEventsInRange')}
        </div>
      ) : null}

      {isLoading ? (
        <div
          className={styles.loadingBlock}
          aria-busy="true"
          aria-label={t('grid.loadingAriaLabel')}
        >
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      ) : resources.length === 0 && !error ? (
        <EmptyState
          variant={filtered ? 'no-results' : 'empty'}
          title={t(filtered ? 'states.noMatchTitle' : 'states.noVehiclesTitle')}
          description={t(filtered ? 'states.noMatchDescription' : 'states.noVehiclesDescription')}
        />
      ) : resources.length > 0 ? (
        <div
          ref={setViewportEl}
          className={[styles.viewport, isFetching ? styles.refetching : '']
            .filter(Boolean)
            .join(' ')}
          role="region"
          aria-label={t('grid.ariaLabel')}
          aria-busy={isFetching || undefined}
          tabIndex={0}
          style={
            {
              '--xp-day-width': `${dayWidth}px`,
              '--xp-resource-col-width': `${resourceW}px`,
              '--xp-calendar-row-height': `${rowHeight}px`,
              '--xp-calendar-header-h': `${HEADER_H}px`,
            } as React.CSSProperties
          }
        >
          <div
            className={styles.canvas}
            style={{ '--xp-canvas-width': `${canvasWidth}px` } as React.CSSProperties}
          >
            {/* ── Header ngày (sticky trên) ─────────────────────────────── */}
            <div className={styles.headerRow}>
              <div className={styles.cornerCell}>
                {resourceCollapsed ? null : (
                  <span className={styles.cornerLabel}>
                    {t('grid.resourceHeader', { count: resources.length })}
                  </span>
                )}
                <button
                  type="button"
                  className={styles.collapseToggle}
                  aria-label={t(resourceCollapsed ? 'grid.expandColumn' : 'grid.collapseColumn')}
                  aria-expanded={!resourceCollapsed}
                  title={t(resourceCollapsed ? 'grid.expandColumn' : 'grid.collapseColumn')}
                  onClick={() => setResourceCollapsed((v) => !v)}
                >
                  {resourceCollapsed ? <RightOutlined /> : <LeftOutlined />}
                </button>
              </div>
              <div className={styles.dayHeaderTrack}>
                {days.map((day) => {
                  const holiday = holidaysByDay.get(day.key);
                  const isOpen = dayPanel?.day.key === day.key;
                  return (
                    <DayHeaderCell
                      key={day.key}
                      day={day}
                      holiday={holiday}
                      actions={dayActions}
                      panel={
                        isOpen ? (
                          <DayActionPanel
                            day={day}
                            holiday={holiday}
                            actions={dayActions}
                            blockState={{
                              batchId: panelPreview.data?.activeBlockBatchId ?? null,
                              loading: panelPreview.isLoading,
                              busy: quickBlock.isPending || releaseBatch.isPending,
                            }}
                            onClose={() => setDayPanel(null)}
                            onQuickBlock={runQuickBlock}
                            onRelease={(batchId) =>
                              releaseBatch.mutate(batchId, {
                                onSuccess: () => message.success(t('bulkBlock.released')),
                              })
                            }
                            onOpenBlockDialog={() => {
                              setBulkBlock({ date: day.key, suggestedRange });
                              setDayPanel(null);
                            }}
                            onPrice={() => {
                              setBulkPrice({ date: day.key, suggestedRange });
                              setDayPanel(null);
                            }}
                          />
                        ) : null
                      }
                      onToggle={(d, h) =>
                        setDayPanel((current) =>
                          current?.day.key === d.key ? null : { day: d, holiday: h },
                        )
                      }
                    />
                  );
                })}
              </div>
            </div>

            {/* ── Thân lưới ảo hoá ──────────────────────────────────────── */}
            <div className={styles.bodySpacer} style={{ height: rowVirtualizer.getTotalSize() }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const resource = resources[virtualRow.index];
                if (!resource) return null;
                const events = eventsByResource.get(resource.id) ?? [];
                const zebra = virtualRow.index % 2 === 1;

                return (
                  <div
                    key={resource.id}
                    className={[styles.row, zebra ? styles.rowZebra : ''].filter(Boolean).join(' ')}
                    style={{
                      height: rowHeight,
                      transform: `translateY(${virtualRow.start - HEADER_H}px)`,
                    }}
                  >
                    <ResourceCell resource={resource} collapsed={resourceCollapsed} />
                    <EventTrack
                      resource={resource}
                      events={events}
                      days={days}
                      range={range}
                      dayWidth={dayWidth}
                      priceMarkers={priceMarkers}
                      holidaysByDay={holidaysByDay}
                      cellsInteractive={cellsInteractive}
                      onCellClick={(dayIndex) => openCellMenu(resource, dayIndex, virtualRow.start)}
                      onOpenEvent={(event) => openEvent(event, resource)}
                    />
                  </div>
                );
              })}
            </div>

            {/* ── Hàng "Xe còn trống" (sticky đáy) — số đếm từ BACKEND ───── */}
            <div className={styles.summaryRow}>
              <div className={styles.summaryLabel}>
                {t(resourceCollapsed ? 'grid.availableRowShort' : 'grid.availableRow')}
              </div>
              <div className={styles.summaryTrack}>
                {days.map((day) => {
                  const count = availableByDay.get(day.key);
                  return (
                    <div
                      key={day.key}
                      className={[
                        styles.summaryCell,
                        holidaysByDay.has(day.key) ? styles.holidayColumn : '',
                        day.isToday ? styles.today : '',
                        count === 0 ? styles.summaryNone : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-label={
                        count === undefined
                          ? t('grid.availableCellPending', { day: day.dayOfMonth })
                          : t('grid.availableCell', { day: day.dayOfMonth, count })
                      }
                    >
                      {count ?? '—'}
                    </div>
                  );
                })}
              </div>
            </div>

            <CalendarCellActions
              target={cellTarget}
              actions={cellActions}
              onSelect={runCellAction}
              onClose={() => setCellTarget(null)}
            />
          </div>
        </div>
      ) : null}

      {/* ── Overlay ──────────────────────────────────────────────────── */}
      {/* "Đặt xe" dùng NGUYÊN luồng thuê xe của khách (bỏ OTP) — không dựng form thứ hai. */}
      {dialog?.kind === 'booking-create' ? (
        <StaffBookingDialog
          open
          vehicleId={dialog.vehicleId}
          vehicleName={dialog.vehicleName}
          vehicleImageUrl={dialog.vehicleImageUrl}
          pickupAt={dialog.pickupAt}
          returnAt={dialog.returnAt}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'booking-detail' ? (
        <BookingDetailDialog bookingId={dialog.bookingId} open onClose={() => setDialog(null)} />
      ) : null}
      <VehicleBlockDialog
        state={dialog?.kind === 'block' ? dialog.state : null}
        onClose={() => setDialog(null)}
      />
      {dialog?.kind === 'block-detail' ? (
        <VehicleBlockDetailDialog
          blockId={dialog.blockId}
          open
          onClose={() => setDialog(null)}
          onEdit={(block: VehicleBlock) =>
            setDialog({ kind: 'block', state: { mode: 'edit', block } })
          }
        />
      ) : null}
      <BulkDayBlockDialog state={bulkBlock} onClose={() => setBulkBlock(null)} />
      <BulkDayPriceDialog state={bulkPrice} onClose={() => setBulkPrice(null)} />

      <DailyPriceDialog
        state={dialog?.kind === 'price' ? dialog.state : null}
        onClose={() => setDialog(null)}
      />
      {dialog?.kind === 'maintenance' ? (
        <MaintenanceEventDialog
          vehicleId={dialog.vehicleId}
          vehicleName={dialog.vehicleName}
          recordId={dialog.recordId}
          open
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Một cột ngày ở header — và là ĐƯỜNG VÀO các thao tác cả-đội-xe cho ngày đó.
 *
 * Mở bằng CLICK, không phải hover. Đây là thay đổi có chủ đích: thẻ này chứa hành động thật
 * (khoá xe, đặt giá) chứ không còn chỉ hiện thông tin, và một bảng điều khiển tự bung ra khi
 * con trỏ lướt qua rồi biến mất khi nhích chuột là thứ không thao tác được — chưa kể trên cảm
 * ứng thì không có "hover" nào cả.
 *
 * Ngày lễ được đánh dấu bằng HAI thứ, không chỉ màu nền: một cờ nhỏ nhìn thấy được và một
 * `aria-label` nói thẳng "Ngày lễ" — nền cột cố ý rất nhạt, nên màu một mình không đủ.
 *
 * Mọi ngày đều bấm được, không riêng ngày lễ: khoá xe và đặt giá là việc của mọi ngày trong
 * năm. Ngày lễ chỉ là ngày mà người ta NHỚ ra mình cần làm việc đó.
 */
function DayHeaderCell({
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
  onToggle: (day: DayCell, holiday: Holiday | undefined) => void;
}) {
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();

  const className = [
    styles.dayHeaderCell,
    day.isWeekend ? styles.weekend : '',
    holiday ? styles.holiday : '',
    day.isToday ? styles.today : '',
  ]
    .filter(Boolean)
    .join(' ');

  const label = (
    <>
      <span className={styles.weekdayLabel}>{fmt.weekdayShort(day.at)}</span>
      <span className={styles.dayNumber}>{day.dayOfMonth}</span>
      {holiday ? <FlagFilled className={styles.holidayFlag} aria-hidden /> : null}
    </>
  );

  // Không quyền nào và không phải ngày lễ ⇒ không có gì để mở, đừng mời người dùng bấm.
  if (actions.length === 0 && !holiday) return <div className={className}>{label}</div>;

  const ariaLabel = holiday
    ? t('dayPanel.triggerHoliday', { name: holiday.name, date: formatDateKey(day.key) })
    : t('dayPanel.trigger', { date: formatDateKey(day.key) });

  /*
   * Popover neo vào CHÍNH nút của cột này.
   *
   * Bản trước neo vào một điểm rỗng đặt ở giữa canvas, và hậu quả đúng như ảnh chụp: bấm cột
   * 31/08 thì bảng bung ra ở giữa lưới, chẳng liên quan gì tới ngày vừa bấm. Neo vào phần tử
   * thật cũng là thứ giữ bảng bám đúng cột khi người dùng cuộn ngang.
   */
  return (
    <div className={className}>
      <Popover
        open={panel !== null}
        trigger={[]}
        placement="bottom"
        content={panel}
        onOpenChange={(next) => {
          if (!next) onToggle(day, holiday);
        }}
      >
        <button
          type="button"
          className={styles.holidayTrigger}
          aria-haspopup="dialog"
          aria-expanded={panel !== null}
          aria-label={ariaLabel}
          onClick={() => onToggle(day, holiday)}
        >
          {label}
        </button>
      </Popover>
    </div>
  );
}

/**
 * Bảng của một ngày: nhận diện ngày + các thao tác cả-đội-xe.
 *
 * Bố cục theo bản thiết kế: tiêu đề `thứ, ngày` · tên ngày lễ làm heading kèm THẺ loại · rồi
 * tới các hành động. Nội dung cố ý gọn — mô tả, nguồn dữ liệu và thời điểm đồng bộ đã bỏ vì
 * chúng đẩy hành động thật xuống dưới nếp gấp.
 *
 * Hàng "Khoá xe nhanh" có HAI đích bấm nằm chồng nhau, và đó là chủ đích:
 *  - **Công tắc** = khoá NGAY mọi xe rảnh trong đúng ngày này, lý do mặc định. Một chạm cho
 *    việc hay làm nhất; gạt ngược lại gỡ đúng lô vừa tạo.
 *  - **Phần còn lại của thẻ** = mở hộp đầy đủ (nhiều ngày, đổi lý do, ghi chú, xem trước).
 *
 * Kỹ thuật: nút mở hộp phủ trọn thẻ bằng `::after` (mẫu "stretched link") thay vì lồng
 * `<button>` trong `<button>` — lồng control là HTML không hợp lệ và trình đọc màn hình sẽ bỏ
 * qua cái bên trong. Công tắc nằm trên nhờ `z-index`, nên nó nhận cú bấm của chính nó.
 */
function DayActionPanel({
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
  const typeLabel = holiday
    ? domainLabel('holidayEventType', holiday.eventType, typeMeta?.label)
    : null;

  return (
    <div className={styles.dayPanel}>
      <div className={styles.dayPanelHead}>
        <CalendarOutlined className={styles.dayPanelHeadIcon} aria-hidden />
        <span className={styles.dayPanelDate}>
          {t('dayPanel.heading', {
            weekday: fmt.weekdayLong(day.at),
            date: formatDateKey(day.key),
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
      </div>

      {holiday ? (
        <div className={styles.dayPanelHoliday}>
          <div className={styles.dayPanelHolidayTop}>
            <h3 className={styles.dayPanelHolidayName}>{holiday.name}</h3>
            <Tag color={typeMeta?.color} className={styles.dayPanelTag}>
              {t('dayPanel.holidayBadge')}
            </Tag>
          </div>
          {typeLabel ? <p className={styles.dayPanelHolidayType}>{typeLabel}</p> : null}
        </div>
      ) : null}

      {actions.includes('block') ? (
        <div className={styles.dayCard}>
          <span className={[styles.dayChip, styles.dayChipNeutral].join(' ')} aria-hidden>
            <LockOutlined />
          </span>
          <span className={styles.dayActionTexts}>
            <span className={styles.dayActionLabel}>{t('dayPanel.blockAll')}</span>
            {/* Đường vào hộp nhiều ngày. Là chữ chứ không phải cả thẻ: người dùng cần thấy rõ
                đâu là "gạt để khoá ngay" và đâu là "mở hộp để chọn khoảng". */}
            <button type="button" className={styles.dayCardLink} onClick={onOpenBlockDialog}>
              {t('dayPanel.blockMultiDay')}
            </button>
          </span>
          <Switch
            className={styles.dayCardSwitch}
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
        <button type="button" className={styles.dayRow} onClick={onPrice}>
          <span className={[styles.dayChip, styles.dayChipGold].join(' ')} aria-hidden>
            <DollarOutlined />
          </span>
          <span className={styles.dayActionTexts}>
            <span className={styles.dayActionLabel}>{t('dayPanel.priceAll')}</span>
            <span className={styles.dayActionHint}>{t('dayPanel.priceAllHint')}</span>
          </span>
          <RightOutlined className={styles.dayActionChevron} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** Vỏ chung của thẻ xem nhanh: hàng đầu + nút X đóng tường minh (chạm mobile không có "rời chuột"). */
function QuickCardShell({
  head,
  onClose,
  children,
}: {
  head: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const tCommon = useTranslations('Common');
  return (
    <div className={styles.quickCard}>
      <div className={styles.quickHead}>
        {head}
        <button
          type="button"
          className={styles.quickClose}
          aria-label={tCommon('actions.close')}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <CloseOutlined />
        </button>
      </div>
      {children}
    </div>
  );
}

/**
 * Cột xe: ảnh nhận diện + tên + mã/biển số + giá ngày; trạng thái vận hành khi đáng chú ý.
 * Hover (PC) / chạm (mobile) mở thẻ thông tin xe — đặc biệt cần khi cột đang THU GỌN chỉ còn ảnh.
 */
function ResourceCell({ resource, collapsed }: { resource: CalendarResource; collapsed: boolean }) {
  const fmt = useAppFormat();
  const t = useTranslations('Calendar');
  const domainLabel = useDomainLabel();

  const [infoOpen, setInfoOpen] = useState(false);
  const showStatus =
    resource.operationStatus !== VEHICLE_OPERATION_STATUS.AVAILABLE &&
    resource.operationStatus !== VEHICLE_OPERATION_STATUS.RENTING;
  const statusMeta =
    VEHICLE_OPERATION_STATUS_META[
      resource.operationStatus as keyof typeof VEHICLE_OPERATION_STATUS_META
    ];

  const info = (
    <QuickCardShell
      onClose={() => setInfoOpen(false)}
      head={<span className={styles.quickType}>{t('vehicleCard.heading')}</span>}
    >
      <div className={styles.quickTitle}>{resource.name}</div>
      <dl className={styles.quickRows}>
        <div className={styles.quickRow}>
          <dt>{t('vehicleCard.code')}</dt>
          <dd>{resource.code}</dd>
        </div>
        {resource.plateNumber ? (
          <div className={styles.quickRow}>
            <dt>{t('vehicleCard.plate')}</dt>
            <dd>{resource.plateNumber}</dd>
          </div>
        ) : null}
        {resource.weekdayPrice ? (
          <div className={styles.quickRow}>
            <dt>{t('vehicleCard.dailyPrice')}</dt>
            <dd>{fmt.money(resource.weekdayPrice)}</dd>
          </div>
        ) : null}
        {resource.hourlyPrice ? (
          <div className={styles.quickRow}>
            <dt>{t('vehicleCard.hourlyPrice')}</dt>
            <dd>{fmt.money(resource.hourlyPrice)}</dd>
          </div>
        ) : null}
        {statusMeta ? (
          <div className={styles.quickRow}>
            <dt>{t('vehicleCard.operationStatus')}</dt>
            <dd>
              {domainLabel('vehicleOperationStatus', resource.operationStatus, statusMeta.label)}
            </dd>
          </div>
        ) : null}
      </dl>
    </QuickCardShell>
  );

  return (
    <div
      className={[styles.resourceCell, collapsed ? styles.resourceCellCollapsed : '']
        .filter(Boolean)
        .join(' ')}
    >
      <Popover
        content={info}
        placement="rightTop"
        trigger={['hover', 'focus', 'click']}
        mouseEnterDelay={0.25}
        open={infoOpen}
        onOpenChange={setInfoOpen}
      >
        <button
          type="button"
          className={styles.resourceInfoTrigger}
          aria-label={t('vehicleCard.trigger', { vehicle: resource.name })}
        >
          {resource.mainImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh R2, host cấu hình theo môi trường
            <img
              src={resource.mainImageUrl}
              alt=""
              className={styles.resourceImage}
              loading="lazy"
            />
          ) : (
            <span className={styles.resourceImageFallback} aria-hidden>
              <CarOutlined />
            </span>
          )}
          {collapsed ? null : (
            <span className={styles.resourceTexts}>
              <span className={styles.resourceName} title={resource.name}>
                {resource.name}
              </span>
              <span className={styles.resourceMeta}>
                {resource.plateNumber ?? resource.code}
                {showStatus && statusMeta ? (
                  <span className={styles.resourceStatus}>
                    {' · '}
                    {domainLabel(
                      'vehicleOperationStatus',
                      resource.operationStatus,
                      statusMeta.label,
                    )}
                  </span>
                ) : null}
              </span>
              {resource.weekdayPrice ? (
                <span className={styles.resourcePrice}>
                  {t('vehicleCard.pricePerDay', { price: fmt.money(resource.weekdayPrice) })}
                </span>
              ) : null}
            </span>
          )}
        </button>
      </Popover>
    </div>
  );
}

/** Chấm giá riêng trong ô — chỉ là DẤU (giá không chiếm lịch); chi tiết mở qua "Đặt giá". */
function PriceMarker({ daily }: { daily: string | null }) {
  const fmt = useAppFormat();
  const t = useTranslations('Calendar');

  return (
    <span
      className={styles.priceMarker}
      title={
        daily
          ? t('cell.customPriceMarkerDaily', { price: fmt.money(daily) })
          : t('cell.customPriceMarkerHourly')
      }
      aria-hidden
    />
  );
}

/** Sàn bề rộng thanh event — đơn 2–3 tiếng vẫn phải đủ chỗ cho icon + chữ và bấm được. */
const EVENT_MIN_W = 46;

interface DayCell {
  key: string;
  at: Dayjs;
  dayOfMonth: number;
  isToday: boolean;
  isWeekend: boolean;
}

/**
 * Dải ô ngày + thanh event của MỘT hàng xe.
 *
 * Thanh event có SÀN bề rộng (`EVENT_MIN_W`): đơn thuê vài tiếng vẽ theo tỉ lệ thật chỉ còn
 * vài pixel — không đọc, không bấm được. Vì nới bề rộng nên xếp tầng phải theo VỊ TRÍ PIXEL
 * (`assignPixelLanes`), không theo thời gian: hai đơn ngắn liền nhau không chồng giờ vẫn có
 * thể chồng chỗ trên màn hình.
 */
function EventTrack({
  resource,
  events,
  days,
  range,
  dayWidth,
  priceMarkers,
  holidaysByDay,
  cellsInteractive,
  onCellClick,
  onOpenEvent,
}: {
  resource: CalendarResource;
  events: CalendarEvent[];
  days: DayCell[];
  range: CalendarRange;
  dayWidth: number;
  priceMarkers: ReadonlyMap<string, { dailyPrice: string | null; hourlyPrice: string | null }>;
  holidaysByDay: ReadonlyMap<string, Holiday>;
  cellsInteractive: boolean;
  onCellClick: (dayIndex: number) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  const t = useTranslations('Calendar');
  const trackW = days.length * dayWidth;
  const bars = events
    .map((event) => ({ event, position: computeEventPosition(event, range) }))
    .filter((b): b is { event: CalendarEvent; position: NonNullable<typeof b.position> } =>
      Boolean(b.position),
    )
    .map(({ event, position }) => {
      /*
       * Thang hiển thị 12 GIỜ cho event ngắn hơn một ngày: thuê 6 tiếng chiếm NỬA ô thay vì
       * 1/4 ô — đúng cảm nhận vận hành ("nửa ngày là mất nửa ngày xe"), không phải tỉ lệ
       * thiên văn 24h. Event từ một ngày trở lên vẫn theo tỉ lệ thật để vị trí ngày chính xác.
       */
      const visualSpan =
        position.spanDays < 1 ? Math.min(position.spanDays * 2, 1) : position.spanDays;
      const width = Math.min(
        trackW,
        Math.max(visualSpan * dayWidth - 2, Math.min(EVENT_MIN_W, trackW)),
      );
      // Kẹp trong dải để thanh đã nới không tràn ra ngoài mép phải của hàng.
      const left = Math.max(0, Math.min(position.offsetDays * dayWidth, trackW - width));
      return { event, position, left, width };
    });
  const lanes = assignPixelLanes(bars);

  return (
    <div className={styles.rowTrack}>
      {days.map((day, dayIndex) => {
        const marker = priceMarkers.get(priceMarkerKey(resource.vehicleId, day.key));
        const holiday = holidaysByDay.get(day.key);
        const cellClass = [
          styles.cell,
          day.isWeekend ? styles.weekend : '',
          // Nền ngày lễ đứng TRƯỚC `today` trong file CSS: cùng độ đặc hiệu nên thứ tự nguồn
          // quyết định, và cột hôm nay phải thắng — nó là mốc điều hướng, ngày lễ chỉ là ngữ cảnh.
          holiday ? styles.holidayColumn : '',
          day.isToday ? styles.today : '',
          cellsInteractive ? styles.cellInteractive : '',
        ]
          .filter(Boolean)
          .join(' ');
        /*
         * Ô vẫn là "tạo lịch" y như mọi ngày khác — ngày lễ KHÔNG chặn thao tác nào, nó chỉ
         * thêm một câu ngữ cảnh vào nhãn để người dùng bàn phím biết mình đang ở cột nào.
         *
         * Ghép bằng mã chứ không bằng một khoá message có sẵn hai chỗ trống: hai ghi chú này
         * độc lập nhau (có thể có một, cả hai, hoặc không có), và ` · ` là quy ước TRÌNH BÀY
         * chứ không phải chữ — nó giống nhau ở mọi ngôn ngữ.
         */
        const notes = [
          marker ? t('cell.customPriceNote') : null,
          holiday ? t('cell.holidayNote', { name: holiday.name }) : null,
        ].filter(Boolean);
        const label =
          t('cell.action', {
            vehicle: resource.name,
            date: `${day.key.slice(8, 10)}/${day.key.slice(5, 7)}`,
          }) + notes.map((note) => ` · ${note}`).join('');

        return cellsInteractive ? (
          <button
            key={day.key}
            type="button"
            className={cellClass}
            aria-label={label}
            aria-haspopup="menu"
            onClick={() => onCellClick(dayIndex)}
          >
            {marker ? <PriceMarker daily={marker.dailyPrice} /> : null}
          </button>
        ) : (
          <div key={day.key} className={cellClass}>
            {marker ? <PriceMarker daily={marker.dailyPrice} /> : null}
          </div>
        );
      })}

      {bars.map((bar, i) => (
        <EventBar
          key={bar.event.id}
          event={bar.event}
          vehicleName={resource.name}
          left={bar.left}
          width={bar.width}
          lane={lanes[i] ?? 0}
          clippedStart={bar.position.clippedStart}
          clippedEnd={bar.position.clippedEnd}
          onOpen={() => onOpenEvent(bar.event)}
        />
      ))}
    </div>
  );
}

/** Tách `DH1234 · Tên khách` của title đơn thuê — dữ liệu event cố ý nhẹ, không mang cả đơn. */
function splitBookingTitle(title: string): { code: string | null; customer: string } {
  const idx = title.indexOf(' · ');
  if (idx === -1) return { code: null, customer: title };
  return { code: title.slice(0, idx), customer: title.slice(idx + 3) };
}

/**
 * Thẻ xem nhanh khi hover (desktop) / chạm-focus (mobile, bàn phím) một thanh event — đủ để
 * biết "cái gì, của ai, từ bao giờ đến bao giờ" mà chưa cần mở modal. Có nút X đóng tường minh
 * (trên cảm ứng không có "rời chuột" để tự tắt). Bấm thanh vẫn là đường vào chi tiết đầy đủ.
 */
function EventQuickCard({
  event,
  vehicleName,
  onClose,
}: {
  event: CalendarEvent;
  vehicleName: string;
  onClose: () => void;
}) {
  const fmt = useAppFormat();
  const t = useTranslations('Calendar');
  const domainLabel = useDomainLabel();

  const isBooking = event.type === OCCUPANCY_SOURCE_TYPE.BOOKING;
  const typeMeta = OCCUPANCY_SOURCE_TYPE_META[event.type as OccupancySourceType];
  const { code, customer } = isBooking
    ? splitBookingTitle(event.title)
    : { code: null, customer: event.title };

  const statusNode =
    isBooking && event.status ? (
      <StatusTag
        value={event.status as BookingStatus}
        meta={BOOKING_STATUS_META}
        group="bookingStatus"
      />
    ) : event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE && event.status ? (
      <StatusTag
        value={event.status as VehicleBlockReason}
        meta={VEHICLE_BLOCK_REASON_META}
        group="vehicleBlockReason"
      />
    ) : null;

  return (
    <QuickCardShell
      onClose={onClose}
      head={
        <>
          <span className={styles.quickType}>
            {isBooking
              ? t('eventCard.bookingHeading')
              : domainLabel('occupancySourceType', event.type, typeMeta?.label)}
          </span>
          {statusNode}
        </>
      }
    >
      <div className={styles.quickTitle}>{customer}</div>
      {code ? <div className={styles.quickCode}>{code}</div> : null}
      <dl className={styles.quickRows}>
        <div className={styles.quickRow}>
          <dt>{t('eventCard.vehicle')}</dt>
          <dd>{vehicleName}</dd>
        </div>
        <div className={styles.quickRow}>
          <dt>{t(isBooking ? 'eventCard.pickupAt' : 'eventCard.startAt')}</dt>
          <dd>{formatDateTime(event.startAt)}</dd>
        </div>
        <div className={styles.quickRow}>
          <dt>{t(isBooking ? 'eventCard.returnAt' : 'eventCard.endAt')}</dt>
          <dd>{formatDateTime(event.endAt)}</dd>
        </div>
        <div className={styles.quickRow}>
          <dt>{t('eventCard.duration')}</dt>
          <dd>{fmt.rentalDuration(dayjs(event.startAt), dayjs(event.endAt))}</dd>
        </div>
      </dl>
      <div className={styles.quickHint}>{t('eventCard.openHint')}</div>
    </QuickCardShell>
  );
}

/**
 * Thanh event. Màu lấy từ META của @xeprime/types (CLAUDE.md mục 5 cấm bảng màu tự chế);
 * loại event còn phân biệt bằng ICON + viền (khoá: nét đứt) — màu không phải tín hiệu duy nhất.
 * Hover/focus mở thẻ xem nhanh (`EventQuickCard`) — thay cho tooltip một dòng khó đọc.
 */
function EventBar({
  event,
  vehicleName,
  left,
  width,
  lane,
  clippedStart,
  clippedEnd,
  onOpen,
}: {
  event: CalendarEvent;
  vehicleName: string;
  left: number;
  width: number;
  lane: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  onOpen: () => void;
}) {
  /** Controlled để nút X trong thẻ đóng được — hover ra ngoài vẫn tự tắt qua onOpenChange. */
  const t = useTranslations('Calendar');
  const domainLabel = useDomainLabel();
  const [tipOpen, setTipOpen] = useState(false);
  const toneClass = eventToneClass(event);
  const typeMeta = OCCUPANCY_SOURCE_TYPE_META[event.type as OccupancySourceType];
  const statusLabel =
    event.type === OCCUPANCY_SOURCE_TYPE.BOOKING && event.status
      ? domainLabel(
          'bookingStatus',
          event.status,
          BOOKING_STATUS_META[event.status as BookingStatus]?.label,
        )
      : undefined;
  const ariaLabel = [
    domainLabel('occupancySourceType', event.type, typeMeta?.label ?? event.type),
    event.title,
    t('eventCard.barAriaRange', {
      start: formatDateTime(event.startAt),
      end: formatDateTime(event.endAt),
    }),
    statusLabel,
  ]
    .filter(Boolean)
    .join(', ');

  const icon =
    event.type === OCCUPANCY_SOURCE_TYPE.MAINTENANCE ? (
      <ToolOutlined className={styles.eventIcon} aria-hidden />
    ) : event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE ? (
      <LockOutlined className={styles.eventIcon} aria-hidden />
    ) : null;

  return (
    <Popover
      content={
        <EventQuickCard event={event} vehicleName={vehicleName} onClose={() => setTipOpen(false)} />
      }
      placement="top"
      trigger={['hover', 'focus']}
      mouseEnterDelay={0.2}
      open={tipOpen}
      onOpenChange={setTipOpen}
    >
      <button
        type="button"
        className={[
          styles.eventBar,
          toneClass,
          event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE ? styles.eventBlocked : '',
          clippedStart ? styles.clippedStart : '',
          clippedEnd ? styles.clippedEnd : '',
        ]
          .filter(Boolean)
          .join(' ')}
        // Giá trị tính lúc runtime nên buộc phải qua inline custom property — ngoại lệ
        // hợp lệ của quy tắc "không inline style" (ADR 0003).
        style={
          {
            '--xp-bar-left': `${left}px`,
            '--xp-bar-width': `${width}px`,
            '--xp-bar-top': `${4 + lane * 22}px`,
          } as React.CSSProperties
        }
        aria-label={ariaLabel}
        onClick={() => {
          // Mở modal thì tắt thẻ xem nhanh — không để nó lơ lửng sau lưng dialog.
          setTipOpen(false);
          onOpen();
        }}
      >
        {icon}
        <span className={styles.eventLabel}>{event.title}</span>
      </button>
    </Popover>
  );
}

/** Chú giải gọn — cùng META màu với thanh event, để lưới không cần tooltip mới hiểu được. */
function CalendarLegend() {
  const t = useTranslations('Calendar');

  return (
    <div className={styles.legend} aria-label={t('legend.ariaLabel')}>
      <span className={styles.legendItem}>
        <i className={[styles.legendSwatch, styles.legendBooking].join(' ')} aria-hidden />
        {t('legend.booking')}
      </span>
      <span className={styles.legendItem}>
        <i className={[styles.legendSwatch, styles.legendActive].join(' ')} aria-hidden />
        {t('legend.active')}
      </span>
      <span className={styles.legendItem}>
        <i className={[styles.legendSwatch, styles.legendMaintenance].join(' ')} aria-hidden />
        {t('legend.maintenance')}
      </span>
      <span className={styles.legendItem}>
        <i className={[styles.legendSwatch, styles.legendBlocked].join(' ')} aria-hidden />
        {t('legend.blocked')}
      </span>
      <span className={styles.legendItem}>
        <i className={[styles.legendSwatch, styles.legendPrice].join(' ')} aria-hidden />
        {t('legend.customPrice')}
      </span>
      <span className={styles.legendItem}>
        <i className={[styles.legendSwatch, styles.legendHoliday].join(' ')} aria-hidden />
        {t('legend.holiday')}
      </span>
    </div>
  );
}

/**
 * Tông màu theo loại/trạng thái — QUYẾT ĐỊNH nằm ở `BOOKING_STATUS_META`/`OCCUPANCY_SOURCE_TYPE`
 * của @xeprime/types (CLAUDE.md mục 5 cấm hard code status trong component); ở đây chỉ dịch
 * `StatusColor` sang class dùng token ngữ nghĩa (info/success/warning/error/event-*).
 */
function eventToneClass(event: CalendarEvent): string {
  if (event.type === OCCUPANCY_SOURCE_TYPE.MAINTENANCE) return styles.toneMaintenance!;
  if (event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE) return styles.toneBlocked!;

  const meta = event.status ? BOOKING_STATUS_META[event.status as BookingStatus] : undefined;
  switch (meta?.color) {
    case 'green':
      return styles.toneGreen!;
    case 'gold':
      return styles.toneGold!;
    case 'orange':
      return styles.toneOrange!;
    case 'red':
      return styles.toneRed!;
    case 'blue':
    case 'cyan':
      return styles.toneBlue!;
    default:
      return styles.toneNeutral!;
  }
}
