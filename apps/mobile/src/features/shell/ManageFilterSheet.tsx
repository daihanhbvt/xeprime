import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { SearchInput } from '@/components/ui/SearchInput';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Một chiều lọc: nhãn + các lựa chọn + giá trị đang chọn.
 *
 * Mỗi nhóm là ĐƠN CHỌN — đúng những gì DTO backend nhận (`status`, `serviceType`, `sort` đều là
 * một giá trị). Nhóm nào cần đa chọn thì phải sửa cả DTO trước, không mở ở tầng giao diện.
 */
export interface FilterGroup {
  readonly key: string;
  readonly label: string;
  readonly options: readonly FilterOption[];
  readonly value: string;
  /** Giá trị coi là "không lọc" — dùng để đếm số bộ lọc đang bật. */
  readonly resetValue: string;
}

/** Số chiều đang khác mặc định — hiện trên nút lọc để biết có gì đang bật mà không phải mở ra. */
export function activeFilterCount(groups: readonly FilterGroup[]): number {
  return groups.filter((group) => group.value !== group.resetValue).length;
}

/** Nháp = giá trị đang chọn của từng chiều, gom theo `key`. */
type Draft = Record<string, string>;

const draftFrom = (groups: readonly FilterGroup[]): Draft =>
  Object.fromEntries(groups.map((group) => [group.key, group.value]));

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

  /** Các chiều đang khác mặc định TRONG NHÁP — nguồn của dải chip tóm tắt và của số đếm. */
  const active = groups.filter((group) => (draft[group.key] ?? group.value) !== group.resetValue);
  const searchActive = searchDraft.trim().length > 0;
  const activeCount = active.length + (searchActive ? 1 : 0);

  const apply = () => {
    // Chỉ gọi cho chiều THỰC SỰ đổi: mỗi lần gọi là một lần nơi gọi đặt lại trang về 1.
    for (const group of groups) {
      const next = draft[group.key] ?? group.value;
      if (next !== group.value) onChange(group.key, next);
    }
    if (searchDraft !== searchValue) onSearchChange(searchDraft);
    onClose();
  };

  const reset = () => {
    setDraft(Object.fromEntries(groups.map((group) => [group.key, group.resetValue])));
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
                    key={group.key}
                    label={t('chip', {
                      label: group.label,
                      value:
                        group.options.find(
                          (option) => option.value === (draft[group.key] ?? group.value),
                        )?.label ?? '',
                    })}
                    onRemove={() => select(group.key, group.resetValue)}
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

        {groups.map((group) => (
          <Group
            key={group.key}
            group={group}
            value={draft[group.key] ?? group.value}
            onSelect={select}
          />
        ))}
      </YStack>
    </BottomSheet>
  );
});

const Group = memo(function Group({
  group,
  value,
  onSelect,
}: {
  group: FilterGroup;
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
