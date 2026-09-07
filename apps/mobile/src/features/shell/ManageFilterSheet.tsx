import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { dayjs } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { FieldBox } from '@/components/ui/FieldBox';
import { SearchInput } from '@/components/ui/SearchInput';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Một chiều lọc đơn chọn: nhãn + các lựa chọn + giá trị đang chọn.
 *
 * Mỗi nhóm là ĐƠN CHỌN — đúng những gì DTO backend nhận (`status`, `serviceType`, `sort` đều là
 * một giá trị). Nhóm nào cần đa chọn thì phải sửa cả DTO trước, không mở ở tầng giao diện.
 *
 * `kind` để TRỐNG được: đơn chọn là dạng mặc định, nên hàng chục nơi gọi sẵn có không phải khai
 * thêm gì khi tấm này học được dạng thứ hai.
 */
export interface FilterSelectGroup {
  readonly kind?: 'select';
  readonly key: string;
  readonly label: string;
  readonly options: readonly FilterOption[];
  readonly value: string;
  /** Giá trị coi là "không lọc" — dùng để đếm số bộ lọc đang bật. */
  readonly resetValue: string;
}

/**
 * Chiều lọc KHOẢNG NGÀY — bản native của `{ kind: 'dateRange' }` bên `FilterBar`.
 *
 * Giữ HAI tham số độc lập đúng như backend nhận (`from`/`to`), không tự chế một chuỗi ghép: đó là
 * hợp đồng web đã chốt và có test canh (`FilterBar.test.tsx`). Đổi lại nó chiếm hai khoá trong bản
 * nháp nhưng vẫn ĐẾM LÀ MỘT chiều đang bật — một khoảng ngày là một ý định lọc.
 */
export interface FilterDateRangeGroup {
  readonly kind: 'dateRange';
  readonly label: string;
  readonly fromKey: string;
  readonly toKey: string;
  /** `YYYY-MM-DD`; chuỗi rỗng = chưa đặt đầu này. */
  readonly from: string;
  readonly to: string;
}

export type FilterGroup = FilterSelectGroup | FilterDateRangeGroup;

/** Nháp = giá trị đang chọn của từng chiều, gom theo `key`. */
type Draft = Record<string, string>;

/** Các tham số một chiều CHIẾM: khoảng ngày chiếm hai, mọi chiều còn lại chiếm một. */
function groupEntries(group: FilterGroup): readonly (readonly [string, string])[] {
  return group.kind === 'dateRange'
    ? [
        [group.fromKey, group.from],
        [group.toKey, group.to],
      ]
    : [[group.key, group.value]];
}

/** Khoá dùng làm `key` của React và của chip tóm tắt — khoảng ngày lấy đầu `from`. */
const groupId = (group: FilterGroup): string =>
  group.kind === 'dateRange' ? group.fromKey : group.key;

/** Chiều này có đang lọc gì không, đọc theo BẢN NHÁP (rơi về giá trị đang áp dụng nếu chưa đụng). */
function isGroupActive(group: FilterGroup, draft: Draft): boolean {
  return group.kind === 'dateRange'
    ? Boolean(draft[group.fromKey] ?? group.from) || Boolean(draft[group.toKey] ?? group.to)
    : (draft[group.key] ?? group.value) !== group.resetValue;
}

/** Số chiều đang khác mặc định — hiện trên nút lọc để biết có gì đang bật mà không phải mở ra. */
export function activeFilterCount(groups: readonly FilterGroup[]): number {
  const applied = draftFrom(groups);
  return groups.filter((group) => isGroupActive(group, applied)).length;
}

const draftFrom = (groups: readonly FilterGroup[]): Draft =>
  Object.fromEntries(groups.flatMap(groupEntries));

/**
 * Sàn của lịch chọn trong bộ lọc.
 *
 * `DatePickerSheet` mặc định sàn là NGÀY MAI vì nó sinh ra cho lịch đặt xe. Bộ lọc thì ngược hẳn:
 * thứ người ta lọc thường đã xảy ra rồi. Lấy mốc 01/1980 như màn hồ sơ nguồn xe.
 */
const FILTER_DATE_FLOOR = dayjs('1980-01-01');

