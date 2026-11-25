import { useState } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { LineIcon } from '@/components/icons/LineIcon';
import { useTranslations } from 'use-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MenuOption, MenuOptionList } from '@/components/ui/MenuOption';
import { Pill } from '@/components/ui/Pill';
import { SelectTrigger } from '@/components/ui/SelectTrigger';
import { elevation } from '@/theme/elevation';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { buttonHeight, fontSize, fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import type { BranchFilterState } from '../hooks/use-branch-filter';
import type { FilterSelectGroup } from '@/features/shell/ManageFilterSheet';

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
  block = false,
  scope = false,
  select = false,
}: {
  filter: BranchFilterState;
  value: string | undefined;
  /**
   * Ô CHỌN rộng hết khổ thay viên lọc gọn - web `BranchFilterSelect` ở đầu Tổng quan khổ ≤640
   * (`DashboardView .branch { width: 100% }`): `Select` AntD cỡ thường (`buttonHeight.sm`), bo 10, chữ 14, không icon
   * tiền tố, mũi tên xuống bên phải.
   */
  block?: boolean;
  /**
   * Hàng PHẠM VI CHI NHÁNH của design v2 (Figma `24245:40148`, Tổng quan Partner): thẻ trắng bo 12,
   * đệm 8/12, quầng bóng "New/8-4"; ô icon bản đồ 32 nền vàng nhạt, nhãn 12/18 VIẾT HOA mờ, tên
   * phạm vi 14/20 đậm vừa + viên "N cơ sở" (khi xem tất cả), mũi tên xuống. Rộng hết khổ.
   */
  scope?: boolean;
  /**
   * Ô "Input - Select" gọn của Figma (Tổng quan doanh thu `24228:98932`): đứng cạnh ô kỳ trên
   * cùng một hàng, rộng theo khung cha.
   */
  select?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Branches');
  const [open, setOpen] = useState(false);
  const dark = useAppScheme().scheme === 'dark';
  if (!filter.visible) return null;

  const a11yLabel = `${t('filter.label')}: ${filter.currentLabel}`;
  const sheet = (
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
  );

  if (select) {
    return (
      <>
        <SelectTrigger
          label={filter.currentLabel}
          accessibilityLabel={a11yLabel}
          locked={filter.locked}
          onPress={() => setOpen(true)}
        />
        {filter.locked ? null : sheet}
      </>
    );
  }

  const pill = scope ? (
    <XStack
      ai="center"
      gap={SCOPE_GAP}
      px={SCOPE_PAD_X}
      py={SCOPE_PAD_Y}
      br={radius.control}
      bg={filter.locked ? colors.surfaceMuted : colors.surface}
      bw={1}
      bc={dark ? colors.border : colors.surface}
      style={dark ? undefined : elevation.ambient}
    >
      <YStack w={SCOPE_ICON_BOX} h={SCOPE_ICON_BOX} br={SCOPE_ICON_RADIUS} bg={colors.brandLow} ai="center" jc="center">
        <LineIcon name="map" color={colors.brandShape} size={SCOPE_ICON} />
      </YStack>
      <YStack f={1} minWidth={0} gap={2}>
        <Text
          col={colors.textPlaceholder}
          fos={typeScale.label.fontSize}
          lh={typeScale.label.lineHeight}
          fow={fontWeight.semibold}
          textTransform="uppercase"
          numberOfLines={1}
        >
          {t('filter.scopeTitle')}
        </Text>
        <XStack ai="center" gap={SCOPE_VALUE_GAP} minWidth={0}>
          <Text
            flexShrink={1}
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.semibold}
            numberOfLines={1}
          >
            {filter.currentLabel}
          </Text>
          {/* Số cơ sở chỉ nói khi đang xem TẤT CẢ - đọc từ chính danh sách lựa chọn của ô lọc. */}
          {!filter.locked && !value ? (
            <Pill label={t('filter.count', { count: filter.options.length })} tone="brandSoft" borderless />
          ) : null}
        </XStack>
      </YStack>
      {filter.locked ? (
        <Ionicons name="lock-closed-outline" size={iconSize.sm} color={colors.textPlaceholder} />
      ) : (
        <YStack w={SCOPE_CHEVRON_BOX} h={SCOPE_CHEVRON_BOX} ai="center" jc="center">
          <LineIcon name="chevron-down" color={colors.textPlaceholder} />
        </YStack>
      )}
    </XStack>
  ) : block ? (
    <XStack
      ai="center"
      jc="space-between"
      gap={space.sm}
      minHeight={buttonHeight.sm}
      px={BLOCK_PAD_X}
      bg={filter.locked ? colors.surfaceMuted : colors.surface}
      bw={1}
      bc={colors.borderInput}
      br={radius.md}
      alignSelf="stretch"
    >
      <Text
        f={1}
        col={filter.locked ? colors.textMuted : colors.text}
        fos={fontSize.body}
        numberOfLines={1}
      >
        {filter.currentLabel}
      </Text>
      <Ionicons
        name={filter.locked ? 'lock-closed-outline' : 'chevron-down'}
        size={iconSize.xs}
        color={colors.placeholder}
      />
    </XStack>
  ) : (
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
      <XStack
        accessible
        accessibilityLabel={a11yLabel}
        accessibilityState={{ disabled: true }}
        {...(block ? { alignSelf: 'stretch' as const } : scope ? { alignSelf: 'stretch' as const } : {})}
      >
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
        style={({ pressed }) => [block ? styles.block : scope ? styles.block : styles.pill, pressed ? styles.pressed : null]}
      >
        {pill}
      </Pressable>

      {sheet}
    </>
  );
}

