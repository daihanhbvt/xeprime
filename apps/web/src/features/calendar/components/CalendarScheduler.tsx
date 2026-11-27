'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { Alert, App, Button, Popover, Skeleton } from 'antd';
import { CarOutlined, LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  OCCUPANCY_SOURCE_TYPE,
  PERMISSION,
  VEHICLE_BLOCK_REASON,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { holidayRunAround, LIST_SEPARATOR } from '@xeprime/domain';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { StaffBookingDialog } from '@/features/booking-requests/components/StaffBookingDialog';
import { useBookingRequestDecisions } from '@/features/booking-requests/hooks/use-booking-request-decisions';
import { BookingDetailDialog } from '@/features/bookings/components/BookingDetailDialog';
import { useCanCreateBooking } from '@/features/bookings/hooks/use-can-create-booking';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { useIsMobile } from '@/hooks/use-media-query';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { APP_TIME_ZONE, dayjs } from '@/lib/datetime';
import { getErrorMessage } from '@/services/api-client';
import { useBulkBlockDay, useBulkDayPreview, useReleaseBulkBlock } from '../hooks/use-bulk-day';
import { priceMarkerKey, useCalendarData } from '../hooks/use-calendar-data';
import { useCalendarHolidays } from '../hooks/use-calendar-holidays';
import { useDayRangeSelect, type DaySpanSelection } from '../hooks/use-day-range-select';
import { listDays } from '../utils/calendar-date.util';
import { isRangeFree } from '../utils/calendar-event-model';
import {
  assignPixelLanes,
  computeDaySnap,
  type DayEdgeGap,
  type DaySnapPosition,
} from '../utils/calendar-position.util';
import type {
  CalendarEvent,
  CalendarRange,
  CalendarResource,
  Holiday,
  VehicleBlock,
} from '../types/calendar.types';
import { BulkDayBlockDialog, type BulkDayBlockState } from './BulkDayBlockDialog';
import { BulkDayPriceDialog, type BulkDayPriceState } from './BulkDayPriceDialog';
import {
  CalendarCellActions,
  type CellActionKey,
  type CellActionTarget,
} from './CalendarCellActions';
import {
  CalendarDayHeader,
  CalendarDayPanel,
  type DayActionKey,
  type DayCell,
} from './CalendarDayHeader';
import { CalendarEventBar, QuickClose, vehicleTitle } from './CalendarEventBar';
import { CalendarLegend } from './CalendarLegend';
import { CalendarRequestDialog } from './CalendarRequestDialog';
import { CalendarToolbar } from './CalendarToolbar';
import type { CalendarVehicleInfo } from './CalendarVehicleSummary';
import { DailyPriceDialog, type DailyPriceDialogState } from './DailyPriceDialog';
import { MaintenanceEventDialog } from './MaintenanceEventDialog';
import { VehicleBlockDetailDialog } from './VehicleBlockDetailDialog';
import { VehicleBlockDialog, type VehicleBlockDialogState } from './VehicleBlockDialog';
import styles from './CalendarScheduler.module.css';

/** Giờ nhận xe mặc định khi tạo đơn từ ô lịch (giờ Việt Nam). */
const DEFAULT_PICKUP_HOUR = 8;

/**
 * Kích thước lưới — JS cần biết để virtualize + định vị; CSS đọc lại qua custom property.
 * Số đo theo design (`24200:99389`, khung 1920 · nội dung 1560): header 56, hàng 136, cột xe 202,
 * thẻ 76 (đệm 8 · ba dòng 18/20/18 · hai khe 2).
 */
const HEADER_H = 56;
const RESOURCE_W_DESKTOP = 202;
const RESOURCE_W_MOBILE = 104;
/** Cột xe THU GỌN: chỉ còn ảnh — nhường tối đa bề ngang cho lưới ngày. */
const RESOURCE_W_COLLAPSED = 64;
/** Sàn bề rộng ngày: design 30 ngày cuộn ngang thay vì ép thẻ xuống không đọc nổi. */
const MIN_DAY_W_DESKTOP = 96;
/** Sàn thấp hơn ở điện thoại để 7 ngày (cột xe thu gọn) vừa khít 390px. */
const MIN_DAY_W_MOBILE = 46;
const CARD_H_DESKTOP = 76;
/** Điện thoại: thẻ hai dòng (chip + tiền/khách), bỏ dòng giờ. */
const CARD_H_MOBILE = 52;
const ROW_MIN_DESKTOP = 136;
/**
 * Hàng khi giá đứng cùng dòng biển số (đội > 4 xe): đệm 12 · ảnh 40 · khe 8 · tên 20 · khe 2 ·
 * biển số 18 · đệm 12. Vẫn cao hơn một tầng thẻ (76 + 2 × 12).
 */
const ROW_MIN_DESKTOP_COMPACT = 112;
const ROW_MIN_MOBILE = 68;
/** Đội xe tới chừng này xe thì giá ngày giữ dòng riêng; đông hơn thì lên cùng dòng biển số. */
const PRICE_STACKED_MAX_VEHICLES = 4;
/** Khe giữa hai tầng thẻ và đệm trên/dưới tối thiểu của hàng nhiều tầng. */
const LANE_GAP = 8;
const ROW_PAD = 12;
/** Thẻ thụt vào trong ô mỗi bên — design để thẻ cách vạch ngày. */
const CARD_INSET = 6;
/** Sàn bề rộng thẻ — chuyến vài tiếng vẫn đủ chỗ cho chip + số tiền gọn và bấm được. */
const EVENT_MIN_W = 56;
/** Phần ô ngày để hở thêm ở mỗi đầu thẻ theo mức hở (khít · hở ít · hở nhiều) - xem `computeDaySnap`. */
const EDGE_GAP_RATIO: Record<DayEdgeGap, number> = { 0: 0, 1: 0.08, 2: 0.16 };
/** Bề ngang bảng thao tác ô — dùng để kẹp neo không tràn mép phải. */
const CELL_MENU_W = 310;

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
  | { kind: 'booking-pick' }
  | { kind: 'booking-detail'; bookingId: string }
  | { kind: 'request-detail'; requestId: string }
  | { kind: 'block'; state: NonNullable<VehicleBlockDialogState> }
  | { kind: 'block-detail'; blockId: string }
  | { kind: 'price'; state: DailyPriceDialogState }
  | { kind: 'maintenance'; vehicleId: string; vehicleName: string; recordId: string }
  | null;

/** Thẻ đã tính chỗ trên một hàng. */
interface PlacedBar {
  event: CalendarEvent;
  left: number;
  width: number;
  top: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

interface RowLayout {
  height: number;
  bars: PlacedBar[];
}

function vehicleInfo(resource: CalendarResource): CalendarVehicleInfo {
  return {
    name: resource.name,
    plateNumber: resource.plateNumber ?? null,
    imageUrl: resource.mainImageUrl ?? null,
    weekdayPrice: resource.weekdayPrice ?? null,
    hourlyPrice: resource.hourlyPrice ?? null,
  };
}

/**
 * Lịch thuê xe — workspace điều phối đội xe (thiết kế lại 25/11/2026, Figma Partner-XePrime
 * `24200:99389`; sổ cái `09_PARTNER_REDESIGN.md` §3.18).
 *
 * Cấu trúc: tiêu đề trang + "Tạo đơn thuê" · hàng lọc · MỘT thẻ (chú thích + lưới). Lưới là MỘT
 * vùng cuộn sở hữu cả hai chiều; cột xe sticky trái, header ngày sticky trên; hàng xe virtualize,
 * mỗi hàng cao theo số TẦNG thẻ của nó.
 *
 * Ô trống: bấm một ô — hoặc KÉO CHUỘT qua nhiều ô cùng hàng — mở BỘ CHỌN hành động (Đặt xe / Khoá
 * xe / Đặt giá riêng theo quyền) cho cả khoảng; không thao tác nào chạy thẳng từ một cú bấm. Thẻ
 * mở chi tiết đúng loại (đơn · yêu cầu · khoá · bảo dưỡng) mà không rời lịch. Kéo-thả ĐỔI LỊCH một
 * đơn vẫn không có: đổi giờ đi qua form có xác nhận, backend quyết (ADR 0006).
 *
 * Lưới vẽ cả yêu cầu CHỜ DUYỆT (nhóm "Cần xử lý") như một lớp hiển thị: chúng không chiếm lịch
 * (ADR 0044 điều 1) nên không làm một ngày thành "đã có lịch".
 */
export function CalendarScheduler() {
  const isMobile = useIsMobile();
  /**
   * Vùng cuộn giữ bằng STATE, không phải ref: nó chỉ mount SAU khi hết loading, nên một
   * `useLayoutEffect([])` với ref sẽ chạy lúc phần tử chưa tồn tại và không bao giờ đo được.
   */
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null);
  const {
    range,
    filters,
    resources,
    eventsByResource,
    priceMarkers,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useCalendarData();
  const { has } = usePermissions();
  const t = useTranslations('Calendar');
  const decisions = useBookingRequestDecisions();

  const canView = has(PERMISSION.CALENDAR_VIEW);
  // Lập đơn tay: quyền + tuyến gói. Chủ xe cá nhân chỉ còn "Khoá lịch" cho chuyến ngoài chợ.
  const canCreate = useCanCreateBooking();
  const canBlock = has(PERMISSION.VEHICLE_BLOCK_SCHEDULE);
  /*
   * Phiên hỗ trợ gian hàng (ADR 0050 §13): `vehicles.update` của phiên là để sửa thông tin/vận hành
   * — giá theo ngày không mở; khoá cả ngày cho mọi xe (một lô) cũng không, chỉ khoá lẻ từng xe.
   */
  const priceHidden = useSupportHides(SUPPORT_HIDDEN_AREA.MONEY_TERMS);
  const bulkBlockHidden = useSupportHides(SUPPORT_HIDDEN_AREA.BULK_BLOCK);
  const canPrice = has(PERMISSION.VEHICLE_UPDATE) && !priceHidden;
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
  const [cellTarget, setCellTarget] = useState<
    (CellActionTarget & { span: DaySpanSelection }) | null
  >(null);
  /** Thu gọn cột xe (chỉ còn ảnh) — nhường bề ngang cho lưới; chi tiết xe vẫn xem qua popover. */
  const [resourceCollapsed, setResourceCollapsed] = useState(false);

  /*
   * Đội xe lớn (> `PRICE_STACKED_MAX_VEHICLES` xe, người dùng chốt 26/11/2026): giá ngày đứng CÙNG
   * dòng biển số, chữ nhỏ - bớt một dòng mỗi hàng, nên hàng thấp xuống để thấy thêm xe. Đội xe nhỏ
   * giữ giá ở dòng riêng như cũ. Cả hai đều viết gọn "680k".
   */
  const priceInline = resources.length > PRICE_STACKED_MAX_VEHICLES;
  const cardH = isMobile ? CARD_H_MOBILE : CARD_H_DESKTOP;
  const rowMin = isMobile
    ? ROW_MIN_MOBILE
    : priceInline
      ? ROW_MIN_DESKTOP_COMPACT
      : ROW_MIN_DESKTOP;
  const resourceW = resourceCollapsed
    ? RESOURCE_W_COLLAPSED
    : isMobile
      ? RESOURCE_W_MOBILE
      : RESOURCE_W_DESKTOP;
  const minDayW = isMobile ? MIN_DAY_W_MOBILE : MIN_DAY_W_DESKTOP;

  // Cột ngày co giãn lấp đầy bề ngang (7 ngày → ô rộng, 30 ngày → chạm sàn rồi cuộn ngang TRONG
  // lưới, body không tràn). Đo bằng ResizeObserver theo phần tử.
  const [viewportW, setViewportW] = useState(0);
  useLayoutEffect(() => {
    if (!viewportEl) return;
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

  const days = useMemo<DayCell[]>(() => listDays(range), [range]);
  const canvasWidth = resourceW + days.length * dayWidth;

  /*
   * Lớp ngày lễ — nạp RIÊNG, cố ý không đi qua `useCalendarData`. Hỏng thì bản đồ rỗng và lưới
   * chạy y như cũ, không Alert, không skeleton.
   */
  const holidaysByDay = useCalendarHolidays(range);

  /** Chỗ của từng thẻ + chiều cao từng hàng — tính một lần cho cả lưới. */
  const rowLayouts = useMemo(
    () =>
      resources.map((resource) =>
        layoutRow(
          eventsByResource.get(resource.id) ?? [],
          range,
          days.length * dayWidth,
          dayWidth,
          {
            cardH,
            rowMin,
          },
        ),
      ),
    [resources, eventsByResource, range, days.length, dayWidth, cardH, rowMin],
  );

  const rowVirtualizer = useVirtualizer({
    count: resources.length,
    getScrollElement: () => viewportEl,
    estimateSize: (index) => rowLayouts[index]?.height ?? rowMin,
    // Header ngày chiếm 56px đầu vùng cuộn — khai báo để dải hàng hiển thị tính đúng offset.
    scrollMargin: HEADER_H,
    // 1.000 xe × 30 ngày là kịch bản thật. Không virtualize thì trình duyệt giữ hàng chục nghìn
    // node và cuộn giật.
    overscan: 6,
  });
  /*
   * Chiều cao hàng đổi theo dữ liệu (thêm/bớt tầng thẻ) — báo virtualizer đo lại. Phụ thuộc vào
   * CHỮ KÝ chiều cao (chuỗi), không vào mảng bố cục: `measure()` render lại, và một phụ thuộc đổi
   * danh tính mỗi lần render sẽ thành vòng lặp vô tận.
   */
  const heightsKey = rowLayouts.map((layout) => layout.height).join(',');
  useLayoutEffect(() => {
    rowVirtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `rowVirtualizer` là một thể hiện ổn định
  }, [heightsKey]);

  /** Mốc dọc (trong canvas) của từng hàng — neo bảng thao tác ngay dưới hàng. */
  const rowStarts = useMemo(() => {
    const starts: number[] = [];
    let acc = HEADER_H;
    for (const layout of rowLayouts) {
      starts.push(acc);
      acc += layout.height;
    }
    return starts;
  }, [rowLayouts]);

  /** Bảng thao tác cho một khoảng ngày của một hàng (từ bấm ô hoặc thả chuột). */
  const openCellMenu = useCallback(
    (selection: DaySpanSelection) => {
      if (!cellsInteractive) return;
      const index = resources.findIndex((r) => r.id === selection.resourceId);
      const resource = resources[index];
      const first = days[selection.start]?.key;
      const last = days[selection.end]?.key;
      if (!resource || !first || !last) return;
      setCellTarget({
        span: selection,
        vehicleId: resource.vehicleId,
        vehicleName: vehicleTitle(resource),
        date: first,
        endDate: last,
        free: isRangeFree(eventsByResource.get(resource.id) ?? [], first, last),
        anchor: {
          left: Math.max(
            resourceW,
            Math.min(resourceW + selection.start * dayWidth, canvasWidth - CELL_MENU_W),
          ),
          top: (rowStarts[index] ?? HEADER_H) + (rowLayouts[index]?.height ?? rowMin) + 2,
        },
      });
    },
    [
      canvasWidth,
      cellsInteractive,
      dayWidth,
      days,
      eventsByResource,
      resourceW,
      resources,
      rowLayouts,
      rowMin,
      rowStarts,
    ],
  );

  const drag = useDayRangeSelect({
    dayWidth,
    dayCount: days.length,
    viewport: viewportEl,
    onCommit: openCellMenu,
  });
  /** Khoảng đang tô trên lưới: lượt kéo đang chạy, hoặc khoảng của bảng thao tác đang mở. */
  const highlighted = drag.dragging ?? cellTarget?.span ?? null;

  /**
   * Bảng hành động của một ngày (mở từ header) — và hai hộp nó dẫn tới. Sống ở đây vì mỗi lúc chỉ
   * MỘT ngày được mở, và vì hộp phải sống ngoài cột (cột nằm trong vùng cuộn ngang).
   */
  const [dayPanel, setDayPanel] = useState<{ day: DayCell; holiday: Holiday | undefined } | null>(
    null,
  );
  const [bulkBlock, setBulkBlock] = useState<BulkDayBlockState | null>(null);
  const [bulkPrice, setBulkPrice] = useState<BulkDayPriceState | null>(null);

  /** Thao tác cả-đội-xe dùng ĐÚNG quyền của thao tác lẻ tương ứng — làm hàng loạt không mở thêm quyền. */
  const dayActions = useMemo<DayActionKey[]>(
    () => [
      ...(canBlock && !bulkBlockHidden ? (['block'] as const) : []),
      ...(canPrice ? (['price'] as const) : []),
    ],
    [bulkBlockHidden, canBlock, canPrice],
  );

  // Trạng thái công tắc "đã khoá cả ngày chưa" — chỉ hỏi khi bảng đang mở (30 cột ≠ 30 request).
  const panelDate = dayPanel?.day.key ?? '';
  const panelPreview = useBulkDayPreview(panelDate, panelDate, dayPanel !== null);
  const releaseBatch = useReleaseBulkBlock();
  const quickBlock = useBulkBlockDay();
  const { message } = App.useApp();

  /**
   * Khoá NGAY mọi xe rảnh trong đúng ngày này — thao tác một-chạm của công tắc. Chỉ gửi xe đang
   * rảnh: xe có đơn thì constraint từ chối (ADR 0006) và cả lô hỏng. Thông báo nói con số THẬT.
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
              ? t('dayPanel.quickBlockedPartial', { count: result.fullyBlockedVehicles, skipped })
              : t('dayPanel.quickBlocked', { count: result.fullyBlockedVehicles }),
          );
        },
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  /** Cụm ngày lễ liền kề chứa ngày đang mở — khoảng gợi ý cho chế độ nhiều ngày. */
  const suggestedRange = useMemo(
    () => (panelDate ? holidayRunAround(holidaysByDay, panelDate) : { from: '', to: '' }),
    [holidaysByDay, panelDate],
  );

  const filtered = Boolean(filters.q || filters.vehicleType);

  const createButton = canCreate ? (
    <Button
      type="primary"
      icon={<PlusOutlined />}
      onClick={() => setDialog({ kind: 'booking-pick' })}
    >
      {t('page.create')}
    </Button>
  ) : null;
  const header = (
    <ManagePageHeader title={t('page.title')} subtitle={t('page.subtitle')} extra={createButton} />
  );

  if (!canView) {
    return (
      <div className={styles.wrapper}>
        {header}
        <PermissionState
          kind="forbidden"
          title={t('states.forbiddenTitle')}
          description={t('states.forbiddenDescription')}
          missingPermissions={[PERMISSION.CALENDAR_VIEW]}
        />
      </div>
    );
  }

  function runCellAction(action: CellActionKey) {
    const target = cellTarget;
    setCellTarget(null);
    if (!target) return;
    const resource = resources.find((r) => r.vehicleId === target.vehicleId);
    if (action === 'booking') {
      // `.toISOString()` ĐÚNG và cố ý: `dayjs.tz(dateKey, APP_TIME_ZONE)` dựng một mốc TUYỆT ĐỐI
      // từ ngày lịch của ô, không phải mặt đồng hồ người dùng chọn. N ô = N ngày thuê: nhận 8h ngày
      // đầu, trả 8h sáng hôm sau ngày cuối.
      const pickupAt = dayjs
        .tz(target.date, APP_TIME_ZONE)
        .hour(DEFAULT_PICKUP_HOUR)
        .minute(0)
        .second(0)
        .millisecond(0);
      const returnAt = dayjs
        .tz(target.endDate, APP_TIME_ZONE)
        .add(1, 'day')
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
        returnAt: returnAt.toISOString(),
      });
    } else if (action === 'block') {
      setDialog({
        kind: 'block',
        state: {
          mode: 'create',
          vehicleId: target.vehicleId,
          vehicleName: target.vehicleName,
          date: target.date,
          endDate: target.endDate,
          ...(resource ? { vehicle: vehicleInfo(resource) } : {}),
        },
      });
    } else {
      setDialog({
        kind: 'price',
        state: {
          vehicleId: target.vehicleId,
          vehicleName: resource?.name ?? target.vehicleName,
          plateNumber: resource?.plateNumber ?? null,
          imageUrl: resource?.mainImageUrl ?? null,
          weekdayPrice: resource?.weekdayPrice ?? null,
          hourlyPrice: resource?.hourlyPrice ?? null,
          date: target.date,
          endDate: target.endDate,
        },
      });
    }
  }

  /** Bấm thẻ → hộp chi tiết đúng loại. KHÔNG điều hướng rời lịch. */
  function openEvent(event: CalendarEvent, resource: CalendarResource) {
    if (!event.sourceId) return;
    if (event.type === OCCUPANCY_SOURCE_TYPE.BOOKING) {
      setDialog({ kind: 'booking-detail', bookingId: event.sourceId });
    } else if (event.type === OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST) {
      setDialog({ kind: 'request-detail', requestId: event.sourceId });
    } else if (event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE) {
      setDialog({ kind: 'block-detail', blockId: event.sourceId });
    } else if (event.type === OCCUPANCY_SOURCE_TYPE.MAINTENANCE) {
      setDialog({
        kind: 'maintenance',
        vehicleId: resource.vehicleId,
        vehicleName: vehicleTitle(resource),
        recordId: event.sourceId,
      });
    }
  }

  const carCount = resources.filter((r) => r.vehicleType === VEHICLE_TYPE.CAR).length;
  const bikeCount = resources.filter((r) => r.vehicleType === VEHICLE_TYPE.MOTORBIKE).length;

  return (
    <div className={styles.wrapper}>
      {header}
      <CalendarToolbar />

      <div className={styles.card}>
        <CalendarLegend />

        {error ? (
          <Alert
            type="error"
            showIcon
            className={styles.inlineAlert}
            title={t('states.loadFailed')}
            description={getErrorMessage(error)}
            action={
              <Button size="small" onClick={refetch}>
                {t('states.retry')}
              </Button>
            }
          />
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
            className={cx(
              styles.viewport,
              isFetching && styles.refetching,
              drag.dragging && styles.selecting,
            )}
            role="region"
            aria-label={t('grid.ariaLabel')}
            aria-busy={isFetching || undefined}
            tabIndex={0}
            style={
              {
                '--xp-day-width': `${dayWidth}px`,
                '--xp-resource-col-width': `${resourceW}px`,
                '--xp-calendar-header-h': `${HEADER_H}px`,
                '--xp-card-height': `${cardH}px`,
              } as React.CSSProperties
            }
          >
            <div
              className={styles.canvas}
              style={{ '--xp-canvas-width': `${canvasWidth}px` } as React.CSSProperties}
            >
              {/* ── Header ngày (sticky trên) ─────────────────────────────── */}
              <div className={styles.headerRow}>
                <div
                  className={cx(styles.cornerCell, resourceCollapsed && styles.cornerCellCollapsed)}
                >
                  {resourceCollapsed ? null : (
                    <span className={styles.cornerTexts}>
                      <span className={styles.cornerTitle}>{t('grid.resourceTitle')}</span>
                      <span className={styles.cornerSub}>
                        {t('grid.resourceCount', {
                          cars: carCount,
                          bikes: bikeCount,
                          both: carCount > 0 && bikeCount > 0 ? 'yes' : 'no',
                        })}
                      </span>
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
                      <CalendarDayHeader
                        key={day.key}
                        day={day}
                        holiday={holiday}
                        actions={dayActions}
                        panel={
                          isOpen ? (
                            <CalendarDayPanel
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
                        onToggle={() =>
                          setDayPanel((current) =>
                            current?.day.key === day.key ? null : { day, holiday },
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
                  const layout = rowLayouts[virtualRow.index];
                  if (!resource || !layout) return null;
                  const span = highlighted?.resourceId === resource.id ? highlighted : null;

                  return (
                    <div
                      key={resource.id}
                      className={styles.row}
                      style={{
                        height: layout.height,
                        transform: `translateY(${virtualRow.start - HEADER_H}px)`,
                      }}
                    >
                      <ResourceCell
                        resource={resource}
                        collapsed={resourceCollapsed}
                        priceInline={priceInline}
                      />
                      <div className={styles.rowTrack}>
                        {days.map((day, dayIndex) => (
                          <DayCellButton
                            key={day.key}
                            resource={resource}
                            day={day}
                            holiday={holidaysByDay.get(day.key)}
                            price={priceMarkers.get(priceMarkerKey(resource.vehicleId, day.key))}
                            selected={
                              span !== null && dayIndex >= span.start && dayIndex <= span.end
                            }
                            interactive={cellsInteractive}
                            onPointerDown={(event) => drag.startDrag(resource.id, dayIndex, event)}
                            onClick={() => {
                              if (drag.consumeClick()) return;
                              openCellMenu({
                                resourceId: resource.id,
                                start: dayIndex,
                                end: dayIndex,
                              });
                            }}
                          />
                        ))}
                        {layout.bars.map((bar) => (
                          <CalendarEventBar
                            key={bar.event.id}
                            event={bar.event}
                            resource={resource}
                            left={bar.left}
                            width={bar.width}
                            top={bar.top}
                            clippedStart={bar.clippedStart}
                            clippedEnd={bar.clippedEnd}
                            compact={isMobile}
                            onOpen={() => openEvent(bar.event, resource)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
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
      </div>

      {/* ── Overlay ──────────────────────────────────────────────────── */}
      {/* "Đặt xe" dùng NGUYÊN luồng thuê xe của khách — không dựng form thứ hai. */}
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
      {/* "Tạo đơn thuê" ở đầu trang: chưa biết xe ⇒ mở ở bước chọn xe (cùng lối của màn Đơn thuê xe). */}
      {dialog?.kind === 'booking-pick' ? (
        <StaffBookingDialog
          open
          {...(filters.branchId ? { defaultBranchId: filters.branchId } : {})}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'booking-detail' ? (
        <BookingDetailDialog bookingId={dialog.bookingId} open onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'request-detail' ? (
        <CalendarRequestDialog
          requestId={dialog.requestId}
          decisions={decisions}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {decisions.dialogs}
      <VehicleBlockDialog
        state={dialog?.kind === 'block' ? dialog.state : null}
        onClose={() => setDialog(null)}
      />
      {dialog?.kind === 'block-detail' ? (
        <VehicleBlockDetailDialog
          blockId={dialog.blockId}
          open
          onClose={() => setDialog(null)}
          onEdit={(block: VehicleBlock) => {
            const resource = resources.find((r) => r.vehicleId === block.vehicleId);
            setDialog({
              kind: 'block',
              state: {
                mode: 'edit',
                block,
                ...(resource ? { vehicle: vehicleInfo(resource) } : {}),
              },
            });
          }}
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
 * Chỗ của các thẻ trên một hàng + chiều cao hàng.
 *
 * Thẻ chiếm TRỌN các ô từ ngày nhận tới ngày trả; giờ nhận/trả chỉ quyết mỗi đầu thẻ hở ra bao
 * nhiêu (`computeDaySnap`, ba mức - người dùng chốt 26/11/2026). Thẻ có SÀN bề rộng
 * (`EVENT_MIN_W`) để chip + số tiền còn đọc và bấm được; nới thì nới đều hai bên quanh giữa thẻ.
 * Vì nới bề rộng nên xếp tầng theo VỊ TRÍ PIXEL (`assignPixelLanes`): hai chuyến cùng một ngày
 * xếp hai tầng trong CÙNG ô. Hàng cao theo số tầng; khối thẻ căn giữa dọc như design.
 */
function layoutRow(
  events: readonly CalendarEvent[],
  range: CalendarRange,
  trackW: number,
  dayWidth: number,
  { cardH, rowMin }: { cardH: number; rowMin: number },
): RowLayout {
  // Mép bị cắt bởi khoảng xem: sát vạch. Còn lại: khít = lề thiết kế, hở ít / nhiều thêm một phần ô.
  const edgeInset = (gap: DayEdgeGap, clipped: boolean) =>
    clipped ? 0 : CARD_INSET + Math.round(dayWidth * EDGE_GAP_RATIO[gap]);
  const minW = Math.min(EVENT_MIN_W, trackW);
  const raw = events
    .map((event) => ({ event, snap: computeDaySnap(event, range) }))
    .filter((b): b is { event: CalendarEvent; snap: DaySnapPosition } => Boolean(b.snap))
    .map(({ event, snap }) => {
      const rawLeft = snap.startDay * dayWidth + edgeInset(snap.startGap, snap.clippedStart);
      const rawRight = (snap.endDay + 1) * dayWidth - edgeInset(snap.endGap, snap.clippedEnd);
      const width = Math.min(trackW, Math.max(rawRight - rawLeft, minW));
      const center = (rawLeft + rawRight) / 2;
      const grownLeft = rawRight - rawLeft < minW ? center - width / 2 : rawLeft;
      // Kẹp trong dải để thẻ đã nới không tràn ra ngoài hai mép của hàng.
      const left = Math.round(Math.max(0, Math.min(grownLeft, trackW - width)));
      return { event, position: snap, left, width };
    });
  const lanes = assignPixelLanes(raw);
  const laneCount = lanes.length ? Math.max(...lanes) + 1 : 1;
  const block = laneCount * cardH + (laneCount - 1) * LANE_GAP;
  const height = Math.max(rowMin, block + 2 * ROW_PAD);
  const offset = Math.round((height - block) / 2);

  return {
    height,
    bars: raw.map((bar, i) => ({
      event: bar.event,
      left: bar.left,
      width: bar.width,
      top: offset + (lanes[i] ?? 0) * (cardH + LANE_GAP),
      clippedStart: bar.position.clippedStart,
      clippedEnd: bar.position.clippedEnd,
    })),
  };
}

/**
 * Một ô ngày của một xe. Bấm (hoặc Enter/Space) mở bảng thao tác cho đúng ngày; nhấn giữ chuột
 * trái rồi kéo sang các ô khác cùng hàng để chọn NHIỀU ngày. Ô có giá riêng tô vàng nhạt; ô ngày
 * lễ đỏ rất nhạt — cả hai chỉ là ngữ cảnh, KHÔNG chặn thao tác nào.
 */
function DayCellButton({
  resource,
  day,
  holiday,
  price,
  selected,
  interactive,
  onPointerDown,
  onClick,
}: {
  resource: CalendarResource;
  day: DayCell;
  holiday: Holiday | undefined;
  price: { dailyPrice: string | null; hourlyPrice: string | null } | undefined;
  selected: boolean;
  interactive: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onClick: () => void;
}) {
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();
  const className = cx(
    styles.cell,
    holiday && styles.holidayColumn,
    price && styles.priceCell,
    selected && styles.cellSelected,
    interactive && styles.cellInteractive,
  );

  if (!interactive) {
    return (
      <div
        className={className}
        title={
          price?.dailyPrice
            ? t('cell.customPriceMarkerDaily', { price: fmt.money(price.dailyPrice) })
            : undefined
        }
      />
    );
  }

  // Ghi chú ngữ cảnh ghép bằng mã: hai ghi chú độc lập (có một, cả hai, hoặc không có).
  const notes = [
    price
      ? price.dailyPrice
        ? t('cell.customPriceMarkerDaily', { price: fmt.money(price.dailyPrice) })
        : t('cell.customPriceMarkerHourly')
      : null,
    holiday ? t('cell.holidayNote', { name: holiday.name }) : null,
  ].filter(Boolean);
  const label =
    t('cell.action', { vehicle: resource.name, date: fmt.dateKey(day.key) }) +
    notes.map((note) => `${LIST_SEPARATOR}${note}`).join('');

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-haspopup="menu"
      onPointerDown={onPointerDown}
      onClick={onClick}
    />
  );
}

/**
 * Cột xe (design `24186:88053`): ảnh · tên · biển số · giá ngày vàng; trạng thái vận hành khi đáng
 * chú ý. Rê (PC) / chạm (mobile) mở thẻ thông tin xe — cần nhất khi cột đang THU GỌN chỉ còn ảnh.
 */
function ResourceCell({
  resource,
  collapsed,
  priceInline,
}: {
  resource: CalendarResource;
  collapsed: boolean;
  priceInline: boolean;
}) {
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
  const statusLabel = statusMeta
    ? domainLabel('vehicleOperationStatus', resource.operationStatus, statusMeta.label)
    : null;

  const info = (
    <div className={styles.quickCard}>
      <div className={styles.quickHead}>
        <span className={styles.quickHeading}>{t('vehicleCard.heading')}</span>
        <QuickClose onClose={() => setInfoOpen(false)} />
      </div>
      <span className={styles.quickName}>{resource.name}</span>
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
        {statusLabel ? (
          <div className={styles.quickRow}>
            <dt>{t('vehicleCard.operationStatus')}</dt>
            <dd>{statusLabel}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );

  const meta = (
    <span className={styles.resourceMeta}>
      {resource.plateNumber ?? resource.code}
      {showStatus && statusLabel ? (
        <span className={styles.resourceStatus}>
          {LIST_SEPARATOR}
          {statusLabel}
        </span>
      ) : null}
    </span>
  );
  // Giá gọn "680k / ngày" - giá đầy đủ vẫn ở thẻ thông tin xe khi rê chuột.
  const price = resource.weekdayPrice
    ? t.rich('vehicleCard.priceRich', {
        price: fmt.moneyCompact(resource.weekdayPrice, { price: true }),
        b: (chunks) => <span className={styles.resourcePriceValue}>{chunks}</span>,
      })
    : null;

  return (
    <div className={cx(styles.resourceCell, collapsed && styles.resourceCellCollapsed)}>
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
              {priceInline ? (
                <span className={styles.resourceMetaRow}>
                  {meta}
                  {price ? (
                    <span className={styles.resourcePriceInline}>
                      <span className={styles.resourceSeparator} aria-hidden="true">
                        {LIST_SEPARATOR}
                      </span>
                      {price}
                    </span>
                  ) : null}
                </span>
              ) : (
                <>
                  {meta}
                  {price ? <span className={styles.resourcePrice}>{price}</span> : null}
                </>
              )}
            </span>
          )}
        </button>
      </Popover>
    </div>
  );
}