/**
 * Tấm trượt lọc dùng chung cho mọi màn danh sách của khu quản lý — thay cho dải chip nằm thẳng
 * trên màn, vì dải chip ăn ~140px chiều dọc cho ba chiều lọc, không co giãn khi thêm chiều thứ
 * tư, và giấu mất chip thứ năm trở đi ngoài mép màn.
 *
 * **Chọn ở BẢN NHÁP, áp khi bấm "Áp dụng".** Áp ngay từng cú chạm thì mỗi cú bắn một request và
 * đặt hai chiều lọc là hai lần dựng lại danh sách — lần đầu cho một trạng thái người dùng chưa hề
 * muốn dừng ở đó; lớp phủ mờ cao 90% màn cũng khiến không nhìn thấy gì phía sau. Bản nháp còn mở
 * đường LÙI: chạm nhầm thì đóng tấm là xong. Cùng khuôn `FilterSheet` của khu khách hàng.
 *
 * Nơi gọi không phải sửa gì: khi bấm "Áp dụng", tấm này gọi `onChange` một lần cho mỗi chiều
 * THỰC SỰ đổi.
 */
export const ManageFilterSheet = memo(function ManageFilterSheet({
  open,
  groups,
  onChange,
  searchValue,
  searchLabel,
  searchPlaceholder,
  onSearchChange,
  onClose,
}: {
  open: boolean;
  groups: readonly FilterGroup[];
  onChange: (groupKey: string, value: string) => void;
  searchValue: string;
  searchLabel: string;
  searchPlaceholder: string;
  onSearchChange: (next: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('Common.filters');
  const tActions = useTranslations('Common.actions');
  const tLabels = useTranslations('Common.labels');
  const tUnits = useTranslations('Common.units');
  const fmt = useAppFormat();

  const [draft, setDraft] = useState<Draft>(() => draftFrom(groups));

  /*
   * Từ khoá cũng nằm trong NHÁP, không áp thẳng từng phím gõ.
   *
   * Nó là một chiều lọc như mọi chiều khác, chỉ khác ở dạng nhập. Để nó áp ngay trong khi các
   * chiều còn lại chờ nút "Áp dụng" thì cùng một tấm có hai luật, và người dùng gõ xong đóng
   * tấm bằng nút X sẽ thấy danh sách đã đổi dù họ vừa HUỶ.
   */
  const [searchDraft, setSearchDraft] = useState(searchValue);

  /*
   * Mỗi lần MỞ thì nạp lại nháp từ bộ lọc đang áp dụng — bỏ dở lần trước không để lại rác.
   *
   * Đọc `groups` qua ref để effect chỉ phụ thuộc `open`: mảng nhóm được dựng lại mỗi render ở
   * nơi gọi, đưa thẳng vào deps là reseed liên tục và mọi lựa chọn bị xoá ngay khi vừa chạm.
   */
  const groupsRef = useRef(groups);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);
  const searchRef = useRef(searchValue);
  useEffect(() => {
    searchRef.current = searchValue;
  }, [searchValue]);
  useEffect(() => {
    if (!open) return;
    setDraft(draftFrom(groupsRef.current));
    setSearchDraft(searchRef.current);
  }, [open]);

  const select = useCallback((groupKey: string, value: string) => {
    setDraft((prev) => ({ ...prev, [groupKey]: value }));
  }, []);

  /**
   * Chữ hiện trên chip tóm tắt của MỘT chiều.
   *
   * Khoảng ngày đọc y như web (`rangeLabel` của `FilterBar`): đủ hai đầu thì `từ → đến`, thiếu
   * một đầu thì nói rõ đầu nào có — "Từ 20/09/2026" và "Đến 20/09/2026" là hai bộ lọc khác nhau,
   * in trần mỗi con số thì không phân biệt được.
   */
  const chipValue = (group: FilterGroup): string => {
    if (group.kind !== 'dateRange') {
      const value = draft[group.key] ?? group.value;
      return group.options.find((option) => option.value === value)?.label ?? '';
    }
    const from = draft[group.fromKey] ?? group.from;
    const to = draft[group.toKey] ?? group.to;
    if (from && to) return tUnits('range', { from: fmt.dateKey(from), to: fmt.dateKey(to) });
    return from
      ? `${tLabels('from')} ${fmt.dateKey(from)}`
      : `${tLabels('to')} ${fmt.dateKey(to)}`;
  };

  /** Gỡ chip: khoảng ngày phải xoá CẢ HAI đầu — bỏ sót một đầu là bộ lọc vẫn còn mà chip đã biến mất. */
  const clearGroup = (group: FilterGroup) => {
    if (group.kind !== 'dateRange') {
      select(group.key, group.resetValue);
      return;
    }
    setDraft((prev) => ({ ...prev, [group.fromKey]: '', [group.toKey]: '' }));
  };

  /** Các chiều đang khác mặc định TRONG NHÁP — nguồn của dải chip tóm tắt và của số đếm. */
  const active = groups.filter((group) => isGroupActive(group, draft));
  const searchActive = searchDraft.trim().length > 0;
  const activeCount = active.length + (searchActive ? 1 : 0);

  const apply = () => {
    // Chỉ gọi cho chiều THỰC SỰ đổi: mỗi lần gọi là một lần nơi gọi đặt lại trang về 1.
    for (const group of groups) {
      for (const [key, applied] of groupEntries(group)) {
        const next = draft[key] ?? applied;
        if (next !== applied) onChange(key, next);
      }
    }
    if (searchDraft !== searchValue) onSearchChange(searchDraft);
    onClose();
  };

  const reset = () => {
    setDraft(
      Object.fromEntries(
        groups.flatMap((group) =>
          group.kind === 'dateRange'
            ? [
                [group.fromKey, ''],
                [group.toKey, ''],
              ]
            : [[group.key, group.resetValue]],
        ),
      ),
    );
    setSearchDraft('');
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('title')}
      subtitle={t('subtitle')}
      footer={
        <YStack gap={space.sm}>
          {/*
            Dải TÓM TẮT nằm ngay trên hai nút, không lẫn vào thân cuộn: đây là câu trả lời cho
            "tôi vừa chọn những gì", và nó phải đọc được đúng lúc ngón tay đang ở nút Áp dụng —
            kể cả khi danh sách nhóm đã cuộn trôi lên trên.
          */}
          <YStack gap={space.xs}>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {activeCount > 0 ? t('activeCount', { count: activeCount }) : t('none')}
            </Text>
            {activeCount > 0 ? (
              <XStack flexWrap="wrap" gap={space.xs}>
                {searchActive ? (
                  <ActiveChip
                    label={t('chip', { label: searchLabel, value: searchDraft.trim() })}
                    onRemove={() => setSearchDraft('')}
                  />
                ) : null}
                {active.map((group) => (
                  <ActiveChip
                    key={groupId(group)}
                    label={t('chip', { label: group.label, value: chipValue(group) })}
                    onRemove={() => clearGroup(group)}
                  />
                ))}
              </XStack>
            ) : null}
          </YStack>

          {/*
            Hai nút KHÔNG chia đôi — cùng lý do với tấm lọc của khu khách hàng: "Áp dụng" là
            hành động chính và phải đọc được trọn vẹn, "Đặt lại" chỉ cần đủ chỗ cho hai từ.
          */}
          <XStack gap={space.sm}>
            <YStack flexShrink={1}>
              <Button
                label={tActions('reset')}
                variant="secondary"
                icon="refresh-outline"
                disabled={activeCount === 0}
                onPress={reset}
              />
            </YStack>
            <YStack f={1}>
              <Button label={tActions('apply')} icon="funnel-outline" onPress={apply} />
            </YStack>
          </XStack>
        </YStack>
      }
    >
      <YStack gap={space.lg}>
        {/*
          Ô tìm kiếm ĐỨNG ĐẦU tấm, trước mọi chiều lọc: nó là cách thu hẹp nhanh nhất, và đặt nó
          sau ba nhóm chip thì phải cuộn mới tới.
        */}
        <SearchInput
          value={searchDraft}
          onChange={setSearchDraft}
          label={searchLabel}
          placeholder={searchPlaceholder}
          variant="boxed"
        />

        {groups.map((group) =>
          group.kind === 'dateRange' ? (
            <DateRangeGroup
              key={group.fromKey}
              group={group}
              from={draft[group.fromKey] ?? group.from}
              to={draft[group.toKey] ?? group.to}
              onSelect={select}
            />
          ) : (
            <Group
              key={group.key}
              group={group}
              value={draft[group.key] ?? group.value}
              onSelect={select}
            />
          ),
        )}
      </YStack>
    </BottomSheet>
  );
});

