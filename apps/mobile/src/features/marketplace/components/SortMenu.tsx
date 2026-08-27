import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DEFAULT_LISTING_SORT,
  LISTING_SORT_LABEL,
  LISTING_SORT_VALUES,
  type ListingSort,
} from '@xeprime/types';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';

/**
 * Bộ chọn thứ tự sắp xếp — **menu**, không phải hàng chip.
 *
 * Web dùng `Select` của AntD: một ô hiện lựa chọn đang dùng ("Gợi ý"), bấm ra danh sách. Trải
 * các lựa chọn thành chip thì chiếm trọn một hàng cho một chiều mà đa số người dùng không đổi,
 * và đọc nhầm thành bộ lọc — trong khi sắp xếp chỉ có DUY NHẤT một giá trị tại một thời điểm.
 */
export function SortMenu({
  value,
  onChange,
  block = false,
}: {
  /** `undefined` = đang dùng giá trị mặc định. */
  value: ListingSort | undefined;
  /** Nhận `undefined` khi người dùng chọn lại giá trị mặc định. */
  onChange: (next: ListingSort | undefined) => void;
  /** Chiếm trọn bề ngang, bo góc vuông hơn — dạng ô nhập trong tấm Bộ lọc. */
  block?: boolean;
}) {
  const t = useTranslations('Marketplace.results');
  const domainLabel = useDomainLabel();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const current = value ?? DEFAULT_LISTING_SORT;
  const labelOf = (key: ListingSort) =>
    domainLabel('listingSort', key, LISTING_SORT_LABEL[key]);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('sortAriaLabel')}
      >
        <XStack
          ai="center"
          gap={space.xs}
          bw={1}
          bc={colors.border}
          bg={block ? colors.surfaceMuted : 'transparent'}
          br={block ? radius.md : radius.pill}
          px={space.md}
          minHeight={sizing.touchTarget - 8}
        >
          {block ? null : <Ionicons name="swap-vertical-outline" size={15} color={colors.text} />}
          <Text
            {...(block ? { f: 1 } : {})}
            col={colors.text}
            fos={fontSize.bodySm}
            fow={fontWeight.medium}
          >
            {labelOf(current)}
          </Text>
          <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
        </XStack>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Lớp phủ là ANH EM của tấm menu — bọc ngoài thì nó nuốt luôn cú chạm chọn mục. */}
        <YStack f={1}>
          <Pressable
            style={{ flex: 1, backgroundColor: colors.overlay }}
            onPress={() => setOpen(false)}
          />
          <YStack
            bg={colors.surface}
            borderTopLeftRadius={radius.lg}
            borderTopRightRadius={radius.lg}
            pb={insets.bottom}
          >
            <XStack px={layoutX} py={space.sm} borderBottomWidth={1} bc={colors.borderSubtle}>
              <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
                {t('sortLabel')}
              </Text>
            </XStack>

            <ScrollView>
              {LISTING_SORT_VALUES.map((option) => {
                const active = option === current;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      // Giá trị mặc định KHÔNG ghi vào ngữ cảnh — nó là mặc định, không phải lựa chọn.
                      onChange(option === DEFAULT_LISTING_SORT ? undefined : option);
                      setOpen(false);
                    }}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: active }}
                  >
                    <XStack
                      ai="center"
                      gap={space.sm}
                      px={layoutX}
                      minHeight={sizing.touchTarget}
                      bg={active ? colors.primaryLight : 'transparent'}
                    >
                      <Text
                        f={1}
                        col={colors.text}
                        fos={fontSize.body}
                        fow={active ? fontWeight.semibold : fontWeight.regular}
                      >
                        {labelOf(option)}
                      </Text>
                      {active ? (
                        <Ionicons name="checkmark" size={18} color={colors.primary} />
                      ) : null}
                    </XStack>
                  </Pressable>
                );
              })}
            </ScrollView>
          </YStack>
        </YStack>
      </Modal>
    </>
  );
}

const layoutX = space.md;