/** Khoá của chiều "Chi nhánh" trong tấm lọc của khung danh sách. */
export const BRANCH_FILTER_GROUP_KEY = 'branchId';

/**
 * Chiều "Chi nhánh" dạng NHÓM LỌC - web `branch.field` nằm trong `FilterBar`, nên ở khổ ≤640 nó
 * vào tấm "Lọc" cùng các ô khác chứ không đứng riêng trên màn. `null` khi ô không hiện. Chế độ
 * khoá: một lựa chọn duy nhất (chi nhánh của người đó), không có mục "Tất cả".
 */
export function useBranchFilterGroup(
  filter: BranchFilterState | undefined,
  value: string | undefined,
): FilterSelectGroup | null {
  const t = useTranslations('Branches');
  if (!filter?.visible) return null;
  if (filter.locked) {
    const only = value ?? filter.options[0]?.value ?? ALL;
    return {
      key: BRANCH_FILTER_GROUP_KEY,
      label: t('filter.label'),
      options: filter.options,
      value: only,
      resetValue: only,
      display: 'option',
    };
  }
  return {
    key: BRANCH_FILTER_GROUP_KEY,
    label: t('filter.label'),
    options: [{ value: ALL, label: t('scope.all') }, ...filter.options],
    value: value ?? ALL,
    resetValue: ALL,
    // "Tất cả chi nhánh" tự nói đủ - ô của tấm lọc v2 hiện nhãn lựa chọn, không phải tên chiều.
    display: 'option',
  };
}

/** Áp lựa chọn của nhóm chi nhánh từ tấm lọc vào bộ lọc của màn. */
export function applyBranchFilterGroup(filter: BranchFilterState, next: string): void {
  filter.select(next === ALL ? undefined : next);
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
  block: { alignSelf: 'stretch' },
  pressed: { opacity: 0.7 },
});

/** AntD `Select` cỡ thường: đệm ngang 11 (`paddingSM` 12 trừ viền 1). */
const BLOCK_PAD_X = 11;
/** Figma `24245:40148`: `px 12 · py 8 · gap 12`, ô icon 32 bo 8 quanh icon 20, mũi tên 20. */
const SCOPE_PAD_X = 12;
const SCOPE_PAD_Y = 8;
const SCOPE_GAP = 12;
const SCOPE_ICON_BOX = 32;
const SCOPE_ICON_RADIUS = 8;
const SCOPE_ICON = 20;
const SCOPE_VALUE_GAP = 8;
const SCOPE_CHEVRON_BOX = 20;
