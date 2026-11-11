import { useEffect, useState } from 'react';
import { runOnJS, useAnimatedReaction, useReducedMotion } from 'react-native-reanimated';
import { useRevealProgress } from './ScrollReveal';
import { motionMs } from '@/theme/motion';

/**
 * Số liệu dạng chữ ("100+", "4.9/5") ĐẾM TỪ 0 khi khối `ScrollReveal` cha bắt đầu hiện. Giữ
 * nguyên phần chữ trước/sau số; khung cuối luôn là nguyên chuỗi gốc. Không có số / giảm chuyển
 * động / ngoài khối reveal ⇒ hiện thẳng. Một `setState` khi bắt đầu, không theo cuộn.
 */
export function RevealCountUp({ text }: { text: string }) {
  const reduceMotion = useReducedMotion();
  const parent = useRevealProgress();
  const match = /^(\D*)(\d+)(.*)$/s.exec(text);
  const animate = Boolean(parent && match && !reduceMotion);
  const [started, setStarted] = useState(false);
  const [n, setN] = useState(0);

  useAnimatedReaction(
    () => (parent ? parent.value > 0 : false),
    (go, prev) => {
      if (go && !prev) runOnJS(setStarted)(true);
    },
  );

  useEffect(() => {
    if (!animate || !started || !match) return;
    const target = Number(match[2]);
    const began = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - began) / (motionMs.countUp * 2));
      setN(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chạy một lần khi bắt đầu
  }, [animate, started]);

  if (!animate || !match) return text;
  const target = Number(match[2]);
  if (started && n >= target) return text;
  return `${match[1]}${n}${match[3]}`;
}
