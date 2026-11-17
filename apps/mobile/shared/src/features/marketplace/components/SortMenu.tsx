import { Ionicons } from '@/components/icons/Ionicons';
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
import { elevation } from '@/theme/elevation';
import { useAppStyles } from '@/theme/styles';
import { useColors, useFloatingSurfaceBorder } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { modalColumn } from '@/theme/layout';

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
  const appStyles = useAppStyles();
  const colors = useColors();
  const floatingBorder = useFloatingSurfaceBorder();
  const t = useTranslations('Marketplace.results');
  const domainLabel = useDomainLabel();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const current = value ?? DEFAULT_LISTING_SORT;
  const labelOf = (key: ListingSort) => domainLabel('listingSort', key, LISTING_SORT_LABEL[key]);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('sortAriaLabel')}
      >
        {/*
          Ô chọn của hàng "Sắp xếp" — Figma `19771:64258`: nền surface, viền `color-border`, bo
          control 12, đệm 14 × 8, chữ body-lg 16 thường, mũi tên 20, rộng tối thiểu 176.
        */}
        <XStack
          ai="center"
          gap={space.sm}
          bw={1}
          bc={colors.border}
          // `block` (trong tấm Bộ lọc) = CÙNG hình ô "Địa điểm / Thời gian thuê" của tấm đó (`ContextField`):
          // nền `surface`, bo control, đệm 14, cao 40. Nền `surfaceMuted` cũ trùng màu nền tấm nên ô chìm.
          bg={colors.surface}
          br={radius.control}
          px={14}
          {...(block ? {} : { minWidth: SELECT_MIN_WIDTH, style: elevation.xs })}
          minHeight={block ? 40 : sizing.touchTarget - 8}
        >
          {/*
            Một dòng, không co: "Giá thấp → cao" từng gãy hai dòng vì ô chỉ rộng theo khung tối
            thiểu. Ô tự nở theo nhãn; bản `block` mới chiếm phần còn lại của hàng.
          */}
          <Text
            {...(block ? { f: 1 } : { flexShrink: 0 })}
            numberOfLines={1}
            col={colors.text}
            fos={block ? fontSize.body : fontSize.bodyLg}
            fow={fontWeight.regular}
          >
            {labelOf(current)}
          </Text>
          <Ionicons
            name="chevron-down"
            size={block ? iconSize.xs : SELECT_CHEVRON}
            color={colors.textMuted}
          />
        </XStack>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Lớp phủ là ANH EM của tấm menu — bọc ngoài thì nó nuốt luôn cú chạm chọn mục. */}
        <YStack f={1}>
          <Pressable style={appStyles.scrim} onPress={() => setOpen(false)} />
          <YStack
            style={modalColumn}
            bg={colors.surface}
            borderTopLeftRadius={radius.lg}
            borderTopRightRadius={radius.lg}
            {...floatingBorder}
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
                        <Ionicons name="checkmark" size={iconSize.md} color={colors.primary} />
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
/** Ô chọn ở hàng "Sắp xếp" của Figma: rộng 176, mũi tên 20. */
const SELECT_MIN_WIDTH = 176;
const SELECT_CHEVRON = 20;
