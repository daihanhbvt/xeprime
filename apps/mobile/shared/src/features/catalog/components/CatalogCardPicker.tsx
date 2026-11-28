import { Ionicons } from '@/components/icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { LineIcon } from '@/components/icons/LineIcon';
import { elevation } from '@/theme/elevation';
import { Text, XStack, YStack } from 'tamagui';
import type { CatalogItem } from '@/api/catalog';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { BODY_TYPE_ART } from '../body-type-art';

/**
 * Chiều cao CỐ ĐỊNH của mọi thẻ.
 *
 * Để thẻ tự co theo nội dung thì mục có mô tả cao hơn mục không có, và cả lưới thành răng cưa.
 * Chiều cao này chừa đủ cho ảnh, một dòng nhãn và mô tả HAI dòng — cột hẹp nên
 * "7 chỗ · gầm cao · 2 xe" không thể vừa một dòng, mà cắt "…" thì mất luôn số xe ở cuối.
 */
const CARD_HEIGHT = 134;

/**
 * Bộ chọn danh mục dạng THẺ CÓ ẢNH — bản native của `CatalogCardPicker` bên web.
 *
 * Kiểu dáng xe là thứ người ta nhận ra bằng hình chứ không bằng chữ: "CUV" và "MPV" đọc lên gần
 * như nhau, nhìn hình thì khác hẳn. Lưới BA cột như web; nhãn và mô tả được phép xuống dòng thay
 * vì cắt cụt.
 */
