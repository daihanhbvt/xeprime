import { type ComponentProps, useCallback, useTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { holidayRunAround, LIST_SEPARATOR, startOfAppDay } from '@xeprime/domain';
import { OCCUPANCY_SOURCE_TYPE, PERMISSION, VEHICLE_BLOCK_REASON } from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { Screen } from '@/components/layout/Screen';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { Callout } from '@/components/ui/Callout';
import { InlineAction } from '@/components/ui/InlineAction';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useCanCreateBooking } from '@/features/bookings/hooks/use-can-create-booking';
import { withBranchReturn } from '@/features/branches/branch-link';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTabBarAutoHide } from '@/hooks/use-tab-bar-auto-hide';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, iconSize, radius, space } from '@/theme/tokens';
import type { CalendarEvent, CalendarResource } from './api';
import { BulkDayBlockSheet, type BulkDayBlockState } from './components/BulkDayBlockSheet';
import { BulkDayPriceSheet, type BulkDayPriceState } from './components/BulkDayPriceSheet';
import { CalendarGridSkeleton, CalendarMonthSkeleton } from './components/CalendarGridSkeleton';
import { CalendarLegend } from './components/CalendarLegend';
import { CalendarMonthView } from './components/CalendarMonthView';
import { CalendarTimeline } from './components/CalendarTimeline';
import {
  CALENDAR_VIEW,
  CalendarDateControls,
  CalendarSearchBar,
  type CalendarView,
} from './components/CalendarToolbar';
import {
  CellActionsSheet,
  type CellActionKey,
  type CellActionTarget,
} from './components/CellActionsSheet';
import { DailyPriceSheet, type DailyPriceSheetState } from './components/DailyPriceSheet';
import { DayActionSheet, type DayActionKey, type DayPanelState } from './components/DayActionSheet';
import { MaintenanceEventSheet } from './components/MaintenanceEventSheet';
import { QuickBookingSheet, type QuickBookingTarget } from './components/QuickBookingSheet';
import { VehicleBlockDetailSheet } from './components/VehicleBlockDetailSheet';
import { VehicleBlockSheet, type VehicleBlockSheetState } from './components/VehicleBlockSheet';
import { VehicleInfoSheet } from './components/VehicleInfoSheet';
import { useBulkBlockDay, useBulkDayPreview, useReleaseBulkBlock } from './hooks/use-bulk-day';
import { useCalendarData } from './hooks/use-calendar-data';
import { useCalendarFilters } from './hooks/use-calendar-filters';
import { useBranchEmptyCopy } from '@/features/branches/components/BranchFilterField';
import { useScreenBranchFilter } from '@/features/branches/hooks/use-branch-filter';
import { useCalendarHolidays } from './hooks/use-calendar-holidays';
import { listDays, todayIsoDate, type DayCell } from './utils/calendar-date.util';
import { getErrorMessage } from '@/lib/get-error-message';

/** Giờ nhận xe mặc định khi tạo đơn từ ô lịch (giờ Việt Nam) — cùng con số web dùng. */
const DEFAULT_PICKUP_HOUR = 8;

const SEARCH_DEBOUNCE_MS = 300;

/** Overlay đang mở — đúng MỘT overlay một lúc, tất cả đi qua state này (y như web). */
type SheetState =
  | { kind: 'block'; state: NonNullable<VehicleBlockSheetState> }
  | { kind: 'block-detail'; blockId: string }
  | { kind: 'price'; state: DailyPriceSheetState }
  | { kind: 'maintenance'; vehicleId: string; vehicleName: string; recordId: string }
  | null;

/**
 * Lịch xe (CAL-01/02/03) — bản native của `/manage/calendar`.
 *
 * ## Một cách bày, đúng bộ web có
 *
 * Lưới resource timeline: cột xe ghim, dải ngày cuộn ngang, hàng "Xe còn trống" ghim đáy.
 *
 * Từng có thêm chế độ "một xe" bày theo chiều dọc cho màn 360dp, và nó đã bị gỡ: web không có, và
 * một cách bày chỉ tồn tại ở app là một bề mặt nữa phải giữ đồng bộ về thao tác, quyền và thông
 * điệp — với đúng một lợi ích là đỡ phải cuộn ngang.
 *
 * ## Không có kéo-thả
 *
 * Web đã bỏ kéo-thả có chủ đích (`CalendarScheduler` docblock: đổi giờ đi qua form sửa
 * đơn/khoá/bảo dưỡng, có xác nhận, và backend quyết theo ADR 0006). App bám đúng quyết định đó —
 * xem `CalendarTimeline`.
 */
/**
 * VỎ điều hướng bao quanh lưới — KHÔNG đổi gì bên trong nó.
 *
 * `manage`  — thanh trên của cổng quản lý (nút mở drawer, bộ chọn chi nhánh): `/manage/calendar`.
 * `account` — thanh trên có nút LUI, dùng cho `/account/calendar` của chủ xe. Web giải đúng bài
 *              này bằng cùng một cách: `account/calendar/page.tsx` import thẳng `CalendarScheduler`
 *              và chỉ đổi khung quanh nó, không fork lịch.
 */
export type CalendarShell = 'manage' | 'account';

