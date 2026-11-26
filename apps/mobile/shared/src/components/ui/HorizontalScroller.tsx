import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTranslations } from 'use-intl';
import { LineIcon } from '@/components/icons/LineIcon';
import { elevation } from '@/theme/elevation';
import { useColors } from '@/theme/ThemeProvider';
import { iconSize, radius } from '@/theme/tokens';

const SIZE = 32;
/** Còn cách mép phải dưới ngưỡng này thì coi là đã tới cuối (tránh nút chớp ở sai số làm tròn). */
const END_EPSILON = 4;
/** Chạm nút thì cuộn thêm bấy nhiêu phần bề ngang khung nhìn. */
const STEP_RATIO = 0.7;

/**
 * Vùng cuộn NGANG có nút nổi ">" ở mép phải báo "phía sau còn nội dung" (người dùng 25/11/2026, mọi biểu đồ cuộn
 * ngang). Hiện khi nội dung dài hơn khung và chưa cuộn tới cuối; chạm nút cuộn tiếp, tới cuối thì mờ đi.
 *
 * Dùng thay `ScrollView horizontal` - nhận mọi prop của `ScrollView`. \`hintTop\` canh dọc nút theo vùng cột (mặc định
 * giữa khung).
 */
export function HorizontalScroller({
  children,
  hintTop,
  onScroll,
  onContentSizeChange,
  onLayout,
  ...rest
}: ScrollViewProps & { hintTop?: number }) {
  const colors = useColors();
  const t = useTranslations('Common.actions');
  const ref = useRef<ScrollView>(null);
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const [offset, setOffset] = useState(0);

  const back = viewport > 0 && offset > END_EPSILON;
  const more = viewport > 0 && content - viewport > END_EPSILON && offset + viewport < content - END_EPSILON;

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setOffset(event.nativeEvent.contentOffset.x);
      onScroll?.(event);
    },
    [onScroll],
  );

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => {
        setViewport(Math.round(event.nativeEvent.layout.width));
        onLayout?.(event);
      }}
    >
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={handleScroll}
        onContentSizeChange={(width, height) => {
          setContent(width);
          onContentSizeChange?.(width, height);
        }}
        {...rest}
      >
        {children}
      </ScrollView>
      {back ? (
        <HintButton
          side="left"
          hintTop={hintTop}
          label={t('previous')}
          onPress={() => ref.current?.scrollTo({ x: Math.max(0, offset - viewport * STEP_RATIO), animated: true })}
        />
      ) : null}
      {more ? (
        <HintButton
          side="right"
          hintTop={hintTop}
          label={t('next')}
          onPress={() => ref.current?.scrollTo({ x: Math.min(content - viewport, offset + viewport * STEP_RATIO), animated: true })}
        />
      ) : null}
    </View>
  );
}

/** Nút nổi tròn ở một mép: ">" khi phía sau còn nội dung, "<" khi đã cuộn khỏi đầu (người dùng 26/11/2026). */
function HintButton({
  side,
  hintTop,
  label,
  onPress,
}: {
  side: 'left' | 'right';
  hintTop: number | undefined;
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      pointerEvents="box-none"
      style={[
        side === 'left' ? styles.left : styles.right,
        hintTop === undefined ? styles.centered : { top: hintTop },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={8}
        style={({ pressed }) => [
          styles.button,
          elevation.raised,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed ? styles.pressed : null,
        ]}
      >
        {/* Cùng icon "Right" của bộ nét, quay 180° cho chiều về - không mượn glyph bộ khác. */}
        <Animated.View style={side === 'left' ? styles.flip : null}>
          <LineIcon name="chevron-right-sm" size={iconSize.md} color={colors.text} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  left: { position: 'absolute', left: 4 },
  right: { position: 'absolute', right: 4 },
  flip: { transform: [{ rotate: '180deg' }] },
  centered: { top: '50%', marginTop: -SIZE / 2 },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