const Group = memo(function Group({
  group,
  value,
  onSelect,
}: {
  group: FilterSelectGroup;
  value: string;
  onSelect: (groupKey: string, value: string) => void;
}) {
  return (
    <YStack gap={space.sm}>
      {/*
        Tên chiều lọc tô GOLD như tấm lọc khu khách hàng: nó là mốc phân đoạn, và trong một tấm
        có ba bốn nhóm thì màu là thứ tách chúng ra nhanh hơn khoảng trắng.
      */}
      <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {group.label}
      </Text>

      {/*
        Chip vẫn là chip — nhưng XUỐNG DÒNG được, không cuộn ngang. Trong tấm trượt thì chiều dọc
        rộng rãi, nên mọi lựa chọn hiện cùng lúc và không cái nào trốn ngoài mép màn.
      */}
      <XStack flexWrap="wrap" gap={space.xs}>
        {group.options.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={value === option.value}
            onPress={() => onSelect(group.key, option.value)}
          />
        ))}
      </XStack>
    </YStack>
  );
});

/**
 * Chiều KHOẢNG NGÀY: hai ô ngày cạnh nhau, mỗi ô mở chính `DatePickerSheet` của app.
 *
 * Hai ô RIÊNG chứ không phải một vùng chạm chung như `RangeFieldBox` của màn đặt xe: ở đây hai
 * đầu độc lập thật — lọc "từ 20/09" mà bỏ trống đầu kia là một bộ lọc hợp lệ, còn khoảng thuê thì
 * không có nghĩa nếu thiếu ngày trả.
 *
 * Đầu "Đến" lấy SÀN là ngày đã chọn ở đầu "Từ" — `RangePicker` bên web cũng chặn đúng vậy, và một
 * khoảng ngược đầu chỉ trả về danh sách rỗng mà không nói vì sao.
 */
