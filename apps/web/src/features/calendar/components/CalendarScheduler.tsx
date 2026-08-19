'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { Alert, Button, Popover, Skeleton } from 'antd';
import {
  CarOutlined, CloseOutlined, LeftOutlined, LockOutlined, RightOutlined, ToolOutlined, } from '@ant-design/icons';
import { useLayoutEffect, useMemo, useState } from 'react';
import {
  BOOKING_STATUS_META, OCCUPANCY_SOURCE_TYPE, OCCUPANCY_SOURCE_TYPE_META, PERMISSION, VEHICLE_BLOCK_REASON_META, VEHICLE_OPERATION_STATUS, VEHICLE_OPERATION_STATUS_META, type BookingStatus, type OccupancySourceType, type VehicleBlockReason, } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { StaffBookingDialog } from '@/features/booking-requests/components/StaffBookingDialog';
import { useIsMobile } from '@/hooks/use-media-query';
import { usePermissions } from '@/hooks/use-permissions';
import { APP_TIME_ZONE, dayjs } from '@/lib/datetime';
import { getErrorMessage } from '@/services/api-client';
import { priceMarkerKey, useCalendarData } from '../hooks/use-calendar-data';
import { formatDateTime, listDays } from '../utils/calendar-date.util';
import { assignPixelLanes, computeEventPosition } from '../utils/calendar-position.util';
import type {
  CalendarEvent,
  CalendarRange,
  CalendarResource,
  VehicleBlock,
} from '../types/calendar.types';
import { BookingDetailDialog } from '@/features/bookings/components/BookingDetailDialog';
import {
  CalendarCellActions,
  type CellActionKey,
  type CellActionTarget,
} from './CalendarCellActions';
import { CalendarToolbar } from './CalendarToolbar';
import { DailyPriceDialog, type DailyPriceDialogState } from './DailyPriceDialog';
import { MaintenanceEventDialog } from './MaintenanceEventDialog';
import { VehicleBlockDetailDialog } from './VehicleBlockDetailDialog';
import { VehicleBlockDialog, type VehicleBlockDialogState } from './VehicleBlockDialog';
import styles from './CalendarScheduler.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

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
        title="Không có quyền xem lịch xe"
        description="Liên hệ quản trị viên nếu bạn cần quyền này."
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
          message="Không tải được lịch"
          description={getErrorMessage(error)}
          action={
            <Button size="small" onClick={refetch}>
              Thử lại
            </Button>
          }
        />
      ) : null}

      {!isLoading && !error && resources.length > 0 && !hasAnyEvent ? (
        // Khoảng đang xem chưa có lịch nào: nói nhỏ một dòng, lưới VẪN hiện và bấm được —
        // không dựng thẻ rỗng chặn lên vùng thao tác.
        <div className={styles.emptyHint} role="status">
          Chưa có lịch trong khoảng này{cellsInteractive ? ' — chọn ngày trống để tạo lịch' : ''}.
        </div>
      ) : null}

      {isLoading ? (
        <div className={styles.loadingBlock} aria-busy="true" aria-label="Đang tải lịch">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      ) : resources.length === 0 && !error ? (
        <EmptyState
          variant={filtered ? 'no-results' : 'empty'}
          title={filtered ? 'Không có xe nào khớp bộ lọc' : 'Chưa có xe nào'}
          description={
            filtered
              ? 'Thử đổi từ khoá hoặc loại xe.'
              : 'Thêm xe vào gian hàng để bắt đầu xếp lịch.'
          }
        />
      ) : resources.length > 0 ? (
        <div
          ref={setViewportEl}
          className={[styles.viewport, isFetching ? styles.refetching : '']
            .filter(Boolean)
            .join(' ')}
          role="region"
          aria-label="Lịch thuê xe theo ngày"
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
                  <span className={styles.cornerLabel}>Phương tiện ({resources.length})</span>
                )}
                <button
                  type="button"
                  className={styles.collapseToggle}
                  aria-label={
                    resourceCollapsed ? 'Mở rộng cột phương tiện' : 'Thu gọn cột phương tiện'
                  }
                  aria-expanded={!resourceCollapsed}
                  title={resourceCollapsed ? 'Mở rộng cột phương tiện' : 'Thu gọn cột phương tiện'}
                  onClick={() => setResourceCollapsed((v) => !v)}
                >
                  {resourceCollapsed ? <RightOutlined /> : <LeftOutlined />}
                </button>
              </div>
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
                    <span className={styles.dayNumber}>{day.dayOfMonth}</span>
                  </div>
                ))}
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
                {resourceCollapsed ? 'Trống' : 'Xe còn trống'}
              </div>
              <div className={styles.summaryTrack}>
                {days.map((day) => {
                  const count = availableByDay.get(day.key);
                  return (
                    <div
                      key={day.key}
                      className={[
                        styles.summaryCell,
                        day.isToday ? styles.today : '',
                        count === 0 ? styles.summaryNone : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-label={`Ngày ${day.dayOfMonth}: ${count ?? '—'} xe còn trống`}
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
  return (
    <div className={styles.quickCard}>
      <div className={styles.quickHead}>
        {head}
        <button
          type="button"
          className={styles.quickClose}
          aria-label="Đóng"
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
      head={<span className={styles.quickType}>Thông tin xe</span>}
    >
      <div className={styles.quickTitle}>{resource.name}</div>
      <dl className={styles.quickRows}>
        <div className={styles.quickRow}>
          <dt>Mã xe</dt>
          <dd>{resource.code}</dd>
        </div>
        {resource.plateNumber ? (
          <div className={styles.quickRow}>
            <dt>Biển số</dt>
            <dd>{resource.plateNumber}</dd>
          </div>
        ) : null}
        {resource.weekdayPrice ? (
          <div className={styles.quickRow}>
            <dt>Giá ngày</dt>
            <dd>{fmt.money(resource.weekdayPrice)}</dd>
          </div>
        ) : null}
        {resource.hourlyPrice ? (
          <div className={styles.quickRow}>
            <dt>Giá giờ</dt>
            <dd>{fmt.money(resource.hourlyPrice)}</dd>
          </div>
        ) : null}
        {statusMeta ? (
          <div className={styles.quickRow}>
            <dt>Vận hành</dt>
            <dd>{statusMeta.label}</dd>
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
          aria-label={`Thông tin xe ${resource.name}`}
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
                  <span className={styles.resourceStatus}> · {statusMeta.label}</span>
                ) : null}
              </span>
              {resource.weekdayPrice ? (
                <span className={styles.resourcePrice}>
                  {fmt.money(resource.weekdayPrice)}/ngày
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

  return (
    <span
      className={styles.priceMarker}
      title={daily ? `Giá riêng: ${fmt.money(daily)}/ngày` : 'Có giá riêng theo giờ'}
      aria-hidden
    />
  );
}

/** Sàn bề rộng thanh event — đơn 2–3 tiếng vẫn phải đủ chỗ cho icon + chữ và bấm được. */
const EVENT_MIN_W = 46;

interface DayCell {
  key: string;
  dayOfMonth: number;
  weekdayLabel: string;
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
  cellsInteractive: boolean;
  onCellClick: (dayIndex: number) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
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
        const cellClass = [
          styles.cell,
          day.isWeekend ? styles.weekend : '',
          day.isToday ? styles.today : '',
          cellsInteractive ? styles.cellInteractive : '',
        ]
          .filter(Boolean)
          .join(' ');
        const label = `Tạo lịch cho ${resource.name} ngày ${day.key.slice(8, 10)}/${day.key.slice(5, 7)}${marker ? ' · đang có giá riêng' : ''}`;

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

  const isBooking = event.type === OCCUPANCY_SOURCE_TYPE.BOOKING;
  const typeMeta = OCCUPANCY_SOURCE_TYPE_META[event.type as OccupancySourceType];
  const { code, customer } = isBooking
    ? splitBookingTitle(event.title)
    : { code: null, customer: event.title };

  const statusNode =
    isBooking && event.status ? (
      <StatusTag value={event.status as BookingStatus} meta={BOOKING_STATUS_META} group="bookingStatus" />
    ) : event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE && event.status ? (
      <StatusTag value={event.status as VehicleBlockReason} meta={VEHICLE_BLOCK_REASON_META} group="vehicleBlockReason" />
    ) : null;

  return (
    <QuickCardShell
      onClose={onClose}
      head={
        <>
          <span className={styles.quickType}>
            {isBooking ? 'Chi tiết nhanh đơn đặt' : typeMeta?.label}
          </span>
          {statusNode}
        </>
      }
    >
      <div className={styles.quickTitle}>{customer}</div>
      {code ? <div className={styles.quickCode}>{code}</div> : null}
      <dl className={styles.quickRows}>
        <div className={styles.quickRow}>
          <dt>Xe</dt>
          <dd>{vehicleName}</dd>
        </div>
        <div className={styles.quickRow}>
          <dt>{isBooking ? 'Nhận xe' : 'Bắt đầu'}</dt>
          <dd>{formatDateTime(event.startAt)}</dd>
        </div>
        <div className={styles.quickRow}>
          <dt>{isBooking ? 'Trả xe' : 'Kết thúc'}</dt>
          <dd>{formatDateTime(event.endAt)}</dd>
        </div>
        <div className={styles.quickRow}>
          <dt>Thời lượng</dt>
          <dd>{fmt.rentalDuration(dayjs(event.startAt), dayjs(event.endAt))}</dd>
        </div>
      </dl>
      <div className={styles.quickHint}>Bấm vào thanh lịch để xem chi tiết</div>
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
  const [tipOpen, setTipOpen] = useState(false);
  const toneClass = eventToneClass(event);
  const typeMeta = OCCUPANCY_SOURCE_TYPE_META[event.type as OccupancySourceType];
  const statusLabel =
    event.type === OCCUPANCY_SOURCE_TYPE.BOOKING && event.status
      ? BOOKING_STATUS_META[event.status as BookingStatus]?.label
      : undefined;
  const ariaLabel = [
    typeMeta?.label ?? event.type,
    event.title,
    `từ ${formatDateTime(event.startAt)} đến ${formatDateTime(event.endAt)}`,
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
  return (
    <div className={styles.legend} aria-label="Chú giải lịch">
      <span className={styles.legendItem}>
        <i className={[styles.legendSwatch, styles.legendBooking].join(' ')} aria-hidden />
        Đơn thuê
      </span>
      <span className={styles.legendItem}>
        <i className={[styles.legendSwatch, styles.legendActive].join(' ')} aria-hidden />
        Đang thuê
      </span>
      <span className={styles.legendItem}>
        <i className={[styles.legendSwatch, styles.legendMaintenance].join(' ')} aria-hidden />
        Bảo dưỡng
      </span>
      <span className={styles.legendItem}>
        <i className={[styles.legendSwatch, styles.legendBlocked].join(' ')} aria-hidden />
        Xe bị khóa
      </span>
      <span className={styles.legendItem}>
        <i className={[styles.legendSwatch, styles.legendPrice].join(' ')} aria-hidden />
        Giá riêng
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
