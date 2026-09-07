import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, TextInput, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { normalizeProvinceAlias } from '@xeprime/types';
import type { PublicDestination } from '@xeprime/types';
import { ListRowSkeleton } from '@/components/ui/Skeleton';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { layout } from '@/theme/layout';
import { appStyles } from '@/theme/styles';
import {
  colors,
  fieldFontSize,
  fontSize,
  fontWeight,
  iconSize,
  radius,
  sizing,
  space,
} from '@/theme/tokens';
import { useSearchExperience } from '../search-context';
import { SectionError } from './SectionError';

/** Số địa điểm phổ biến — cùng con số với web (`search/LocationPicker.tsx`). */
const POPULAR_COUNT = 6;

/** Tấm trượt chiếm 3/4 chiều cao: chừa lại phần trên để thấy mình vẫn đang ở trang chủ. */
const SHEET_RATIO = 0.75;

type RowIcon = 'globe-outline' | 'location-outline';

interface LocationPickerProps {
  open: boolean;
  onClose: () => void;
  /** Chuỗi rỗng = Toàn quốc — cùng quy ước với `SearchDraft.provinceCode`. */
  onSelect: (provinceCode: string) => void;
}

/**
 * Chọn tỉnh/thành nhận xe — bản native của `search/LocationPicker.tsx`.
 *
 * Giữ nguyên ba nhóm của web: **Địa điểm phổ biến** (6 tỉnh nhiều xe nhất), **Toàn quốc**, và
 * **Tất cả tỉnh/thành**. Nhóm phổ biến biến mất khi đang gõ tìm — lúc đó danh sách đã lọc rồi,
 * một dải "phổ biến" không liên quan tới truy vấn chỉ làm nhiễu.
 *
 * Danh sách tỉnh đọc từ ngữ cảnh tìm kiếm (đã nạp sẵn cho cả thẻ hero lẫn thanh thu gọn), nên
 * mở bộ chọn KHÔNG tạo thêm request. Nguồn là `/public/destinations`: CHỈ tỉnh đang thực sự có
 * xe — app không có danh sách tỉnh riêng, nên tỉnh bị admin ẩn biến mất khỏi cả hai client.
 */
