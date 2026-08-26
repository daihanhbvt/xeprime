import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { serviceUsesRentalRange } from '@xeprime/domain';
import type { Dayjs } from '@xeprime/domain';
import { useDatePickerPattern } from '@/i18n/use-app-format';
import { elevation } from '@/theme/elevation';
import { colors, fontSize, radius, sizing, space } from '@/theme/tokens';
import { useSearchExperience } from '../search-context';
import { LocationPicker } from './LocationPicker';
import { RentalRangeSheet } from './RentalRangeSheet';

/**
 * Chiều cao ô bấm bên trong thanh — thấp hơn sàn 44pt để thanh không ăn quá nhiều chiều dọc
 * khi đang cuộn. Vùng CHẠM vẫn đủ chuẩn nhờ `hitSlop` bù đúng phần thiếu.
 */
const CONTROL_HEIGHT = 38;
const TOUCH_SLOP = Math.ceil((sizing.touchTarget - CONTROL_HEIGHT) / 2);

/** Chiều cao thanh — cần biết trước để trượt nó ra khỏi màn hình thay vì tháo khỏi cây. */
export const STICKY_BAR_HEIGHT = CONTROL_HEIGHT + space.sm * 2;

/**
 * Thanh tìm kiếm thu gọn — bản native của `search/StickySearchBar.tsx`.
 *
 * Hiện ra khi thẻ tìm kiếm ở hero đã cuộn khuất, để ngữ cảnh đang xem (địa điểm · khoảng thuê)
 * luôn nhìn thấy được và sửa được mà không phải cuộn ngược lên.
 *
 * Thanh LUÔN nằm trong cây, chỉ trượt lên/xuống bằng `translateY`: gắn/tháo theo điều kiện làm
 * nó bật ra rồi biến mất đột ngột, và mỗi lần gắn lại là một lần dựng lại `LocationPicker` bên
 * trong. Hoạt cảnh chạy trên luồng UI của Reanimated nên không giật khi danh sách đang cuộn.
 *
 * CHỈ có địa điểm và khoảng thuê — **cố ý không** mang chip loại xe / dịch vụ / lộ trình như
 * thanh thu gọn của web. Bề ngang điện thoại không đủ cho năm ô, và nhồi thêm hai chip nữa thì
 * ô ngày (thứ hay phải sửa nhất) bị bóp còn vài ký tự. Đổi loại xe hay dịch vụ là quyết định
 * đứng TRÊN, làm ở thẻ hero; nó không thuộc thanh liếc nhanh này.
 *
 * Đọc/ghi CÙNG `useSearchExperience` với thẻ hero — không có state thứ hai, nên hai thanh không
 * thể nói hai điều khác nhau.
 */