const DateRangeGroup = memo(function DateRangeGroup({
  group,
  from,
  to,
  onSelect,
}: {
  group: FilterDateRangeGroup;
  from: string;
  to: string;
  onSelect: (groupKey: string, value: string) => void;
}) {
  const t = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const editingTo = picking === 'to';

  return (
    <YStack gap={space.sm}>
      <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {group.label}
      </Text>

      <XStack gap={space.sm}>
        <YStack f={1}>
          <FieldBox
            label={t('from')}
            value={from ? fmt.dateKey(from) : ''}
            placeholder={t('selectDate')}
            icon="calendar-outline"
            onPress={() => setPicking('from')}
          />
        </YStack>
        <YStack f={1}>
          <FieldBox
            label={t('to')}
            value={to ? fmt.dateKey(to) : ''}
            placeholder={t('selectDate')}
            icon="calendar-outline"
            onPress={() => setPicking('to')}
          />
        </YStack>
      </XStack>

      <DatePickerSheet
        open={picking !== null}
        onClose={() => setPicking(null)}
        value={editingTo ? to : from}
        title={editingTo ? t('to') : t('from')}
        minDate={editingTo && from ? dayjs(from) : FILTER_DATE_FLOOR}
        onChange={(next) => {
          onSelect(editingTo ? group.toKey : group.fromKey, next);
          setPicking(null);
        }}
      />
    </YStack>
  );
});

/**
 * Chip tóm tắt MỘT chiều đang lọc, kèm dấu ✕ để gỡ ngay tại chỗ.
 *
 * Gỡ ở đây thay vì bắt cuộn ngược lên nhóm tương ứng rồi tìm lại lựa chọn "Tất cả" — với ba bốn
 * nhóm thì đó là cả một chuyến đi cho một thao tác đáng lẽ một chạm.
 */
const ActiveChip = memo(function ActiveChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={label}>
      <XStack
        ai="center"
        gap={space.xs}
        px={space.sm}
        py={space.xs}
        br={radius.pill}
        bw={1}
        bg={colors.primaryLight}
        bc={colors.primary}
      >
        <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.medium}>
          {label}
        </Text>
        <Ionicons name="close" size={iconSize.xs} color={colors.primaryActive} />
      </XStack>
    </Pressable>
  );
});