export function CalendarScreen({ shell = 'manage' }: { shell?: CalendarShell } = {}) {
  const colors = useColors();
  const t = useTranslations('Calendar');
  const tAccount = useTranslations('Account.calendar');
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();
  const router = useRouter();
  const { has, isLoading: permissionsLoading } = usePermissions();

  /** `?q=` là lối "Xem lịch" của một xe — cùng tham số web đặt trên URL (`vehicleSchedulePath`). */
  const params = useLocalSearchParams<{
    q?: string;
    from?: string;
    days?: string;
    back?: string;
  }>();
  const { filters: screenFilters, setFilters, filtered, reset } = useCalendarFilters(params);
  /*
   * Ô "Chi nhánh" của lịch (ADR 0052) sống trên tham số route, còn các chiều khác ở state của màn.
   * Ghép lại thành MỘT bộ lọc: lưới, xem trước cả ngày và hai tấm thao tác hàng loạt đọc CÙNG nó
   * (điều 8) — sót chi nhánh ở thao tác ghi là khoá xe của chi nhánh người dùng không mở ra xem.
   */
  const { branchId, filter: branchFilter } = useScreenBranchFilter();
  const branchEmpty = useBranchEmptyCopy(branchFilter, branchId);
  /** Cách bày (Figma "Chế độ xem"): lưới Danh sách hay Lịch tháng - trạng thái của màn, không lên URL. */
  const [view, setView] = useState<CalendarView>(CALENDAR_VIEW.LIST);
  /*
   * Danh sách luôn xem TRỌN MỘT THÁNG lịch tính từ ngày đang chọn (24/11 → 23/12), người dùng
   * chốt 28/11/2026 - không còn ô "Khoảng xem". Số ngày suy ở đây nên lưới, nhãn và mọi API đọc
   * cùng một con số (28-31, dưới trần 62 ngày của backend).
   */
  const filters = useMemo(() => {
    const base = { ...screenFilters, branchId: branchId ?? null };
    // Cả HAI chế độ xem cùng một khoảng (Lịch tháng chỉ là cách bày khác - người dùng 28/11/2026).
    const start = startOfAppDay(screenFilters.from);
    return { ...base, days: start.add(1, 'month').diff(start, 'day') };
  }, [screenFilters, branchId]);

  const [search, setSearch] = useState(filters.q ?? '');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  useEffect(() => {
    const next = debouncedSearch.trim();
    setFilters({ q: next || null });
  }, [debouncedSearch, setFilters]);

  /**
   * Tham số route → bộ lọc, **mỗi lần chúng ĐỔI**, không chỉ lúc mount.
   *
   * Lịch là một TAB, và tab được giữ sống sau lần mở đầu tiên (`app/manage/(tabs)/_layout.tsx`:
   * "đổi mục là THAY màn và giữ nguyên state của mục cũ"). Nên bộ khởi tạo của `useCalendarFilters`
   * chỉ chạy đúng một lần trong cả phiên: bấm "Xem lịch" ở xe A rồi quay ra bấm "Xem lịch" ở xe B
   * sẽ hiện lại lịch ĐÃ LỌC theo xe A — im lặng, và chỉ lộ ra ở lần bấm thứ hai.
   *
   * Cùng cách `ReceiptListScreen` giải: so bằng CHỮ KÝ chứ không bằng object, vì
   * `useLocalSearchParams` trả object mới mỗi render và đưa thẳng vào deps là một vòng lặp vô tận.
   * Chữ ký khởi tạo bằng chính chữ ký hiện tại — lần mount đầu đã đọc xong tham số rồi.
   */
  const routeSignature = [params.q, params.from, params.days].join('|');
  const appliedSignature = useRef<string | null>(routeSignature);

  /*
   * Rời màn thì QUÊN chữ ký đã áp.
   *
   * Không có bước này, một chuỗi rất đời thường vẫn hỏng: mở lịch của xe A → xoá ô tìm kiếm để
   * ngó cả đội → quay ra bấm "Xem lịch" của CHÍNH xe A. Chữ ký không đổi nên bộ lọc không áp
   * lại, và người dùng nhận cả đội xe thay vì chiếc họ vừa bấm.
   *
   * Đặt trong CLEANUP của `useFocusEffect`, không phải trong thân render: ghi một ref giữa lượt
   * render là thứ `react-hooks/refs` chặn, và đúng ra thì đây là một tác dụng phụ của việc RỜI
   * màn chứ không phải một giá trị dẫn xuất.
   */
  useFocusEffect(
    useCallback(() => {
      return () => {
        appliedSignature.current = null;
      };
    }, []),
  );

  useEffect(() => {
    if (appliedSignature.current === routeSignature) return;
    appliedSignature.current = routeSignature;

    const nextQ = params.q?.trim() ?? '';
    // Ô tìm kiếm phải đi theo: để lại chữ cũ thì người dùng đọc một đằng, lưới lọc một nẻo.
    setSearch(nextQ);
    setFilters({
      q: nextQ || null,
      ...(params.from ? { from: params.from } : { from: null }),
      ...(params.days ? { days: Number(params.days) } : { days: null }),
    });
  }, [routeSignature, params.q, params.from, params.days, setFilters]);

  const canView = has(PERMISSION.CALENDAR_VIEW);
  // Lập đơn tay: quyền + tuyến gói. Chủ xe cá nhân chỉ còn "Khoá lịch" cho chuyến ngoài chợ.
  const canCreate = useCanCreateBooking();
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
  /** Thao tác cả-đội-xe dùng ĐÚNG quyền của thao tác lẻ tương ứng — làm hàng loạt không mở thêm quyền. */
  const dayActions = useMemo<DayActionKey[]>(
    () => [...(canBlock ? (['block'] as const) : []), ...(canPrice ? (['price'] as const) : [])],
    [canBlock, canPrice],
  );

  /**
   * Lưới đi SAU thanh công cụ một nhịp, có chủ đích.
   *
   * Đổi khoảng ngày là một lượt dựng nặng: `days` và `dayWidth` đi vào `renderItem` của lưới,
   * nên cả cửa sổ hàng đang giữ phải dựng lại. Nếu thanh công cụ và lưới cùng nằm trong MỘT lượt
   * commit thì nhãn ngày cũng phải chờ lượt dựng đó xong — và người dùng bấm "tiến 14 ngày" rồi
   * nhìn con số đứng yên vài giây, tưởng app đang chờ API.
   *
   * `useDeferredValue` tách hai việc: nhãn ngày, mũi tên, nút Hôm nay đọc `filters` và đổi ngay
   * trong lượt commit gấp; lưới đọc bản hoãn và được dựng ở lượt sau, mức ưu tiên thấp, không
   * chặn khung hình. Trong khoảng giữa hai lượt, lưới còn hiện khoảng CŨ — đó là đánh đổi đúng:
   * một lưới trễ nửa giây đọc ra là "đang tải", còn một nút bấm không phản hồi đọc ra là "hỏng".
   *
   * Chỉ LƯỚI đọc bản hoãn. Mọi thao tác ghi (khoá xe, đặt giá, xem trước cả ngày) vẫn đọc
   * `filters` thật — chúng xảy ra sau khi người dùng đã dừng tay, lúc hai giá trị đã bằng nhau.
   */
  const gridFilters = useDeferredValue(filters);

  const monthView = view === CALENDAR_VIEW.MONTH;

  /**
   * Lịch tháng hỏi ĐÚNG các API của lưới, chỉ đổi khoảng: trọn các tuần (bắt đầu thứ Hai) phủ tháng
   * chứa `from` - tối đa 42 ngày, dưới trần 62 ngày của backend. Cùng bộ lọc (chi nhánh, loại xe,
   * từ khoá), nên con số "x/N xe kín" khớp đúng tập xe của lưới.
   */
  /*
   * Lịch tháng bày ĐÚNG khoảng của Danh sách (28/11 → 27/12): lưới là trọn các tuần (bắt đầu thứ
   * Hai) phủ khoảng đó, ngày ngoài khoảng làm mờ. Tối đa 6 tuần = 42 ngày, dưới trần 62 của backend.
   */
  const monthFilters = useMemo(() => {
    const start = startOfAppDay(gridFilters.from);
    const lead = (start.day() + 6) % 7;
    const gridStart = start.subtract(lead, 'day');
    const weeks = Math.ceil((lead + gridFilters.days) / 7);
    return { ...gridFilters, from: gridStart.format('YYYY-MM-DD'), days: weeks * 7 };
  }, [gridFilters]);
  const rangeFromKey = gridFilters.from;
  const rangeToKey = startOfAppDay(gridFilters.from)
    .add(gridFilters.days - 1, 'day')
    .format('YYYY-MM-DD');
  const data = useCalendarData(monthView ? monthFilters : gridFilters, canView);

  /**
   * Lưới đang bày một khoảng KHÁC với khoảng thanh công cụ đang nói.
   *
   * Đây là mặt trái của `useDeferredValue`, và nó không chỉ là chuyện thẩm mỹ: trong lúc lệch,
   * các cột ngày trên lưới vẫn là ngày CŨ, nên một cú chạm vào ô sẽ mở form khoá xe/đặt giá cho
   * đúng cái ngày người dùng vừa rời đi. Vì vậy lớp phủ dưới đây vừa báo "đang tải" vừa CHẶN
   * chạm — không phải để trang trí.
   */
  const gridStale = filters !== gridFilters;
  const holidaysByDay = useCalendarHolidays(data.range, canView);
  const days = useMemo(() => listDays(data.range), [data.range]);
  const resources = useMemo(() => data.resources ?? [], [data.resources]);

  const [collapsed, setCollapsed] = useState(false);
  /** Vùng nội dung dưới thanh trang (đo) - lưới suy kích thước từ đây. */
  const [area, setArea] = useState({ width: 0, height: 0 });

  /*
   * Khối đầu trang (ô tìm + Lọc, chú giải, thanh ngày) thu lên khi cuộn XUỐNG, ló ra khi cuộn LÊN -
   * cùng luật `useCollapseOnScroll` của các màn danh sách (Đơn thuê…): cộng dồn quãng cuộn, kẹp
   * [0,1], trượt bằng `translateY` trên luồng UI. Lưới cuộn dọc bằng `useScrollViewOffset` nên ở
   * đây nhận Y qua một worklet thay vì một scroll handler thứ hai trên cùng danh sách.
   */
  const [headHeight, setHeadHeight] = useState(0);
  const headHeightSv = useSharedValue(0);
  const headProgress = useSharedValue(1);
  const lastScrollY = useSharedValue(0);
  const autoHideTabBar = useTabBarAutoHide();
  const onVerticalScroll = useCallback(
    (y: number) => {
      'worklet';
      autoHideTabBar?.(y);
      const delta = y - lastScrollY.value;
      lastScrollY.value = y;
      if (y <= 0) {
        headProgress.value = 1;
        return;
      }
      const h = headHeightSv.value;
      if (h <= 0) return;
      headProgress.value = Math.min(Math.max(headProgress.value - delta / h, 0), 1);
    },
    // Shared value ổn định theo hợp đồng Reanimated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autoHideTabBar],
  );
  const onMonthScroll = useAnimatedScrollHandler({
    onScroll: (event) => onVerticalScroll(event.contentOffset.y),
  });
  const measureHead = useCallback(
    (event: LayoutChangeEvent) => {
      const next = event.nativeEvent.layout.height;
      headHeightSv.value = next;
      setHeadHeight(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  /* Đổi cách bày là đổi vùng cuộn: hiện lại khối đầu trang, quên mốc cuộn của vùng cũ. */
  useEffect(() => {
    headProgress.value = 1;
    lastScrollY.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const [sheet, setSheet] = useState<SheetState>(null);
  const [quickBooking, setQuickBooking] = useState<QuickBookingTarget | null>(null);
  /** Ngày đang chọn của Lịch tháng; ngoài tháng đang xem ⇒ về hôm nay (nếu trong tháng) hoặc mùng 1. */
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [cellTarget, setCellTarget] = useState<CellActionTarget | null>(null);
  const [infoResource, setInfoResource] = useState<CalendarResource | null>(null);
  const [dayPanel, setDayPanel] = useState<DayPanelState | null>(null);
  const [bulkBlock, setBulkBlock] = useState<BulkDayBlockState | null>(null);
  const [bulkPrice, setBulkPrice] = useState<BulkDayPriceState | null>(null);

  /*
   * Trạng thái công tắc "đã khoá cả ngày chưa" — chỉ hỏi khi bảng đang mở, vì nó là một query
   * thật và 14 cột ngày không được phép sinh ra 14 request lúc lưới vừa render.
   */
  const panelDate = dayPanel?.day.key ?? '';
  const panelPreview = useBulkDayPreview(filters, panelDate, panelDate, dayPanel !== null);
  const releaseBatch = useReleaseBulkBlock();
  const quickBlock = useBulkBlockDay();

  /** Cụm ngày lễ liền kề chứa ngày đang mở — khoảng gợi ý cho chế độ nhiều ngày. */
  const suggestedRange = useMemo(
    () => (panelDate ? holidayRunAround(holidaysByDay, panelDate) : { from: '', to: '' }),
    [holidaysByDay, panelDate],
  );

  /**
   * Khoá NGAY mọi xe rảnh trong đúng ngày này — thao tác một-chạm của công tắc.
   *
   * Chỉ gửi những xe đang RẢNH: xe có đơn thì `EXCLUDE USING gist` từ chối (ADR 0006), và một
   * lệnh gồm cả chúng sẽ hỏng trọn lô. Thông báo nói ra con số THẬT ("đã khoá 32 xe") chứ không
   * phải "đã khoá toàn bộ" — người trực cần biết còn 8 chiếc vẫn nhận đơn được.
   */
  const runQuickBlock = useCallback(
    (dateKey: string) => {
      const free = (panelPreview.data?.vehicles ?? []).filter((v) => v.busyDates.length === 0);
      if (free.length === 0) {
        toast.showInfo(t('dayPanel.quickBlockNothing'));
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
            toast.showSuccess(
              skipped > 0
                ? t('dayPanel.quickBlockedPartial', {
                    count: result.fullyBlockedVehicles,
                    skipped,
                  })
                : t('dayPanel.quickBlocked', { count: result.fullyBlockedVehicles }),
            );
          },
          onError: (error) => toast.showError(getErrorMessage(error)),
        },
      );
    },
    [panelPreview.data, quickBlock, t, toast],
  );

  /** Ngày đang chọn của Lịch tháng - mặc định hôm nay nếu nó thuộc tháng đang xem, không thì mùng 1. */
  const selectedDayKey = useMemo(() => {
    const inMonth = (key: string | null) =>
      key !== null && key >= rangeFromKey && key <= rangeToKey && days.some((day) => day.key === key);
    if (inMonth(pickedDay)) return pickedDay as string;
    // Ngày đang xem của Danh sách - đổi chế độ không làm mất ngày người dùng đang đứng.
    if (inMonth(filters.from)) return filters.from;
    const today = todayIsoDate();
    if (inMonth(today)) return today;
    return rangeFromKey;
  }, [days, rangeFromKey, rangeToKey, pickedDay, filters.from]);

  /**
   * "Tạo đơn" cho một xe trống của Lịch tháng: cùng đường với "Đặt xe" của ô lưới - nhận 8h ngày
   * đó, trả 8h sáng hôm sau (một ngày thuê, web `DEFAULT_PICKUP_HOUR`).
   */
  const createForDay = useCallback(
    (resource: CalendarResource, dayKey: string) => {
      const pickupAt = startOfAppDay(dayKey).hour(DEFAULT_PICKUP_HOUR).minute(0).second(0).millisecond(0);
      navigateOnce(
        ROUTES.manage.bookingCreate({
          vehicleId: resource.vehicleId,
          vehicleName: resource.name,
          ...(resource.mainImageUrl ? { vehicleImageUrl: resource.mainImageUrl } : {}),
          pickupAt: pickupAt.toISOString(),
          returnAt: pickupAt.add(1, 'day').toISOString(),
        }),
      );
    },
    [navigateOnce],
  );

  /** Chạm ô TRỐNG → mở bộ chọn hành động. Không thao tác nào chạy thẳng từ một cú chạm ô. */
  const openCellMenu = useCallback((resource: CalendarResource, day: DayCell) => {
    setCellTarget({
      vehicleId: resource.vehicleId,
      vehicleName: resource.plateNumber
        ? `${resource.name}${LIST_SEPARATOR}${resource.plateNumber}`
        : resource.name,
      date: day.key,
    });
  }, []);

  const runCellAction = useCallback(
    (action: CellActionKey, endDate: string) => {
      const target = cellTarget;
      setCellTarget(null);
      if (!target) return;
      const resource = resources.find((r) => r.vehicleId === target.vehicleId);

      if (action === 'booking') {
        /*
         * `.toISOString()` ở đây ĐÚNG và cố ý: `dayjs.tz(dateKey, APP_TIME_ZONE)` đã dựng một mốc
         * TUYỆT ĐỐI từ ngày lịch của ô vừa chạm, không phải một mặt đồng hồ người dùng chọn — nên
         * nó không đi qua `appWallClockToIso`.
         */
        const pickupAt = startOfAppDay(target.date)
          .hour(DEFAULT_PICKUP_HOUR)
          .minute(0)
          .second(0)
          .millisecond(0);
        // N ngày đã chọn = N ngày thuê: nhận 8h ngày đầu, trả 8h sáng hôm sau ngày cuối (web).
        const returnAt = startOfAppDay(endDate)
          .add(1, 'day')
          .hour(DEFAULT_PICKUP_HOUR)
          .minute(0)
          .second(0)
          .millisecond(0);
        navigateOnce(
          ROUTES.manage.bookingCreate({
            vehicleId: target.vehicleId,
            // Tên đi CÙNG id: ô lịch đã biết nó, và màn đích không phải chắc chắn hỏi lại được.
            vehicleName: resource?.name ?? target.vehicleName,
            // Ảnh xe như web `StaffBookingDialog vehicleImageUrl` — xe nội bộ không có tin đăng.
            ...(resource?.mainImageUrl ? { vehicleImageUrl: resource.mainImageUrl } : {}),
            pickupAt: pickupAt.toISOString(),
            returnAt: returnAt.toISOString(),
          }),
        );
        return;
      }

      if (action === 'block') {
        setSheet({
          kind: 'block',
          state: {
            mode: 'create',
            vehicleId: target.vehicleId,
            vehicleName: target.vehicleName,
            vehicleTitle: resource?.name ?? null,
            vehiclePlate: resource?.plateNumber ?? null,
            vehicleImageUrl: resource?.mainImageUrl ?? null,
            date: target.date,
            endDate,
          },
        });
        return;
      }

      setSheet({
        kind: 'price',
        state: {
          vehicleId: target.vehicleId,
          vehicleName: target.vehicleName,
          vehicleTitle: resource?.name ?? null,
          vehiclePlate: resource?.plateNumber ?? null,
          vehicleImageUrl: resource?.mainImageUrl ?? null,
          weekdayPrice: resource?.weekdayPrice ?? null,
          hourlyPrice: resource?.hourlyPrice ?? null,
          date: target.date,
          endDate,
        },
      });
    },
    [cellTarget, navigateOnce, resources],
  );

  /**
   * Chạm thẻ event → đúng loại.
   *
   * - ĐƠN: tấm "Chi tiết nhanh đơn" (Figma `24729:79063`, người dùng chốt 27/11/2026) - bản chạm của
   *   thẻ xem nhanh mà web mở bằng hover (`CalendarEventBar` `EventQuickCard`); nút "Chi tiết đơn"
   *   trong tấm đi tiếp vào màn chi tiết.
   * - YÊU CẦU: thẳng vào màn duyệt (web `CalendarRequestDialog`, 25/11/2026).
   * - Khoá xe / bảo dưỡng: tấm chi tiết của chính chúng.
   */
  const openEvent = useCallback(
    (event: CalendarEvent, resource: CalendarResource) => {
      if (!event.sourceId) return;
      if (event.type === OCCUPANCY_SOURCE_TYPE.BOOKING) {
        // Đơn: tấm "Chi tiết nhanh đơn" (Figma `24729:79063`, người dùng chốt 27/11/2026).
        setQuickBooking({ event, resource });
      } else if (event.type === OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST) {
        // Yêu cầu (chờ duyệt / đang giữ chỗ) — mở thẳng chi tiết yêu cầu, nơi duyệt / từ chối /
        // huỷ được (web `CalendarRequestDialog`, 25/11/2026).
        navigateOnce(ROUTES.manage.requestDetail(event.sourceId));
      } else if (event.type === OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE) {
        setSheet({ kind: 'block-detail', blockId: event.sourceId });
      } else if (event.type === OCCUPANCY_SOURCE_TYPE.MAINTENANCE) {
        setSheet({
          kind: 'maintenance',
          vehicleId: resource.vehicleId,
          vehicleName: resource.plateNumber
            ? `${resource.name}${LIST_SEPARATOR}${resource.plateNumber}`
            : resource.name,
          recordId: event.sourceId,
        });
      }
    },
    [navigateOnce],
  );

  /*
   * Web `CalendarScheduler`: không có quyền thao tác ngày thì đầu ngày LỄ vẫn bấm được để xem tên
   * lễ; ngày thường khi đó không mở gì.
   */
  const onDayPress = useMemo(
    () =>
      dayActions.length > 0 || holidaysByDay.size > 0
        ? (day: DayCell) => {
            const holiday = holidaysByDay.get(day.key);
            if (dayActions.length === 0 && !holiday) return;
            setDayPanel({ day, holiday });
          }
        : null,
    [dayActions.length, holidaysByDay],
  );
  const onCellPress = cellActions.length > 0 ? openCellMenu : null;

  /**
   * Thanh trang v2 (Figma "Header MB" `24729:83783`, người dùng chốt 27/11/2026 - như "Đơn thuê xe"):
   * ← · "Lịch thuê xe" · viên số xe · nút "+" vàng (Tạo đơn thuê, cùng cổng `useCanCreateBooking`).
   * ← chỉ khi CÓ chỗ để về: vào từ hồ sơ xe (`?back=1`, web cùng tham số) hoặc vỏ `account` của chủ
   * xe. Ô tìm + "Lọc" và chú giải nằm TRONG thanh như Figma.
   *
   * Dựng MỘT LẦN rồi dùng lại ở cả hai nhánh trả về (thiếu quyền · lưới).
   */
  const onBack =
    params.back === '1'
      ? () =>
          goBackOr(router, shell === 'account' ? ROUTES.account.vehicles() : ROUTES.manage.vehicles())
      : shell === 'account'
        ? () => goBackOr(router, ROUTES.account.home())
        : undefined;
  const header = (
    <ManagePageHeader
      title={shell === 'account' ? tAccount('title') : t('page.title')}
      {...(canView && data.resources ? { titleBadge: t('page.vehicleCount', { count: resources.length }) } : {})}
      onBack={onBack}
      actions={
        canCreate ? (
          <IconSquareButton
            label={t('page.createApp')}
            tone="brand"
            onPress={() => navigateOnce(withBranchReturn(ROUTES.manage.bookingCreate(), branchId))}
          >
            <LineIcon name="plus" size={iconSize.lg} color={colors.onPrimary} />
          </IconSquareButton>
        ) : undefined
      }
    />
  );

  const hasGrid = !data.isLoading && resources.length > 0 && !(data.error && !data.resources);
  /* Chỉ thu khi có lưới để cuộn - trạng thái tải/rỗng/lỗi không có sự kiện cuộn nào gọi nó lại. */
  const headStyle = useAnimatedStyle(() => {
    const shown = hasGrid ? headProgress.value : 1;
    return {
      transform: [{ translateY: -headHeightSv.value * (1 - shown) }],
      pointerEvents: shown > 0.01 ? ('box-none' as const) : ('none' as const),
    };
  }, [hasGrid]);
  /* Mép đáy `space.xs` như trước: hàng cuối không sát thanh điều hướng. */
  const gridHeight = Math.max(0, area.height - space.xs);
  const gridViewport = useMemo(() => ({ width: area.width, height: gridHeight }), [area.width, gridHeight]);
  /* Phần khối đầu trang đang hiện - hàng ngày của lưới trượt theo con số này (luồng UI). */
  const headOffset = useDerivedValue(
    () => headHeightSv.value * (hasGrid ? headProgress.value : 1),
    [hasGrid],
  );

  /*
   * Hàm/đối tượng truyền xuống các tấm trượt và lưới phải ỔN ĐỊNH: mọi tấm đều `memo`, nên một hàm
   * viết thẳng trong JSX làm chúng dựng lại theo từng lần gõ ô tìm / refetch nền.
   */
  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), []);
  /*
   * Đổi chế độ xem (Danh sách ↔ Lịch tháng) là một lượt dựng NẶNG. Chạy nó cùng lượt với việc đóng
   * tấm Bộ lọc thì tấm đứng hình (người dùng 28/11/2026: "bấm Lưu bị đơ"). Nên: để tấm đóng trước
   * (`setTimeout` 0 - lượt render sau), rồi đổi chế độ trong `startTransition` (ưu tiên thấp, không
   * chặn khung hình); `viewPending` hiện viên "Đang tải lịch" trong lúc đó.
   */
  const [viewPending, startViewTransition] = useTransition();
  const changeView = useCallback((next: CalendarView) => {
    setTimeout(() => startViewTransition(() => setView(next)), 0);
  }, []);
  /*
   * Kéo-để-tải-lại: vòng quay chỉ theo lượt NGƯỜI DÙNG kéo (state riêng), không theo refetch nền -
   * không thì mỗi lần khoá xe / đặt giá xong là vòng quay tự hiện.
   */
  const [pulling, setPulling] = useState(false);
  const dataRefetch = data.refetch;
  const pullRefresh = useCallback(() => {
    setPulling(true);
    void dataRefetch().finally(() => setPulling(false));
  }, [dataRefetch]);
  const closeQuickBooking = useCallback(() => setQuickBooking(null), []);
  const openBookingDetail = useCallback(
    (bookingId: string) => {
      setQuickBooking(null);
      navigateOnce(ROUTES.manage.bookingDetail(bookingId));
    },
    [navigateOnce],
  );
  const closeCellMenu = useCallback(() => setCellTarget(null), []);
  const closeInfo = useCallback(() => setInfoResource(null), []);
  const openVehicle = useCallback(
    (vehicleId: string) => {
      setInfoResource(null);
      navigateOnce(ROUTES.manage.vehicleDetail(vehicleId));
    },
    [navigateOnce],
  );
  const dayBlockState = useMemo(
    () => ({
      batchId: panelPreview.data?.activeBlockBatchId ?? null,
      loading: panelPreview.isPending,
      busy: quickBlock.isPending || releaseBatch.isPending,
    }),
    [panelPreview.data?.activeBlockBatchId, panelPreview.isPending, quickBlock.isPending, releaseBatch.isPending],
  );
  const closeDayPanel = useCallback(() => setDayPanel(null), []);
  const releaseMutate = releaseBatch.mutate;
  const releaseDayBlock = useCallback(
    (batchId: string) =>
      releaseMutate(
        { batchId, branchId: filters.branchId },
        {
          onSuccess: () => toast.showSuccess(t('bulkBlock.released')),
          onError: (error) => toast.showError(errorMessage(error)),
        },
      ),
    [releaseMutate, filters.branchId, toast, t, errorMessage],
  );
  const openBulkBlock = useCallback(() => {
    if (dayPanel) setBulkBlock({ date: dayPanel.day.key, suggestedRange });
    setDayPanel(null);
  }, [dayPanel, suggestedRange]);
  const openBulkPrice = useCallback(() => {
    if (dayPanel) setBulkPrice({ date: dayPanel.day.key, suggestedRange });
    setDayPanel(null);
  }, [dayPanel, suggestedRange]);
  const closeBulkBlock = useCallback(() => setBulkBlock(null), []);
  const closeBulkPrice = useCallback(() => setBulkPrice(null), []);
  const closeSheet = useCallback(() => setSheet(null), []);
  const editBlock = useCallback(
    (block: Parameters<ComponentProps<typeof VehicleBlockDetailSheet>['onEdit']>[0]) =>
      setSheet({ kind: 'block', state: { mode: 'edit', block } }),
    [],
  );
  const openMaintenanceProfile = useCallback(
    (vehicleId: string) => {
      setSheet(null);
      navigateOnce(ROUTES.manage.vehicleEditTab(vehicleId, VEHICLE_EDIT_TAB.MAINTENANCE));
    },
    [navigateOnce],
  );
  const blockSheetState = sheet?.kind === 'block' ? sheet.state : null;
  const priceSheetState = sheet?.kind === 'price' ? sheet.state : null;

  // Thiếu quyền là 403 của CHÍNH màn này — không gọi API rồi mới nhận lỗi.
  if (!permissionsLoading && !canView) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('states.forbiddenTitle')}
            description={t('states.forbiddenDescription')}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      {header}
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        <View
          style={styles.area}
          onLayout={(e) =>
            setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
          }
        >
          {data.isLoading ? (
            <View style={[styles.fill, { paddingTop: headHeight }]}>
              {monthView ? <CalendarMonthSkeleton /> : <CalendarGridSkeleton />}
            </View>
          ) : data.error && !data.resources ? (
            <View style={[styles.fill, { paddingTop: headHeight }]}>
              <ScreenError
                messageFrom="backend"
                error={data.error}
                title={t('states.loadFailed')}
                onRetry={data.refetch}
              />
            </View>
          ) : resources.length === 0 ? (
            <View style={[styles.fill, { paddingTop: headHeight }]}>
              {branchEmpty && !filtered ? (
                <ScreenMessage
                  icon="location-outline"
                  title={branchEmpty.title}
                  description={branchEmpty.hint}
                />
              ) : (
                <ScreenMessage
                  icon={filtered ? 'search-outline' : 'car-outline'}
                  title={t(filtered ? 'states.noMatchTitle' : 'states.noVehiclesTitle')}
                  description={t(
                    filtered ? 'states.noMatchDescription' : 'states.noVehiclesDescription',
                  )}
                  {...(filtered
                    ? {
                        actionLabel: tCommon('clear'),
                        onAction: () => {
                          setSearch('');
                          reset();
                        },
                      }
                    : {})}
                />
              )}
            </View>
          ) : monthView ? (
            <View
              style={styles.fill}
              pointerEvents={gridStale ? 'none' : 'auto'}
              accessibilityState={{ busy: gridStale || data.isFetching }}
            >
              <CalendarMonthView
                days={days}
                rangeFrom={rangeFromKey}
                rangeTo={rangeToKey}
                resources={resources}
                eventsByResource={data.eventsByResource}
                priceMarkers={data.priceMarkers}
                holidaysByDay={holidaysByDay}
                selectedKey={selectedDayKey}
                onSelectDay={setPickedDay}
                onEventPress={openEvent}
                onCreate={canCreate ? createForDay : null}
                onDayActions={onDayPress && dayActions.length > 0 ? onDayPress : null}
                onScroll={onMonthScroll}
                topInset={headHeight}
                refreshing={pulling}
                onRefresh={pullRefresh}
              />
              {gridStale || viewPending ? <GridBusyOverlay /> : null}
            </View>
          ) : (
            /*
              Vùng LƯỚI: nằm ngay dưới khối đầu trang và trượt lên CÙNG nó; cao bằng cả vùng nội
              dung nên khi khối thu hết, lưới phủ kín màn. Lúc khối còn hiện, đáy lưới tràn qua mép
              dưới đúng `headHeight` - danh sách hàng đệm đáy cùng con số để hàng cuối vẫn cuộn tới.
            */
            <View
              accessible={false}
              accessibilityLabel={t('grid.ariaLabel')}
              accessibilityState={{ busy: gridStale || data.isFetching }}
              style={[styles.gridSlide, { height: gridHeight }]}
            >
              {/* MỜ khi đang tải (web `.refetching`); CHẶN chạm chỉ khi lưới lệch khoảng. */}
              <View
                style={{ flex: 1, opacity: gridStale || data.isFetching ? 0.75 : 1 }}
                pointerEvents={gridStale ? 'none' : 'auto'}
              >
                {area.width > 0 && gridHeight > 0 ? (
                  <CalendarTimeline
                    resources={resources}
                    eventsByResource={data.eventsByResource}
                    priceMarkers={data.priceMarkers}
                    holidaysByDay={holidaysByDay}
                    days={days}
                    range={data.range}
                    viewport={gridViewport}
                    collapsed={collapsed}
                    onToggleCollapsed={toggleCollapsed}
                    refreshing={pulling}
                    onRefresh={pullRefresh}
                    onVerticalScroll={onVerticalScroll}
                    headInset={headHeight}
                    headOffset={headOffset}
                    onCellPress={onCellPress}
                    onEventPress={openEvent}
                    onResourcePress={setInfoResource}
                    onDayPress={onDayPress}
                  />
                ) : null}
              </View>
              {gridStale || viewPending ? <GridBusyOverlay /> : null}
            </View>
          )}

          {/*
            Khối đầu trang - nằm ĐÈ, thu bằng `translateY` âm; `overflow: hidden` của vùng ngoài cắt
            nó khi trượt lên (không thì nó vẽ đè lên thanh trang).
          */}
          {/*
            Hiện CẢ lúc quyền đang tải: ẩn đi rồi mới hiện làm khung chờ đổi hình hai lần (lần đầu
            lưới trống từ đỉnh, lần sau mới có khối tìm/chú giải/ngày ở trên) - người dùng 28/11/2026.
          */}
          {canView || permissionsLoading ? (
            <Animated.View
              style={[styles.head, { backgroundColor: colors.background }, headStyle]}
              onLayout={measureHead}
            >
              <YStack gap={12} px={16} pb={12} bg={colors.surface}>
                <CalendarSearchBar
                  filters={filters}
                  setFilters={setFilters}
                  searchValue={search}
                  onSearchChange={setSearch}
                  view={view}
                  onViewChange={changeView}
                  branchFilter={branchFilter}
                  branchId={branchId}
                />
                <CalendarLegend />
              </YStack>
              <YStack px={layout.screenX} pt={16} pb={monthView ? 16 : 0}>
                <CalendarDateControls filters={filters} setFilters={setFilters} view={view} />
              </YStack>
              {hasGrid && data.error ? (
                // Lỗi khi ĐÃ CÓ lưới: nói ngay trên lưới - refetch hỏng không được im lặng.
                <YStack px={layout.screenX} pt={space.xs}>
                  <Callout tone="danger" title={t('states.loadFailed')}>
                    {getErrorMessage(data.error)}
                  </Callout>
                  <InlineAction label={t('states.retry')} onPress={data.refetch} />
                </YStack>
              ) : null}
              {hasGrid && !monthView && !data.hasAnyEvent ? (
                // Khoảng đang xem chưa có lịch nào: nói NHỎ một dòng - lưới vẫn hiện và chạm được.
                <Text
                  px={layout.screenX}
                  pt={space.xs}
                  col={colors.textMuted}
                  fos={fontSize.bodySm}
                  accessibilityRole="text"
                >
                  {t(onCellPress ? 'states.noEventsInRangeActionable' : 'states.noEventsInRange')}
                </Text>
              ) : null}
              {/* Figma: lưới cách hàng ngày 16 (Option 2 `24729:82215`). */}
              {!monthView ? <View style={styles.gridGap} /> : null}
            </Animated.View>
          ) : null}
        </View>
      </Screen>

      {/* ── Overlay ──────────────────────────────────────────────────────── */}
      <QuickBookingSheet target={quickBooking} onClose={closeQuickBooking} onOpenDetail={openBookingDetail} />

      <CellActionsSheet
        target={cellTarget}
        actions={cellActions}
        onSelect={runCellAction}
        onClose={closeCellMenu}
      />

      <VehicleInfoSheet resource={infoResource} onClose={closeInfo} onOpenVehicle={openVehicle} />

      <DayActionSheet
        state={dayPanel}
        actions={dayActions}
        blockState={dayBlockState}
        onClose={closeDayPanel}
        onQuickBlock={runQuickBlock}
        onRelease={releaseDayBlock}
        onOpenBlockDialog={openBulkBlock}
        onPrice={openBulkPrice}
      />

      <BulkDayBlockSheet state={bulkBlock} filters={filters} onClose={closeBulkBlock} />
      <BulkDayPriceSheet state={bulkPrice} filters={filters} onClose={closeBulkPrice} />

      <VehicleBlockSheet state={blockSheetState} onClose={closeSheet} />

      {sheet?.kind === 'block-detail' ? (
        <VehicleBlockDetailSheet blockId={sheet.blockId} open onClose={closeSheet} onEdit={editBlock} />
      ) : null}

      <DailyPriceSheet state={priceSheetState} onClose={closeSheet} />

      {sheet?.kind === 'maintenance' ? (
        <MaintenanceEventSheet
          vehicleId={sheet.vehicleId}
          vehicleName={sheet.vehicleName}
          recordId={sheet.recordId}
          open
          onClose={closeSheet}
          onOpenProfile={openMaintenanceProfile}
        />
      ) : null}
    </>
  );
}

