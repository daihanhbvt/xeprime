import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/theme/ThemeProvider';

/**
 * Confetti nhẹ tự viết (không thư viện). Chỉ gọi `celebrate()` khi có KẾT QUẢ THẬT từ server
 * (yêu cầu đã gửi, tiền giữ chỗ đã về đủ — ADR 0044), không vì một cú bấm.
 * `ConfettiHost` mount một lần ở layout gốc, nằm trên mọi màn, không bắt chạm.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
export function celebrate(): void {
  listeners.forEach((l) => l());
}

const COUNT = 26;
const DURATION = 1600;

interface Piece {
  x: number;
  drift: number;
  delay: number;
  spin: number;
  w: number;
  h: number;
  colorIndex: number;
}

function makePieces(): Piece[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    x: Math.random(),
    drift: (Math.random() - 0.5) * 120,
    delay: Math.random() * 0.25,
    spin: (Math.random() - 0.5) * 900,
    w: 6 + Math.random() * 4,
    h: 8 + Math.random() * 6,
    colorIndex: i % 4,
  }));
}

function ConfettiPiece({ piece, p, width, height, color }: { piece: Piece; p: SharedValue<number>; width: number; height: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, (p.value - piece.delay) / (1 - piece.delay)));
    return {
      opacity: t <= 0 ? 0 : 1 - t * t,
      transform: [
        { translateX: piece.x * width + piece.drift * t },
        { translateY: -20 + t * height * 0.75 },
        { rotate: `${piece.spin * t}deg` },
      ],
    };
  });
  return <Animated.View style={[styles.piece, { width: piece.w, height: piece.h, backgroundColor: color }, style]} />;
}

export function ConfettiHost() {
  const reduceMotion = useReducedMotion();
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const p = useSharedValue(0);
  const [pieces, setPieces] = useState<Piece[] | null>(null);

  useEffect(() => {
    const fire = () => {
      if (reduceMotion) return;
      setPieces(makePieces());
      p.value = 0;
      p.value = withTiming(1, { duration: DURATION, easing: Easing.out(Easing.quad) }, (done) => {
        if (done) runOnJS(setPieces)(null);
      });
    };
    listeners.add(fire);
    return () => {
      listeners.delete(fire);
    };
  }, [p, reduceMotion]);

  if (!pieces) return null;
  const palette = [colors.accentText, colors.success, colors.info, colors.warning];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((piece, i) => (
        <ConfettiPiece key={i} piece={piece} p={p} width={width} height={height} color={palette[piece.colorIndex] ?? colors.accentText} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', top: 0, left: 0, borderRadius: 2 },
});
