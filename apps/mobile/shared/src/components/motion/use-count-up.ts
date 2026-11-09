import { useEffect, useRef, useState } from 'react';
import { runOnJS, useAnimatedReaction, useReducedMotion } from 'react-native-reanimated';
import { useRevealProgress } from './ScrollReveal';
import { motionMs } from '@/theme/motion';

/**
 * Số tiền ĐẾM LÊN tới giá trị mới — chỉ là hiệu ứng HIỂN THỊ. Tiền là chuỗi (ADR 0007): trong lúc
 * chạy trả các mốc nguyên đồng trung gian, và khung cuối LUÔN trả nguyên chuỗi `amount` gốc, nên
 * giá trị đứng lại đúng tuyệt đối. Chuỗi không đọc ra số / giảm chuyển động ⇒ trả thẳng `amount`.
 *
 * Dùng: `fmt.money(useCountUp(amount))`.
 */
export function useCountUp(amount: string): string {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(amount);
  const from = useRef<number>(0);

  useEffect(() => {
    const target = Number(amount);
    if (reduceMotion || !Number.isFinite(target)) {
      setShown(amount);
      from.current = Number.isFinite(target) ? target : 0;
      return;
    }
    const start = from.current;
    if (start === target) {
      setShown(amount);
      return;
    }
    const began = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - began) / motionMs.countUp);
      if (t >= 1) {
        setShown(amount);
        from.current = target;
        return;
      }
      const eased = 1 - (1 - t) ** 3;
      setShown(String(Math.round(start + (target - start) * eased)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      from.current = target;
    };
  }, [amount, reduceMotion]);

  return shown;
}

/** Bọc `useCountUp` cho chỗ chỉ cần một chuỗi đã định dạng (trả text thuần, đặt trong `<Text>`). */
export function CountUpText({ amount, format }: { amount: string; format: (amount: string) => string }) {
  return format(useCountUp(amount));
}

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