export function CatalogCardPicker({
  items,
  value,
  onChange,
  countOf,
  countSuffix,
  ariaLabel,
}: {
  items: readonly CatalogItem[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** Số xe khớp cho từng mục. `undefined` = facet chưa tải xong, ẩn số. */
  countOf?: (key: string) => number | undefined;
  countSuffix?: string;
  ariaLabel: string;
}) {
  const colors = useColors();
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);

  return (
    <XStack flexWrap="wrap" gap={space.sm} rowGap={space.sm} accessibilityLabel={ariaLabel}>
      {items.map((item) => {
        const active = value.includes(item.key);
        const count = countOf?.(item.key);
        const art = BODY_TYPE_ART[item.key];
        const meta = [
          item.description,
          count !== undefined && countSuffix ? `${count} ${countSuffix}` : null,
        ]
          .filter(Boolean)
          .join(LIST_SEPARATOR);

        return (
          <Pressable
            key={item.key}
            onPress={() => toggle(item.key)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            accessibilityLabel={item.label}
            // Ba cột: chừa chỗ cho hai khe rồi giãn ra lấp nốt phần lẻ.
            style={{ flexBasis: '30%', flexGrow: 1 }}
          >
            <YStack
              ai="center"
              jc="center"
              gap={2}
              h={CARD_HEIGHT}
              px={space.xs}
              br={radius.md}
              bw={1}
              bc={active ? colors.primary : colors.border}
              bg={active ? colors.primaryLight : colors.surface}
            >
              {art ? (
                <Image source={art} style={{ width: 60, height: 30 }} resizeMode="contain" />
              ) : (
                // Mục chưa có ảnh — glyph trung tính, KHÔNG mượn hình của mục khác.
                <YStack h={30} jc="center">
                  <Ionicons name="car-outline" size={22} color={colors.textMuted} />
                </YStack>
              )}

              {/*
                Một dòng, dài thì "…": nhãn dài ("MPV (7 chỗ)") xuống dòng sẽ đẩy thẻ đó cao hơn
                hàng xóm, và một lưới ba cột lệch chiều cao trông như hỏng chứ không như đầy đặn.
              */}
              <Text
                col={colors.text}
                fos={fontSize.label}
                fow={fontWeight.semibold}
                ta="center"
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.label}
              </Text>
              {meta ? (
                <Text
                  col={colors.textMuted}
                  fos={fontSize.label}
                  ta="center"
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {meta}
                </Text>
              ) : null}
            </YStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}

/** Thẻ của dải ngang - Figma "Car Type" (Chỉnh sửa xe `24231:105423`): rộng 100, ảnh 36. */
const CAROUSEL_CARD_WIDTH = 100;
const CAROUSEL_ART = 36;
/** Khe giữa hai thẻ và giữa các khối trong thẻ Figma (`num/12`). */
const CAROUSEL_GAP = space.sm + space.xs;
/** Nút mũi tên nổi hai đầu dải - báo còn thẻ khuất và cho bấm thay vì vuốt. */
const NAV_SIZE = 28;

/**
 * Bản DẢI NGANG của bộ chọn thẻ (Figma "Kiểu dáng xe" của màn Chỉnh sửa xe): cùng dữ liệu, cùng
 * phép bật/tắt với lưới, chỉ khác bố cục. Hai nút mũi tên nổi chỉ hiện khi phía đó còn thẻ.
 */
export function CatalogCardCarousel({
  items,
  value,
  onChange,
  ariaLabel,
  prevLabel,
  nextLabel,
}: {
  items: readonly CatalogItem[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  ariaLabel: string;
  prevLabel: string;
  nextLabel: string;
}) {
  const colors = useColors();
  const ref = useRef<ScrollView>(null);
  const [offset, setOffset] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const toggle = useCallback(
    (key: string) =>
      onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]),
    [onChange, value],
  );
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => setOffset(e.nativeEvent.contentOffset.x),
    [],
  );
  const step = (dir: 1 | -1) => {
    const page = Math.max(viewport - CAROUSEL_CARD_WIDTH, CAROUSEL_CARD_WIDTH);
    ref.current?.scrollTo({ x: Math.max(0, offset + dir * page), animated: true });
  };
  /*
   * Kiểu dáng tự điền theo mẫu xe (ADR 0102) có thể nằm ngoài khung nhìn - cuộn tới thẻ đang chọn để
   * chủ xe thấy ngay nó đã sáng. Chỉ chạy khi lựa chọn đổi, không giật khung khi người dùng tự vuốt.
   */
  const selectedIndex = items.findIndex((item) => item.key === value[value.length - 1]);
  useEffect(() => {
    if (selectedIndex < 0 || viewport === 0) return;
    const cardStart = selectedIndex * (CAROUSEL_CARD_WIDTH + CAROUSEL_GAP);
    const x = Math.max(0, cardStart - (viewport - CAROUSEL_CARD_WIDTH) / 2);
    ref.current?.scrollTo({ x, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ theo thẻ được chọn
  }, [selectedIndex, viewport > 0]);
  const canPrev = offset > 1;
  const canNext = offset + viewport < content - 1;

  const navButton = (dir: 1 | -1) => (
    <Pressable
      onPress={() => step(dir)}
      accessibilityRole="button"
      accessibilityLabel={dir < 0 ? prevLabel : nextLabel}
      hitSlop={8}
      style={[
        styles.nav,
        dir < 0 ? styles.navLeft : styles.navRight,
        { backgroundColor: colors.surface, borderColor: colors.border },
        elevation.xs,
      ]}
    >
      <LineIcon name={dir < 0 ? 'chevron-left' : 'chevron-right'} size={16} color={colors.text} />
    </Pressable>
  );

  return (
    <View accessibilityLabel={ariaLabel}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onLayout={(e) => setViewport(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContent(w)}
        contentContainerStyle={{ gap: CAROUSEL_GAP }}
      >
        {items.map((item) => {
          const active = value.includes(item.key);
          const art = BODY_TYPE_ART[item.key];
          return (
            <Pressable
              key={item.key}
              onPress={() => toggle(item.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              accessibilityLabel={item.label}
            >
              <YStack
                w={CAROUSEL_CARD_WIDTH}
                minHeight={40}
                ai="center"
                jc="center"
                gap={space.xs}
                px={CAROUSEL_GAP}
                py={space.xs}
                br={CAROUSEL_GAP}
                bw={1}
                bc={active ? colors.primary : colors.border}
                bg={active ? colors.primarySubtle : colors.surface}
                style={elevation.xs}
              >
                {art ? (
                  <Image
                    source={art}
                    style={{ width: CAROUSEL_ART, height: CAROUSEL_ART }}
                    resizeMode="contain"
                  />
                ) : (
                  <YStack h={CAROUSEL_ART} jc="center">
                    <Ionicons name="car-outline" size={22} color={colors.textMuted} />
                  </YStack>
                )}
                <YStack ai="center">
                  <Text
                    col={active ? colors.primary : colors.text}
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    fow={fontWeight.medium}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  {item.description ? (
                    <Text
                      col={colors.textMuted}
                      fos={typeScale.caption.fontSize}
                      lh={typeScale.caption.lineHeight}
                      numberOfLines={1}
                    >
                      {item.description}
                    </Text>
                  ) : null}
                </YStack>
              </YStack>
            </Pressable>
          );
        })}
      </ScrollView>
      {canPrev ? navButton(-1) : null}
      {canNext ? navButton(1) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    position: 'absolute',
    top: '50%',
    marginTop: -NAV_SIZE / 2,
    width: NAV_SIZE,
    height: NAV_SIZE,
    borderRadius: NAV_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLeft: { left: -space.xs },
  navRight: { right: -space.xs },
});
