import { memo, useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { elevation } from '@/theme/elevation';
import { useColors } from '@/theme/ThemeProvider';

/**
 * Công tắc v2 - Figma Partner-XePrime "_Toggle base" (Chi tiết xe `24158:106582`): rãnh bo tròn,
 * bật = `shape/primary`, núm trắng có bóng `Shadow/sm`. `md` 44×24 (núm 20), `sm` 36×20 (núm 16),
 * đệm núm 2. Thay `Switch` gốc của nền tảng ở những màn đã dựng theo Figma (Android vẽ Material).
 */
export type ToggleSwitchSize = 'sm' | 'md';

const DIMENSIONS: Readonly<Record<ToggleSwitchSize, { w: number; h: number; knob: number }>> = {
  md: { w: 44, h: 24, knob: 20 },
  sm: { w: 36, h: 20, knob: 16 },
};
const KNOB_INSET = 2;
const DURATION_MS = 150;

export const ToggleSwitch = memo(function ToggleSwitch({
  value,
  onValueChange,
  disabled = false,
  size = 'md',
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  size?: ToggleSwitchSize;
  accessibilityLabel: string;
}) {
  const colors = useColors();
  const dims = DIMENSIONS[size];
  const travel = dims.w - dims.knob - KNOB_INSET * 2;
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: DURATION_MS,
      useNativeDriver: false,
    }).start();
  }, [progress, value]);

  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.borderInput, colors.primary],
  });
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, travel] });

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      style={disabled ? styles.disabled : null}
    >
      <Animated.View
        style={[
          styles.track,
          { width: dims.w, height: dims.h, borderRadius: dims.h / 2, backgroundColor: trackColor },
        ]}
      >
        <Animated.View
          style={[
            styles.knob,
            {
              width: dims.knob,
              height: dims.knob,
              borderRadius: dims.knob / 2,
              backgroundColor: colors.surface,
              transform: [{ translateX }],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  track: { padding: KNOB_INSET, justifyContent: 'center' },
  knob: elevation.sm,
  disabled: { opacity: 0.5 },
});