export function StickySearchBar({
  onSubmit,
  progress,
}: {
  onSubmit: () => void;
  progress: SharedValue<number>;
}) {
  const t = useTranslations('HomeSearch');
  const pattern = useDatePickerPattern();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const { draft, setProvinceCode, setRentalRange, setRentalMode, provinceLabel } =
    useSearchExperience();

  const locationValue = provinceLabel(draft.provinceCode);
  const usesRange = serviceUsesRentalRange(draft.serviceType);

  /**
   * Chỉ NGÀY — bỏ thứ và giờ.
   *
   * Thanh thu gọn chỉ có một dòng cho cả hai mốc; giữ "T4, 26/08 · 10:00" thì cả hai đầu đều bị
   * cắt thành "T4, 26/08 · 03:…", mất đúng phần cần liếc. Mẫu ngày lấy theo ngôn ngữ
   * (`DD/MM` vi · `MM/DD` en), không gõ cứng.
   */
  const day = (value: Dayjs | null) => (value ? value.format(pattern.dayMonth) : '');

  // `progress` 0 = ẩn hoàn toàn phía trên, 1 = hiện đủ. Nội suy thẳng chứ không dùng cờ boolean:
  // thanh bám theo ngón tay thay vì nhảy nấc khi vượt ngưỡng.
  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (progress.value - 1) * STICKY_BAR_HEIGHT }],
    opacity: progress.value,
  }));

  return (
    <Animated.View style={[{ backgroundColor: colors.surface }, elevation.card, barStyle]}>
      {/*
        Kẻ trên + kẻ dưới + bóng: header, thanh này và nội dung đều nền sáng — thiếu ranh giới
        thì ba vùng dính thành một mảng, không đọc ra đâu là thanh điều khiển.
      */}
      <XStack
        ai="center"
        gap={space.xs}
        px={space.md}
        py={space.sm}
        h={STICKY_BAR_HEIGHT}
        borderTopWidth={1}
        borderBottomWidth={1}
        bc={colors.border}
        accessibilityLabel={t('card.stickyLabel')}
      >
        {/*
          Địa điểm co theo NỘI DUNG (`flexShrink`), không chiếm nửa thanh: "Toàn quốc" chỉ 9 ký
          tự, cho nó `flex: 1` thì nó phình ra trong khi ô ngày ngay cạnh lại thiếu chỗ.
        */}
        <Pressable
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          hitSlop={{ top: TOUCH_SLOP, bottom: TOUCH_SLOP }}
          style={{ flexShrink: 1 }}
        >
          <XStack
            ai="center"
            gap={4}
            bg={colors.surfaceMuted}
            br={radius.pill}
            bw={1}
            bc={colors.border}
            px={space.sm}
            h={CONTROL_HEIGHT}
          >
            <Ionicons name="location-outline" size={14} color={colors.primaryActive} />
            <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
              {locationValue}
            </Text>
          </XStack>
        </Pressable>

        {/* Dài hạn không có khoảng ngày (ADR 0011) — thanh thu gọn cũng không bịa ra một cái. */}
        {usesRange ? (
          <Pressable
            onPress={() => setRangeOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('rental.label')}
            hitSlop={{ top: TOUCH_SLOP, bottom: TOUCH_SLOP }}
            style={{ flex: 1 }}
          >
          <XStack
            ai="center"
            jc="center"
            gap={4}
            bg={colors.surfaceMuted}
            br={radius.pill}
            bw={1}
            bc={colors.border}
            px={space.sm}
            h={CONTROL_HEIGHT}
          >
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
            <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
              {day(draft.rental.pickupAt)}
            </Text>
            <Ionicons name="arrow-forward" size={11} color={colors.textMuted} />
            <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
              {day(draft.rental.returnAt)}
            </Text>
          </XStack>
          </Pressable>
        ) : null}

        <Pressable
          onPress={onSubmit}
          accessibilityRole="button"
          accessibilityLabel={t('card.submit')}
          hitSlop={{ top: TOUCH_SLOP, bottom: TOUCH_SLOP }}
        >
          <XStack
            w={CONTROL_HEIGHT}
            h={CONTROL_HEIGHT}
            br={radius.pill}
            bg={colors.primary}
            ai="center"
            jc="center"
          >
            <Ionicons name="search" size={16} color={colors.onPrimary} />
          </XStack>
        </Pressable>

        {/*
          Chọn xong là TÌM luôn — thanh thu gọn chỉ hiện khi khách đang xem kết quả, nên sửa
          ngữ cảnh ở đây tức là muốn kết quả đổi theo ngay, không phải sửa để đó.
        */}
        <LocationPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(code) => {
            setProvinceCode(code);
            onSubmit();
          }}
        />

        <RentalRangeSheet
          open={rangeOpen}
          value={draft.rental}
          mode={draft.rental.mode}
          onChange={setRentalRange}
          onModeChange={setRentalMode}
          onApply={() => {
            onSubmit();
            setRangeOpen(false);
          }}
          onCancel={() => setRangeOpen(false)}
        />
      </XStack>
    </Animated.View>
  );
}

/**
 * Mốc cuộn mà thẻ tìm kiếm ở hero coi như đã khuất.
 *
 * Web dùng `IntersectionObserver` trên chính thẻ đó; native không có API tương đương nên đo bằng
 * offset cuộn. Con số là chiều cao hero (tỉ lệ 780×390 ≈ nửa bề rộng) — tính từ bề rộng màn hình
 * để máy nhỏ và máy lớn đổi thanh ở cùng một chỗ trong bố cục.
 */
export function stickyThreshold(screenWidth: number): number {
  return screenWidth / (780 / 390);
}

