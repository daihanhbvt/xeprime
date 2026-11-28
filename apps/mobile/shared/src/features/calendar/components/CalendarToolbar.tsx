import { memo, useMemo, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { startOfAppDay } from '@xeprime/domain';
import { VEHICLE_TYPE } from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import {
  applyBranchFilterGroup,
  BRANCH_FILTER_GROUP_KEY,
  useBranchFilterGroup,
} from '@/features/branches/components/BranchFilterField';
import type { BranchFilterState } from '@/features/branches/hooks/use-branch-filter';
import { ListSearchBar } from '@/features/shell/ListSearchBar';
import {
  activeFilterCount,
  ManageFilterSheet,
  type FilterGroup,
} from '@/features/shell/ManageFilterSheet';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';
import { CALENDAR_SORT_VALUES, type CalendarFilters, type CalendarSort } from '../api';
import {
  DEFAULT_SORT,
  type CalendarFilterPatch,
} from '../hooks/use-calendar-filters';
import { todayIsoDate } from '../utils/calendar-date.util';

/** Sentinel "không lọc" - không endpoint nào nhận `vehicleType=all`. */
const ALL = 'all';

/** Hai cách bày lịch (Figma "Chế độ xem" `24729:83508`). */
/** Lùi xa nhất bao nhiêu tháng trước hôm nay - chung cho nút ‹ và bộ chọn ngày. */
const PAST_LIMIT_MONTHS = 3;

export const CALENDAR_VIEW = { LIST: 'list', MONTH: 'month' } as const;
export type CalendarView = (typeof CALENDAR_VIEW)[keyof typeof CALENDAR_VIEW];

/** Các chiều của tấm lọc. Mã, không phải chữ - nhãn tra ở `Calendar.toolbar.*`. */
const GROUP = { VIEW: 'view', VEHICLE_TYPE: 'vehicleType', SORT: 'sort', DAYS: 'days' } as const;

/**
 * Hàng ô tìm + nút "Lọc" - Figma Lịch thuê xe "Tab List" (`24729:81897`), nằm TRONG thanh đầu trang.
 * Cùng `ListSearchBar` với màn Đơn thuê xe, nên ô tìm và nút Lọc của hai màn là một.
 *
 * Tấm lọc (Figma "Bộ lọc" `24729:83506`): MỘT cột, nhãn trên ô - Chế độ xem (Danh sách / Lịch
 * tháng) · Chi nhánh (ADR 0052) · Sắp xếp theo · Loại xe; thêm "Khoảng xem" (3/7/14 ngày) khi đang
 * ở Danh sách - người dùng chốt giữ độ dài ở Bộ lọc (27/11/2026). Ô tìm đã ra ngoài màn nên tấm
 * không còn ô tìm. "Chế độ xem" là cách BÀY, không phải bộ lọc - không đếm vào huy hiệu.
 */
export function CalendarSearchBar({
  filters,
  setFilters,
  searchValue,
  onSearchChange,
  view,
  onViewChange,
  branchFilter,
  branchId,
}: {
  filters: CalendarFilters;
  setFilters: (patch: CalendarFilterPatch) => void;
  /** Chữ đang GÕ - màn hoãn (`useDebouncedValue`) trước khi đẩy vào bộ lọc. */
  searchValue: string;
  onSearchChange: (next: string) => void;
  view: CalendarView;
  onViewChange: (next: CalendarView) => void;
  branchFilter: BranchFilterState;
  branchId: string | undefined;
}) {
  const t = useTranslations('Calendar');
  const domainLabel = useDomainLabel();
  const [filtering, setFiltering] = useState(false);
  const branchGroup = useBranchFilterGroup(branchFilter, branchId);

  const viewGroup = useMemo<FilterGroup>(
    () => ({
      key: GROUP.VIEW,
      label: t('toolbar.viewMode'),
      value: view,
      resetValue: CALENDAR_VIEW.LIST,
      presentation: 'segmented' as const,
      options: [
        { value: CALENDAR_VIEW.LIST, label: t('toolbar.view.list') },
        { value: CALENDAR_VIEW.MONTH, label: t('toolbar.view.month') },
      ],
    }),
    [t, view],
  );

  const filterGroups = useMemo<readonly FilterGroup[]>(
    () => [
      ...(branchGroup ? [{ ...branchGroup, labelAbove: true }] : []),
      {
        key: GROUP.SORT,
        label: t('toolbar.sortAriaLabelApp'),
        value: filters.sort,
        resetValue: DEFAULT_SORT,
        display: 'option' as const,
        labelAbove: true,
        options: CALENDAR_SORT_VALUES.map((value) => ({
          value,
          label: t(`toolbar.sort.${value}`),
        })),
      },
      {
        key: GROUP.VEHICLE_TYPE,
        label: t('toolbar.vehicleTypeLabel'),
        value: filters.vehicleType ?? ALL,
        resetValue: ALL,
        display: 'option' as const,
        labelAbove: true,
        options: [
          { value: ALL, label: t('toolbar.allVehicleTypes') },
          { value: VEHICLE_TYPE.CAR, label: domainLabel('vehicleType', VEHICLE_TYPE.CAR) },
          {
            value: VEHICLE_TYPE.MOTORBIKE,
            label: domainLabel('vehicleType', VEHICLE_TYPE.MOTORBIKE),
          },
        ],
      },
    ],
    [branchGroup, filters.sort, filters.vehicleType, t, domainLabel],
  );

  const groups = useMemo(() => [viewGroup, ...filterGroups], [viewGroup, filterGroups]);
  const count = activeFilterCount(filterGroups);

  function applyFilter(groupKey: string, value: string) {
    if (groupKey === GROUP.VIEW) onViewChange(value as CalendarView);
    else if (groupKey === BRANCH_FILTER_GROUP_KEY) applyBranchFilterGroup(branchFilter, value);
    else if (groupKey === GROUP.VEHICLE_TYPE) setFilters({ vehicleType: value === ALL ? null : value });
    else if (groupKey === GROUP.SORT) setFilters({ sort: value as CalendarSort });
  }

  return (
    <>
      <ListSearchBar
        value={searchValue}
        onChange={onSearchChange}
        label={t('toolbar.searchAriaLabel')}
        placeholder={t('toolbar.searchPlaceholderApp')}
        filterCount={count}
        onFilterPress={() => setFiltering(true)}
      />
      <ManageFilterSheet
        open={filtering}
        groups={groups}
        onChange={applyFilter}
        columns={1}
        onClose={() => setFiltering(false)}
      />
    </>
  );
}

/** Figma "Date Controls" `24729:83879`: cao 40, cách 12; nút viền `stroke/gray-low300` bo 12. */
const CONTROL_H = 40;
const CONTROL_GAP = 12;

/**
 * Hàng điều hướng ngày - Figma Lịch thuê xe "Date Controls" (`24729:83879`): "Hôm nay" (giãn hết
 * chỗ) · ‹ · nhãn khoảng 16/24 medium · ›. Danh sách lùi/tiến đúng `days` ngày; Lịch tháng lùi/tiến
 * một THÁNG và nhãn là tháng đang xem.
 *
 * Nhãn khoảng LUÔN có năm: header lưới chỉ in "T5 12", nên đây là chỗ duy nhất nói tháng và năm.
 */
export const CalendarDateControls = memo(function CalendarDateControls({
  filters,
  setFilters,
}: {
  filters: CalendarFilters;
  setFilters: (patch: CalendarFilterPatch) => void;
  /** Giữ trong kiểu cho nơi gọi; hai chế độ dùng CHUNG khoảng nên thanh ngày không còn phân nhánh. */
  view: CalendarView;
}) {
  const colors = useColors();
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();
  const [picking, setPicking] = useState(false);

  const start = startOfAppDay(filters.from);
  // Cùng một nhãn khoảng ở cả hai chế độ - Lịch tháng chỉ đổi cách bày.
  const label = t('toolbar.rangeLabel', {
        from: fmt.dayMonth(start.format('YYYY-MM-DD')),
        to: fmt.dateKey(start.add(filters.days - 1, 'day').format('YYYY-MM-DD')),
  });

  /*
   * ‹ › lùi/tiến đúng MỘT THÁNG lịch từ CHÍNH ngày đang xem (24/11 → 24/12 → 24/1) ở CẢ HAI chế
   * độ: Danh sách và Lịch tháng chỉ khác cách BÀY, dùng chung một ngày + một bộ lọc - đổi chế độ
   * qua lại không làm mất ngày (người dùng 28/11/2026). Lịch tháng tự hiện tháng chứa ngày đó.
   */
  const shift = (direction: 1 | -1) =>
    setFilters({ from: start.add(direction, 'month').format('YYYY-MM-DD') });
  /*
   * Lùi tối đa 3 THÁNG trước hôm nay - CÙNG mốc với bộ chọn ngày (người dùng 28/11/2026). Lùi
   * thêm một tháng mà rơi trước mốc thì khoá nút ‹ (không kẹp về mốc: người dùng bấm ‹ là chờ
   * đúng một tháng, nhảy nửa vời khó đoán hơn).
   */
  const minFrom = startOfAppDay(todayIsoDate()).subtract(PAST_LIMIT_MONTHS, 'month');
  const canGoBack = !start.subtract(1, 'month').isBefore(minFrom, 'day');

  return (
    <XStack h={CONTROL_H} ai="center" gap={CONTROL_GAP}>
      <ControlButton
        label={t('toolbar.today')}
        onPress={() => setFilters({ from: todayIsoDate() })}
      >
        <Text
          col={colors.textMuted}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
        >
          {t('toolbar.today')}
        </Text>
      </ControlButton>
      <ControlButton
        label={t('toolbar.previousMonth')}
        onPress={() => shift(-1)}
        disabled={!canGoBack}
      >
        <LineIcon name="chevron-left" size={20} color={canGoBack ? colors.textMuted : colors.textPlaceholder} />
      </ControlButton>
      {/* Nhãn khoảng = nút chọn NGÀY BẮT ĐẦU (Danh sách); Lịch tháng chọn ngày nào thì về tháng đó. */}
      <ControlButton label={label} onPress={() => setPicking(true)} grow>
        <XStack ai="center" gap={6} maxWidth="100%">
          <LineIcon name="calendar" size={18} color={colors.textMuted} />
          {/* `accessibilityLiveRegion` để trình đọc màn hình đọc khoảng MỚI sau mỗi lần lùi/tiến. */}
          <Text
            flexShrink={1}
            minWidth={0}
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.semibold}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            accessibilityLiveRegion="polite"
          >
            {label}
          </Text>
        </XStack>
      </ControlButton>
      <ControlButton label={t('toolbar.nextMonth')} onPress={() => shift(1)}>
        <LineIcon name="chevron-right" size={20} color={colors.textMuted} />
      </ControlButton>
      <DatePickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        value={filters.from}
        title={t('toolbar.pickStartApp')}
        // Lùi được tối đa 3 tháng về quá khứ (người dùng 28/11/2026) - mặc định của bộ chọn là từ ngày mai.
        minDate={minFrom}
        onChange={(next) => {
          setPicking(false);
          setFilters({ from: next });
        }}
      />
    </XStack>
  );
});

function ControlButton({
  label,
  onPress,
  grow = false,
  disabled = false,
  children,
}: {
  label: string;
  onPress: () => void;
  grow?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={grow ? { flex: 1, minWidth: 0 } : null}
    >
      {({ pressed }) => (
        <YStack
          h={CONTROL_H}
          minWidth={CONTROL_H}
          ai="center"
          jc="center"
          px={grow ? 16 : 10}
          br={radius.control}
          bw={1}
          bc={colors.borderInput}
          bg={colors.surface}
          opacity={disabled ? 0.5 : pressed ? 0.7 : 1}
        >
          {children}
        </YStack>
      )}
    </Pressable>
  );
}