/**
 * Viên "đang tải" nổi giữa lưới.
 *
 * Web không có nó, và đó là khác biệt có lý do: ở đó đổi khoảng là một lượt render gần như tức
 * thì nên `opacity: .75` đủ nói. Trên điện thoại, lượt dựng lại cả cửa sổ hàng mất tới nửa giây
 * — chỉ mờ đi thôi thì đọc ra như "màn hình bị lỗi" chứ không phải "đang tải".
 *
 * `pointerEvents="none"` để chính viên này không nuốt cú chạm: việc chặn chạm là của lớp bọc lưới
 * bên dưới, nơi biết lưới có đang lệch khoảng hay không.
 */
function GridBusyOverlay() {
  const colors = useColors();
  const t = useTranslations('Calendar');

  return (
    <View pointerEvents="none" style={styles.busyOverlay}>
      <XStack
        ai="center"
        gap={space.xs}
        px={layout.padX}
        py={space.sm}
        br={radius.pill}
        bg={colors.surfaceElevated}
        bw={1}
        bc={colors.border}
        accessibilityLabel={t('grid.loadingAriaLabel')}
        accessibilityLiveRegion="polite"
      >
        <ActivityIndicator size="small" color={colors.primaryActive} />
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('grid.loadingAriaLabel')}
        </Text>
      </XStack>
    </View>
  );
}

const styles = StyleSheet.create({
  area: { flex: 1, overflow: 'hidden' },
  fill: { flex: 1 },
  head: { position: 'absolute', top: 0, left: 0, right: 0 },
  gridSlide: { position: 'absolute', top: 0, left: 0, right: 0 },
  gridGap: { height: 16 },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
