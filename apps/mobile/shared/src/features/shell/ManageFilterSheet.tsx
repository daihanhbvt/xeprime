import { Ionicons } from '@/components/icons/Ionicons';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DateRangeField } from '@/components/ui/DateRangeField';
import { FIELD_V2, FieldAppearanceProvider } from '@/components/ui/Field';
import { MenuOption, MenuOptionList } from '@/components/ui/MenuOption';
import { LineIcon } from '@/components/icons/LineIcon';
import { SearchInput } from '@/components/ui/SearchInput';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';

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
  /**
   * Chữ trên ô chọn của tấm dạng LƯỚI (`layout="grid"`, Figma "_Filter Modal" `24158:105500`):
   * - `all` (mặc định, người dùng chốt 20/11/2026): chưa lọc ⇒ "Tất cả + tên chiều" ("Tất cả loại
   *   xe") - cả trên ô lẫn trong danh sách chọn; đã lọc ⇒ nhãn lựa chọn. Chiều mà "không lọc" KHÔNG
   *   có nghĩa "tất cả" (sắp xếp, ngăn mặc định) phải khai `prefixed`/`option`.
   * - `label`: chưa lọc ⇒ tên chiều ("Loại xe"), đã lọc ⇒ nhãn lựa chọn.
   * - `option`: luôn nhãn lựa chọn - lựa chọn "không lọc" tự nói đủ ("Tất cả chi nhánh").
   * - `prefixed`: "Tên chiều: lựa chọn" với tên mờ ("Sắp xếp: Mới nhất") - chiều luôn có giá trị.
   */
  readonly display?: 'all' | 'label' | 'option' | 'prefixed';
  /** Tấm lưới: hiện NHÃN chiều phía trên ô ("Trạng thái" / ô: "Tất cả"), cùng kiểu nhãn của mọi ô nhập. */
  readonly labelAbove?: boolean;
  /**
   * `segmented` - tấm lưới vẽ chiều này thành dải phân đoạn trọn bề ngang (`SegmentedTabs`, Figma
   * Lịch thuê xe "Chế độ xem" `24729:83508`) thay vì ô chọn mở danh sách. Hợp với 2-3 lựa chọn ngắn.
   */
  readonly presentation?: 'select' | 'segmented';
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
  /** Tấm lưới: hiện nhãn chiều phía trên ô, cùng kiểu với ô chọn. */
  readonly labelAbove?: boolean;
  /** Chọn "Từ ngày" xong tự chuyển sang "Đến ngày" (mặc định tắt). */
  readonly autoAdvance?: boolean;
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
  searchValue = '',
  searchLabel = '',
  searchPlaceholder = '',
  onSearchChange,
  onClose,
  // Mặc định LƯỚI ô chọn (dropdown) cho mọi màn - người dùng chốt 20/11/2026.
  layout = 'grid',
  columns = 2,
}: {
  /**
   * Tấm lưới: số cột của ô chọn. `1` - mỗi chiều một hàng trọn bề ngang, nhãn ở trên (Figma Lịch
   * thuê xe "Bộ lọc" `24729:83506`). Mặc định 2 như mọi màn danh sách.
   */
  columns?: 1 | 2;
  /**
   * `chips` - mỗi chiều một nhóm chip + dải tóm tắt (mặc định, các màn cũ).
   * `grid` - design v2 (Figma "_Filter Modal" `24158:105500`): ô tìm, rồi lưới ô chọn hai cột,
   * chân "Xoá bộ lọc" · "Lưu bộ lọc". Cùng luật bản nháp - chỉ khác cách trình bày.
   */
  layout?: 'chips' | 'grid';
  open: boolean;
  groups: readonly FilterGroup[];
  onChange: (groupKey: string, value: string) => void;
  /** Ô tìm trong tấm — bỏ cả bộ ⇒ tấm chỉ có các nhóm lọc (vd lịch sử giao dịch của khách). */
  searchValue?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  onSearchChange?: (next: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
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
    return from ? `${tLabels('from')} ${fmt.dateKey(from)}` : `${tLabels('to')} ${fmt.dateKey(to)}`;
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
    if (searchDraft !== searchValue) onSearchChange?.(searchDraft);
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

  if (layout === 'grid') {
    const selects = groups.filter(
      (group): group is FilterSelectGroup =>
        group.kind !== 'dateRange' && group.presentation !== 'segmented',
    );
    const segmented = groups.filter(
      (group): group is FilterSelectGroup =>
        group.kind !== 'dateRange' && group.presentation === 'segmented',
    );
    const rows: (readonly [FilterSelectGroup] | readonly [FilterSelectGroup, FilterSelectGroup])[] =
      columns === 1 ? selects.map((group) => [group] as const) : pairsOf(selects);
    const dateRanges = groups.filter((group): group is FilterDateRangeGroup => group.kind === 'dateRange');
    return (
      <BottomSheet
        open={open}
        onClose={onClose}
        title={t('title')}
        chrome="v2"
        headerDivider
        footer={
          <XStack gap={GRID_GAP}>
            <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
              <Button label={t('clearAll')} variant="neutral" onPress={reset} />
            </YStack>
            <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
              <Button label={t('save')} variant="gradient" onPress={apply} />
            </YStack>
          </XStack>
        }
      >
        <YStack gap={GRID_GAP}>
          {onSearchChange ? (
            <SearchInput
              value={searchDraft}
              onChange={setSearchDraft}
              label={searchLabel}
              placeholder={searchPlaceholder}
              variant="field"
            />
          ) : null}
          {segmented.map((group) => (
            <YStack key={group.key}>
              <GridLabel text={group.label} />
              <SegmentedTabs
                items={group.options.map((option) => ({ key: option.value, label: option.label }))}
                value={draft[group.key] ?? group.value}
                onChange={(next) => select(group.key, next)}
              />
            </YStack>
          ))}
          {/* Lưới HAI cột, ô cách nhau 12 - chiều lẻ cuối cùng chiếm nửa hàng như Figma. */}
          {rows.map((pair) => (
            <XStack key={pair[0].key} gap={GRID_GAP}>
              {pair.map((group) => (
                <YStack key={group.key} f={1} minWidth={0}>
                  <GridSelect
                    group={group}
                    value={draft[group.key] ?? group.value}
                    onSelect={select}
                  />
                </YStack>
              ))}
              {pair.length === 1 && columns === 2 ? <YStack f={1} /> : null}
            </XStack>
          ))}
          {dateRanges.map((group) => (
            <DateRangeGroup
              key={group.fromKey}
              group={group}
              showHeading={false}
              from={draft[group.fromKey] ?? group.from}
              to={draft[group.toKey] ?? group.to}
              onSelect={select}
            />
          ))}
        </YStack>
      </BottomSheet>
    );
  }

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
                disabled={activeCount === 0}
                onPress={reset}
              />
            </YStack>
            <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
              <Button label={tActions('apply')} onPress={apply} />
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
        {onSearchChange ? (
          <SearchInput
            value={searchDraft}
            onChange={setSearchDraft}
            label={searchLabel}
            placeholder={searchPlaceholder}
            variant="boxed"
          />
        ) : null}

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

/** Figma "_Filter Modal": ô cách ô 12 (cả hai chiều), mỗi ô nửa hàng trừ nửa khe. */
const GRID_GAP = 12;

/** Gom các chiều thành từng HÀNG hai ô cho lưới của tấm v2. */
function pairsOf<T>(items: readonly T[]): (readonly [T] | readonly [T, T])[] {
  const rows: (readonly [T] | readonly [T, T])[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const first = items[i] as T;
    rows.push(i + 1 < items.length ? [first, items[i + 1] as T] : [first]);
  }
  return rows;
}
/** Figma "_Select input base": cao tối thiểu 40, đệm 14/8, bo 12, icon mũi tên 20. */
const SELECT_MIN_HEIGHT = FIELD_V2.height;
const SELECT_PAD_X = 14;
const SELECT_PAD_Y = 8;
const SELECT_ICON = 20;

/**
 * Một ô chọn của tấm dạng lưới: bấm mở tấm lựa chọn (cùng `MenuOption` với `SelectControl`), chọn
 * xong ghi vào BẢN NHÁP của tấm lọc - chưa áp tới khi bấm "Lưu bộ lọc".
 */
/** Nhãn phía trên ô (14 vừa, màu chữ chính, cách ô 6) - cùng kiểu FieldLabel của các ô nhập. */
function GridLabel({ text }: { text: string }) {
  const colors = useColors();
  return (
    <Text col={colors.text} fos={FIELD_V2.fontSize} lh={FIELD_V2.labelLineHeight} fow={fontWeight.medium} pb={FIELD_V2.labelGap}>
      {text}
    </Text>
  );
}

const GridSelect = memo(function GridSelect({
  group,
  value,
  onSelect,
}: {
  group: FilterSelectGroup;
  value: string;
  onSelect: (groupKey: string, value: string) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Common.filters');
  const [open, setOpen] = useState(false);
  const current = group.options.find((option) => option.value === value);
  const display = group.display ?? 'all';
  const showLabel = display === 'label' && (value === group.resetValue || !current);
  // "Tất cả + tên chiều" cho lựa chọn "không lọc" - mọi ô cùng một cách nói như "Tất cả chi nhánh".
  const optionLabel = (option: FilterOption): string =>
    display === 'all' && option.value === group.resetValue
      ? t('allOf', { label: group.label.toLocaleLowerCase('vi-VN') })
      : option.label;
  return (
    <>
      {group.labelAbove ? <GridLabel text={group.label} /> : null}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={current ? `${group.label}: ${optionLabel(current)}` : group.label}
      >
        {({ pressed }) => (
          <XStack
            ai="center"
            gap={space.sm}
            minHeight={SELECT_MIN_HEIGHT}
            px={SELECT_PAD_X}
            py={SELECT_PAD_Y}
            br={radius.control}
            bw={1}
            bc={colors.borderInput}
            bg={colors.surface}
            opacity={pressed ? 0.7 : 1}
          >
            <Text
              f={1}
              minWidth={0}
              col={colors.text}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {display === 'prefixed' ? (
                <Text col={colors.placeholder}>{`${group.label}: `}</Text>
              ) : null}
              {showLabel ? group.label : current ? optionLabel(current) : group.label}
            </Text>
            <LineIcon name="chevron-down" size={SELECT_ICON} color={colors.placeholder} />
          </XStack>
        )}
      </Pressable>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={group.label} chrome="v2" headerDivider>
        <MenuOptionList>
          {group.options.map((option) => (
            <MenuOption
              key={option.value}
              label={optionLabel(option)}
              selected={option.value === value}
              onPress={() => {
                onSelect(group.key, option.value);
                setOpen(false);
              }}
            />
          ))}
        </MenuOptionList>
      </BottomSheet>
    </>
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
  const colors = useColors();
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
  showHeading = true,
}: {
  group: FilterDateRangeGroup;
  from: string;
  to: string;
  onSelect: (groupKey: string, value: string) => void;
  /** Tấm lưới v2 (Figma) không có tiêu đề nhóm - ô đã tự nói "Từ ngày → Đến ngày". */
  showHeading?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Common.labels');
  const tRange = useTranslations('Common.components.dateRange');
  const tActions = useTranslations('Common.actions');

  return (
    <YStack gap={showHeading ? space.sm : 0}>
      {showHeading ? (
        <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {group.label}
        </Text>
      ) : group.labelAbove ? (
        <GridLabel text={group.label} />
      ) : null}

      {/* Ô khoảng ngày DÙNG CHUNG (`DateRangeField`) - hai ô ngày cạnh nhau vỡ ở bề ngang điện thoại. */}
      <FieldAppearanceProvider value="v2">
        <DateRangeField
          allowFuture
          autoAdvance={group.autoAdvance ?? false}
          value={{ from: from || undefined, to: to || undefined }}
          onChange={(next) => {
            onSelect(group.fromKey, next.from ?? '');
            onSelect(group.toKey, next.to ?? '');
          }}
          labels={{
            field: group.label,
            from: tRange('fromDate'),
            to: tRange('toDate'),
            clear: tActions('clear'),
          }}
        />
      </FieldAppearanceProvider>
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
  const colors = useColors();
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
