import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MenuOption, MenuOptionList } from '@/components/ui/MenuOption';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { BranchFilterState } from '../hooks/use-branch-filter';

/** Sentinel của mục "Tất cả chi nhánh" — danh sách lựa chọn cần một khoá, `undefined` thì không. */
const ALL = '__all__';

const HIT_SLOP = { top: 12, bottom: 12, left: space.sm, right: space.sm } as const;

/**
 * Ô "Chi nhánh" trong thanh lọc của TỪNG màn — bản native của ô `branchId` trên `FilterBar` web
 * (ADR 0052). Không hiện gì khi `filter.visible` sai (thiếu quyền, gian hàng ≤ 1 chi nhánh).
 *
 * Chế độ KHOÁ (`filter.locked`): hiện tên chi nhánh duy nhất người này được xem, không bấm được,
 * không có mục "Tất cả" — với họ không có "tất cả" nào ngoài chi nhánh của mình.
 */
export function BranchFilterField({
  filter,
  value,
}: {
  filter: BranchFilterState;
  value: string | undefined;
}) {
  const t = useTranslations('Branches');
  const [open, setOpen] = useState(false);
  if (!filter.visible) return null;

  const a11yLabel = `${t('filter.label')}: ${filter.currentLabel}`;
  const pill = (
    <XStack
      ai="center"
      gap={space.xs}
      bg={filter.locked ? colors.surfaceMuted : value ? colors.primaryLight : colors.surface}
      bw={1}
      bc={value && !filter.locked ? colors.primary : colors.border}
      br={radius.pill}
      px={space.sm}
      py={space.xs}
      alignSelf="flex-start"
      maxWidth="100%"
    >
      <Ionicons
        name={filter.locked ? 'lock-closed-outline' : 'location-outline'}
        size={iconSize.xs}
        color={filter.locked ? colors.textMuted : colors.primaryActive}
      />
      <Text
        flexShrink={1}
        col={filter.locked ? colors.textMuted : colors.text}
        fos={fontSize.label}
        fow={fontWeight.medium}
        numberOfLines={1}
      >
        {filter.currentLabel}
      </Text>
      {filter.locked ? null : (
        <Ionicons name="chevron-down" size={iconSize.xs} color={colors.textMuted} />
      )}
    </XStack>
  );

  if (filter.locked) {
    return (
      <XStack accessible accessibilityLabel={a11yLabel} accessibilityState={{ disabled: true }}>
        {pill}
      </XStack>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        hitSlop={HIT_SLOP}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.pill, pressed ? styles.pressed : null]}
      >
        {pill}
      </Pressable>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('filter.label')}>
        <MenuOptionList>
          {[{ value: ALL, label: t('scope.all') }, ...filter.options].map((option) => (
            <MenuOption
              key={option.value}
              label={option.label}
              selected={option.value === (value ?? ALL)}
              onPress={() => {
                filter.select(option.value === ALL ? undefined : option.value);
                setOpen(false);
              }}
            />
          ))}
        </MenuOptionList>
      </BottomSheet>
    </>
  );
}

/**
 * Chữ của trạng thái RỖNG khi đang lọc một chi nhánh (`Branches.filter.empty`/`emptyHint`).
 * `null` khi không lọc — màn dùng câu rỗng thường của nó.
 */
export function useBranchEmptyCopy(
  filter: BranchFilterState,
  value: string | undefined,
): { title: string; hint: string } | null {
  const t = useTranslations('Branches');
  if (!value || !filter.selectedLabel || filter.locked) return null;
  return {
    title: t('filter.empty', { branch: filter.selectedLabel }),
    hint: t('filter.emptyHint'),
  };
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', maxWidth: '100%' },
  pressed: { opacity: 0.7 },
});
