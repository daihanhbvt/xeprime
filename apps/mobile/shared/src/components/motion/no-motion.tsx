import { createContext, useContext, type ReactNode } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Vùng TẮT chuyển động: các khối có hiệu ứng (co khi nhấn, vạch chỉ tab trượt, công tắc trượt, thẻ
 * nhấn) đọc `useMotionOff()` và đứng yên như khi máy bật "Giảm chuyển động". Dùng cho màn người dùng
 * yêu cầu không hiệu ứng (màn sửa xe, 27/11/2026) - bật theo màn qua `Screen motion={false}`, không
 * đổi mặc định của màn khác.
 */
const NoMotionContext = createContext(false);

export function NoMotionScope({ off = true, children }: { off?: boolean; children: ReactNode }) {
  return <NoMotionContext.Provider value={off}>{children}</NoMotionContext.Provider>;
}

/** `true` khi máy bật "Giảm chuyển động" HOẶC đang nằm trong một `NoMotionScope`. */
export function useMotionOff(): boolean {
  const reduced = useReducedMotion();
  const scoped = useContext(NoMotionContext);
  return reduced || scoped;
}