export function LocationPicker({ open, onClose, onSelect }: LocationPickerProps) {
  const t = useTranslations('HomeSearch.location');
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const { draft, destinations, destinationsLoading, destinationsError } = useSearchExperience();

  const selectedCode = draft.provinceCode;

  /*
   * Tra KHÔNG DẤU qua `normalizeProvinceAlias` — cùng hàm web dùng, và cũng là hàm backend dùng
   * để quy tên tỉnh về mã. Gõ "da nang" hay "Đà Nẵng" hay "TP Đà Nẵng" đều phải ra một kết quả;
   * so chuỗi thô thì người không gõ dấu không tìm được gì, và "ho" sẽ không ra "Hải Phòng".
   */
  const normalizedQuery = normalizeProvinceAlias(query);

  const matches = useMemo(() => {
    const all = destinations ?? [];
    if (!normalizedQuery) return all;
    return all.filter((item) =>
      normalizeProvinceAlias(item.provinceName).includes(normalizedQuery),
    );
  }, [destinations, normalizedQuery]);

  // Đang gõ tìm thì không có nhóm phổ biến — giống web.
  const popular = normalizedQuery ? [] : matches.slice(0, POPULAR_COUNT);

  // "Toàn quốc" cũng là một lựa chọn tìm được: gõ "toan" phải thấy nó, gõ "ha noi" thì không.
  const nationwideLabel = t('nationwide');
  const showNationwide =
    !normalizedQuery || normalizeProvinceAlias(nationwideLabel).includes(normalizedQuery);

  const pick = useCallback(
    (provinceCode: string) => {
      onSelect(provinceCode);
      setQuery('');
      onClose();
    },
    [onSelect, onClose],
  );

  /*
   * Giữ nguyên THAM CHIẾU: danh sách là cả 63 tỉnh, và mỗi ký tự gõ vào ô tìm là một lần render.
   * Một `renderItem` mới mỗi lần gõ là một lần FlatList vẽ lại toàn bộ hàng đang hiển thị.
   */
  const renderProvince = useCallback(
    ({ item }: { item: PublicDestination }) => (
      <Row
        icon="location-outline"
        title={item.provinceName}
        count={t('vehicleCount', { count: item.vehicleCount })}
        selected={selectedCode === item.provinceCode}
        onPress={() => pick(item.provinceCode)}
      />
    ),
    [selectedCode, pick, t],
  );

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      {/*
        Lớp phủ chỉ chiếm phần TRÊN tấm trượt, và tấm trượt là anh em chứ không phải con của nó.

        Trước đây tấm trượt nằm TRONG một `Pressable` (để chặn cú chạm lọt xuống lớp phủ) — và
        chính `Pressable` đó nuốt cử chỉ kéo, làm danh sách bên trong gần như không kéo được.
        Tách ra thì chạm vào tấm trượt không bao giờ tới lớp phủ, mà cũng chẳng có gì chặn cuộn.
      */}
      <YStack f={1}>
        <Pressable style={appStyles.scrim} onPress={onClose} />
        <YStack>
          <YStack
            h={height * SHEET_RATIO}
            bg={colors.surface}
            borderTopLeftRadius={radius.lg}
            borderTopRightRadius={radius.lg}
            pb={insets.bottom}
          >
            <YStack
              w={40}
              h={4}
              br={radius.pill}
              bg={colors.border}
              alignSelf="center"
              mt={space.sm}
            />

            <XStack ai="center" gap={space.xs} px={space.sm} py={space.sm}>
              <IconButton icon="close" label={t('panelTitle')} onPress={onClose} />
              <Text f={1} col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                {t('panelTitle')}
              </Text>
            </XStack>

            <YStack px={layout.screenX} pb={space.sm}>
              <XStack
                ai="center"
                gap={space.sm}
                bg={colors.surfaceMuted}
                br={radius.md}
                bw={1}
                bc={colors.border}
                px={layout.screenX}
                minHeight={sizing.touchTarget}
              >
                <Ionicons name="search" size={iconSize.sm} color={colors.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t('searchPlaceholder')}
                  placeholderTextColor={colors.placeholder}
                  accessibilityLabel={t('searchAriaLabel')}
                  style={{
                    flex: 1,
                    color: colors.text,
                    fontSize: fieldFontSize.value,
                    minHeight: sizing.touchTarget,
                  }}
                />
              </XStack>
            </YStack>

            {destinationsError ? (
              <YStack px={layout.screenX}>
                <SectionError title={t('loadError')} error={destinationsError} />
              </YStack>
            ) : destinationsLoading ? (
              <YStack px={layout.screenX} gap={space.sm}>
                {Array.from({ length: 6 }, (_, i) => (
                  <ListRowSkeleton key={i} />
                ))}
              </YStack>
            ) : (
              <FlatList
                data={matches}
                keyExtractor={provinceKey}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                  paddingHorizontal: layout.screenX,
                  paddingBottom: space.lg,
                }}
                ListHeaderComponent={
                  <YStack gap={space.sm}>
                    {popular.length > 0 ? (
                      <YStack gap={space.sm}>
                        <GroupTitle>{t('popular')}</GroupTitle>
                        <XStack gap={space.xs} rowGap={space.xs} flexWrap="wrap">
                          {popular.map((item) => (
                            <Chip
                              key={item.provinceCode}
                              label={item.provinceName}
                              selected={selectedCode === item.provinceCode}
                              onPress={() => pick(item.provinceCode)}
                              size="sm"
                            />
                          ))}
                        </XStack>
                      </YStack>
                    ) : null}

                    {popular.length > 0 ? <GroupTitle>{t('all')}</GroupTitle> : null}

                    {showNationwide ? (
                      <Row
                        icon="globe-outline"
                        title={nationwideLabel}
                        hint={t('nationwideHint')}
                        selected={selectedCode === ''}
                        onPress={() => pick('')}
                      />
                    ) : null}
                  </YStack>
                }
                ListEmptyComponent={
                  // Không còn tỉnh nào VÀ cũng không có "Toàn quốc" thì mới thật sự là rỗng.
                  showNationwide ? null : (
                    <Text col={colors.textMuted} fos={fontSize.bodySm} py={space.md}>
                      {t('noMatch', { query: query.trim() })}
                    </Text>
                  )
                }
                renderItem={renderProvince}
              />
            )}
          </YStack>
        </YStack>
      </YStack>
    </Modal>
  );
}

function GroupTitle({ children }: { children: string }) {
  return (
    <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.semibold} pt={space.xs}>
      {children.toLocaleUpperCase()}
    </Text>
  );
}

/** Một dòng chọn. Mục đang chọn tô nền và có dấu tick — giống web. */
const provinceKey = (item: PublicDestination) => item.provinceCode;

function Row({
  icon,
  title,
  hint,
  count,
  selected,
  onPress,
}: {
  icon: RowIcon;
  title: string;
  hint?: string;
  count?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}>
      <XStack
        ai="center"
        gap={space.sm}
        px={space.sm}
        minHeight={sizing.touchTarget}
        br={radius.md}
        bg={selected ? colors.surfaceSelected : 'transparent'}
      >
        <Ionicons
          name={icon}
          size={17}
          color={selected ? colors.primaryActive : colors.textMuted}
        />
        <Text
          f={1}
          col={colors.text}
          fos={fieldFontSize.value}
          fow={selected ? fontWeight.semibold : fontWeight.regular}
          numberOfLines={1}
        >
          {title}
        </Text>
        {hint ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {hint}
          </Text>
        ) : null}
        {count ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {count}
          </Text>
        ) : null}
        {selected ? <Ionicons name="checkmark" size={17} color={colors.primaryActive} /> : null}
      </XStack>
    </Pressable>
  );
}
