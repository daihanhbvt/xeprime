import { useMemo, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { startOfAppDay } from '@xeprime/domain';
import { VEHICLE_TYPE } from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
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
  CALENDAR_DAY_OPTIONS,
  DEFAULT_DAYS,
  DEFAULT_SORT,
  type CalendarFilterPatch,
} from '../hooks/use-calendar-filters';
import { shiftFrom, todayIsoDate } from '../utils/calendar-date.util';

/** Sentinel "không lọc" - không endpoint nào nhận `vehicleType=all`. */
const ALL = 'all';

/** Hai cách bày lịch (Figma "Chế độ xem" `24729:83508`). */
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
      /*
       * "Khoảng xem" chỉ có nghĩa ở Danh sách - Lịch tháng luôn xem trọn tháng. "Không lọc" trỏ
       * vào CHÍNH `DEFAULT_DAYS`, không phải một đầu của danh sách lựa chọn.
       */
      ...(view === CALENDAR_VIEW.LIST
        ? [
            {
              key: GROUP.DAYS,
              label: t('toolbar.rangeLength'),
              value: String(filters.days),
              resetValue: String(DEFAULT_DAYS),
              display: 'option' as const,
              labelAbove: true,
              options: CALENDAR_DAY_OPTIONS.map((value) => ({
                value: String(value),
                label: t('toolbar.dayRange', { count: value }),
              })),
            },
          ]
        : []),
    ],
    [branchGroup, filters.sort, filters.vehicleType, filters.days, t, domainLabel, view],
  );

  const groups = useMemo(() => [viewGroup, ...filterGroups], [viewGroup, filterGroups]);
  const count = activeFilterCount(filterGroups);

  function applyFilter(groupKey: string, value: string) {
    if (groupKey === GROUP.VIEW) onViewChange(value as CalendarView);
    else if (groupKey === BRANCH_FILTER_GROUP_KEY) applyBranchFilterGroup(branchFilter, value);
    else if (groupKey === GROUP.VEHICLE_TYPE) setFilters({ vehicleType: value === ALL ? null : value });
    else if (groupKey === GROUP.SORT) setFilters({ sort: value as CalendarSort });
    else if (groupKey === GROUP.DAYS) setFilters({ days: Number(value) });
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
export function CalendarDateControls({
  filters,
  setFilters,
  view,
}: {
  filters: CalendarFilters;
  setFilters: (patch: CalendarFilterPatch) => void;
  view: CalendarView;
}) {
  const colors = useColors();
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();
  const month = view === CALENDAR_VIEW.MONTH;

  const start = startOfAppDay(filters.from);
  const label = month
    ? fmt.monthYear(start.toDate())
    : t('toolbar.rangeLabel', {
        from: fmt.dayMonth(start.format('YYYY-MM-DD')),
        to: fmt.dateKey(start.add(filters.days - 1, 'day').format('YYYY-MM-DD')),
      });

  const shift = (direction: 1 | -1) =>
    setFilters({
      from: month
        ? start.startOf('month').add(direction, 'month').format('YYYY-MM-DD')
        : shiftFrom(filters.from, filters.days, direction),
    });

  return (
    <XStack h={CONTROL_H} ai="center" gap={CONTROL_GAP}>
      <ControlButton
        label={t('toolbar.today')}
        onPress={() => setFilters({ from: todayIsoDate() })}
        grow
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
        label={month ? t('toolbar.previousMonth') : t('toolbar.previousRange', { count: filters.days })}
        onPress={() => shift(-1)}
      >
        <LineIcon name="chevron-left" size={20} color={colors.textMuted} />
      </ControlButton>
      {/* `accessibilityLiveRegion` để trình đọc màn hình đọc khoảng MỚI sau mỗi lần lùi/tiến. */}
      <Text
        flexShrink={1}
        minWidth={0}
        ta="center"
        col={colors.text}
        fos={typeScale.title.fontSize}
        lh={typeScale.title.lineHeight}
        fow={fontWeight.medium}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        accessibilityLiveRegion="polite"
      >
        {label}
      </Text>
      <ControlButton
        label={month ? t('toolbar.nextMonth') : t('toolbar.nextRange', { count: filters.days })}
        onPress={() => shift(1)}
      >
        <LineIcon name="chevron-right" size={20} color={colors.textMuted} />
      </ControlButton>
    </XStack>
  );
}

function ControlButton({
  label,
  onPress,
  grow = false,
  children,
}: {
  label: string;
  onPress: () => void;
  grow?: boolean;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
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
          opacity={pressed ? 0.7 : 1}
        >
          {children}
        </YStack>
      )}
    </Pressable>
  );
}
