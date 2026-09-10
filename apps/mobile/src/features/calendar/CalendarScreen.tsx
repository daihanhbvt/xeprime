import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { holidayRunAround, LIST_SEPARATOR, startOfAppDay } from '@xeprime/domain';
import { OCCUPANCY_SOURCE_TYPE, PERMISSION, VEHICLE_BLOCK_REASON } from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { Callout } from '@/components/ui/Callout';
import { InlineAction } from '@/components/ui/InlineAction';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { layout } from '@/theme/layout';
import { colors, fontSize, radius, space } from '@/theme/tokens';
import type { CalendarEvent, CalendarResource } from './api';
import { BulkDayBlockSheet, type BulkDayBlockState } from './components/BulkDayBlockSheet';
import { BulkDayPriceSheet, type BulkDayPriceState } from './components/BulkDayPriceSheet';
import { CalendarGridSkeleton } from './components/CalendarGridSkeleton';
import { CalendarLegend } from './components/CalendarLegend';
import { CalendarTimeline } from './components/CalendarTimeline';
import { CalendarToolbar } from './components/CalendarToolbar';
import {
  CellActionsSheet,
  type CellActionKey,
  type CellActionTarget,
} from './components/CellActionsSheet';
import { DailyPriceSheet, type DailyPriceSheetState } from './components/DailyPriceSheet';
import { DayActionSheet, type DayActionKey, type DayPanelState } from './components/DayActionSheet';
import { MaintenanceEventSheet } from './components/MaintenanceEventSheet';
import { VehicleBlockDetailSheet } from './components/VehicleBlockDetailSheet';
import { VehicleBlockSheet, type VehicleBlockSheetState } from './components/VehicleBlockSheet';
import { VehicleInfoSheet } from './components/VehicleInfoSheet';
import { useBulkBlockDay, useBulkDayPreview, useReleaseBulkBlock } from './hooks/use-bulk-day';
import { useCalendarData } from './hooks/use-calendar-data';
import { useCalendarFilters } from './hooks/use-calendar-filters';
import { useCalendarHolidays } from './hooks/use-calendar-holidays';
import { listDays, type DayCell } from './utils/calendar-date.util';

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
export function CalendarScreen() {
  const t = useTranslations('Calendar');
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
  const { filters, setFilters, filtered, reset } = useCalendarFilters(params);

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
  const data = useCalendarData(gridFilters, canView);

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
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const [sheet, setSheet] = useState<SheetState>(null);
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
          onError: (error) => toast.showError(errorMessage(error)),
        },
      );
    },
    [errorMessage, panelPreview.data, quickBlock, t, toast],
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
    (action: CellActionKey) => {
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
        navigateOnce(
          ROUTES.manage.bookingCreate({
            vehicleId: target.vehicleId,
            // Tên đi CÙNG id: ô lịch đã biết nó, và màn đích không phải chắc chắn hỏi lại được.
            vehicleName: resource?.name ?? target.vehicleName,
            pickupAt: pickupAt.toISOString(),
            returnAt: pickupAt.add(1, 'day').toISOString(),
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
            date: target.date,
          },
        });
        return;
      }

      setSheet({
        kind: 'price',
        state: {
          vehicleId: target.vehicleId,
          vehicleName: target.vehicleName,
          weekdayPrice: resource?.weekdayPrice ?? null,
          hourlyPrice: resource?.hourlyPrice ?? null,
          date: target.date,
        },
      });
    },
    [cellTarget, navigateOnce, resources],
  );

  /**
   * Chạm thanh event → THẲNG vào chi tiết đúng loại. Không có tầng trung gian nào.
   *
   * Web có một thẻ xem nhanh cho thanh event, nhưng nó mở bằng `trigger={['hover', 'focus']}` —
   * còn cú CLICK thì đi thẳng vào modal chi tiết. Bản đầu ở đây dịch thẻ hover đó thành một tấm
   * trượt mở bằng cú chạm, và thành ra chạm hai lần cho một việc: cảm ứng không có "hover" để
   * dịch, nên thứ duy nhất còn lại của cú chạm là vai trò của cú click.
   *
   * Không mất thông tin: mọi thứ thẻ xem nhanh chở (xe, giờ nhận/trả, thời lượng) đều nằm sẵn
   * trong chính màn chi tiết mà cú chạm nay mở ra.
   *
   * Web phân nhánh đúng bốn loại này; `booking_request` là loại DUY NHẤT web bỏ sót (bấm vào
   * không ra gì — xem báo cáo), còn ở đây nó dẫn về hộp thư yêu cầu, nơi duy nhất xử lý được nó.
   */
  const openEvent = useCallback(
    (event: CalendarEvent, resource: CalendarResource) => {
      if (!event.sourceId) return;
      if (event.type === OCCUPANCY_SOURCE_TYPE.BOOKING) {
        navigateOnce(ROUTES.manage.bookingDetail(event.sourceId));
      } else if (event.type === OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST) {
        // Yêu cầu thuê chưa thành đơn — hộp thư yêu cầu là chỗ duy nhất xử lý được nó.
        navigateOnce(ROUTES.manage.requests());
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

  const onDayPress = useMemo(
    () =>
      dayActions.length > 0
        ? (day: DayCell) => setDayPanel({ day, holiday: holidaysByDay.get(day.key) })
        : null,
    [dayActions.length, holidaysByDay],
  );
  const onCellPress = cellActions.length > 0 ? openCellMenu : null;

  // Thiếu quyền là 403 của CHÍNH màn này — không gọi API rồi mới nhận lỗi.
  if (!permissionsLoading && !canView) {
    return (
      <>
        <ManageHeader />
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
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        {/*
          KHÔNG có khối tiêu đề trang — cùng quyết định web ghi ở `manage/calendar/page.tsx`: mọi
          pixel dọc ở màn này thuộc về LƯỚI. Mục đang sáng trong menu đã nói người dùng đang ở đâu,
          và tổng số xe nằm ở ô góc của chính lưới (`grid.resourceHeader`).
        */}
        <CalendarToolbar
          filters={filters}
          setFilters={setFilters}
          searchValue={search}
          onSearchChange={setSearch}
          {...(params.back === '1'
            ? { onBack: () => goBackOr(router, ROUTES.manage.vehicles()) }
            : {})}
        />

        <CalendarLegend />

        {data.isLoading ? (
          <CalendarGridSkeleton />
        ) : data.error && !data.resources ? (
          <ScreenError error={data.error} title={t('states.loadFailed')} onRetry={data.refetch} />
        ) : resources.length === 0 ? (
          <ScreenMessage
            icon={filtered ? 'search-outline' : 'car-outline'}
            title={t(filtered ? 'states.noMatchTitle' : 'states.noVehiclesTitle')}
            description={t(filtered ? 'states.noMatchDescription' : 'states.noVehiclesDescription')}
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
        ) : (
          <>
            {/*
              Lỗi khi ĐÃ CÓ lưới để đọc: nói ra ngay TRÊN lưới, không thay lưới bằng màn lỗi.
              `keepPreviousData` giữ dữ liệu cũ, nên không có dải này thì một lần refetch hỏng
              (mất mạng, 500, phiên hết hạn) hoàn toàn im lặng — người điều phối đọc một cái lịch
              cũ và quyết định xe còn trống dựa trên nó. Web dựng đúng dải này ở đúng chỗ này.
            */}
            {data.error ? (
              <YStack px={layout.screenX} pb={space.xs}>
                <Callout tone="danger" title={t('states.loadFailed')}>
                  {errorMessage(data.error)}
                </Callout>
                <InlineAction label={t('states.retry')} onPress={data.refetch} />
              </YStack>
            ) : null}

            {!data.hasAnyEvent ? (
              // Khoảng đang xem chưa có lịch nào: nói NHỎ một dòng — lưới vẫn hiện và chạm được.
              <Text
                px={layout.screenX}
                py={space.xs}
                col={colors.textMuted}
                fos={fontSize.bodySm}
                accessibilityRole="text"
              >
                {t(onCellPress ? 'states.noEventsInRangeActionable' : 'states.noEventsInRange')}
              </Text>
            ) : null}

            {/*
              Vùng LƯỚI, và cũng là thứ được ĐO.
              Bề rộng cột ngày và chiều cao danh sách đều suy từ kích thước thật của vùng này, nên
              lưới chỉ dựng sau lần đo đầu tiên — dựng ở bề rộng 0 thì mọi cột ra 0px.
              Nhãn vùng đặt ở đây, đúng chỗ web đặt `role="region" aria-label`.
            */}
            <View
              accessible={false}
              accessibilityLabel={t('grid.ariaLabel')}
              accessibilityState={{ busy: gridStale || data.isFetching }}
              /*
                `marginBottom` chứ KHÔNG phải `padding`: `onLayout` báo kích thước của chính view
                này, mà bề rộng cột ngày và chiều cao danh sách đều suy từ con số đó. Một
                `paddingBottom` sẽ nằm TRONG kích thước được báo, nên lưới vẫn dựng đủ chiều cao
                cũ rồi bị đẩy xuống — đúng phần vừa chừa ra lại bị cắt mất ở đáy.

                Cần dù `Screen` đã ăn vùng an toàn: màn này đi `padded={false}` để mọi pixel dọc
                thuộc về lưới, nên hàng "Xe còn trống" nằm sát mép và bị thanh điều hướng liếm vào.
              */
              style={{ flex: 1, marginBottom: space.xs }}
              onLayout={(e) =>
                setViewport({
                  width: e.nativeEvent.layout.width,
                  height: e.nativeEvent.layout.height,
                })
              }
            >
              {/*
                MỜ lưới khi đang tải — đúng cách web làm (`.refetching { opacity: .75 }`), không
                phải một tấm che xám đè lên. Lưới cũ vẫn đọc được xuyên qua, và đó là chủ đích:
                người điều phối thường chỉ cần liếc lại một dòng, không cần chờ dữ liệu mới.

                CHẶN chạm thì CHỈ khi lưới đang lệch khoảng — xem `gridStale`. Một lần refetch nền
                (sau khi khoá xe, sau khi đặt giá) không được phép khoá tay người dùng: khoảng vẫn
                đúng, chỉ có số liệu đang mới lại.
              */}
              <View
                style={{ flex: 1, opacity: gridStale || data.isFetching ? 0.75 : 1 }}
                pointerEvents={gridStale ? 'none' : 'auto'}
              >
                {viewport.width > 0 && viewport.height > 0 ? (
                  <CalendarTimeline
                    resources={resources}
                    eventsByResource={data.eventsByResource}
                    priceMarkers={data.priceMarkers}
                    availableByDay={data.availableByDay}
                    holidaysByDay={holidaysByDay}
                    days={days}
                    range={data.range}
                    viewport={viewport}
                    collapsed={collapsed}
                    onToggleCollapsed={() => setCollapsed((v) => !v)}
                    onCellPress={onCellPress}
                    onEventPress={openEvent}
                    onResourcePress={setInfoResource}
                    onDayPress={onDayPress}
                  />
                ) : null}
              </View>

              {gridStale ? <GridBusyOverlay /> : null}
            </View>
          </>
        )}
      </Screen>

      {/* ── Overlay ──────────────────────────────────────────────────────── */}
      <CellActionsSheet
        target={cellTarget}
        actions={cellActions}
        onSelect={runCellAction}
        onClose={() => setCellTarget(null)}
      />

      <VehicleInfoSheet
        resource={infoResource}
        onClose={() => setInfoResource(null)}
        onOpenVehicle={(vehicleId) => {
          setInfoResource(null);
          navigateOnce(ROUTES.manage.vehicleDetail(vehicleId));
        }}
      />

      <DayActionSheet
        state={dayPanel}
        actions={dayActions}
        blockState={{
          batchId: panelPreview.data?.activeBlockBatchId ?? null,
          loading: panelPreview.isPending,
          busy: quickBlock.isPending || releaseBatch.isPending,
        }}
        onClose={() => setDayPanel(null)}
        onQuickBlock={runQuickBlock}
        onRelease={(batchId) =>
          releaseBatch.mutate(batchId, {
            onSuccess: () => toast.showSuccess(t('bulkBlock.released')),
            onError: (error) => toast.showError(errorMessage(error)),
          })
        }
        onOpenBlockDialog={() => {
          if (dayPanel) setBulkBlock({ date: dayPanel.day.key, suggestedRange });
          setDayPanel(null);
        }}
        onPrice={() => {
          if (dayPanel) setBulkPrice({ date: dayPanel.day.key, suggestedRange });
          setDayPanel(null);
        }}
      />

      <BulkDayBlockSheet state={bulkBlock} filters={filters} onClose={() => setBulkBlock(null)} />
      <BulkDayPriceSheet state={bulkPrice} filters={filters} onClose={() => setBulkPrice(null)} />

      <VehicleBlockSheet
        state={sheet?.kind === 'block' ? sheet.state : null}
        onClose={() => setSheet(null)}
      />

      {sheet?.kind === 'block-detail' ? (
        <VehicleBlockDetailSheet
          blockId={sheet.blockId}
          open
          onClose={() => setSheet(null)}
          onEdit={(block) => setSheet({ kind: 'block', state: { mode: 'edit', block } })}
        />
      ) : null}

      <DailyPriceSheet
        state={sheet?.kind === 'price' ? sheet.state : null}
        onClose={() => setSheet(null)}
      />

      {sheet?.kind === 'maintenance' ? (
        <MaintenanceEventSheet
          vehicleId={sheet.vehicleId}
          vehicleName={sheet.vehicleName}
          recordId={sheet.recordId}
          open
          onClose={() => setSheet(null)}
          onOpenProfile={(vehicleId) => {
            setSheet(null);
            navigateOnce(ROUTES.manage.vehicleEditTab(vehicleId, VEHICLE_EDIT_TAB.MAINTENANCE));
          }}
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
  const t = useTranslations('Calendar');

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <XStack
        ai="center"
        gap={space.xs}
        px={space.md}
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
