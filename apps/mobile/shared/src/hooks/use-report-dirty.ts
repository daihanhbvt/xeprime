import { useEffect, useRef } from 'react';

/**
 * Báo trạng thái "đang sửa dở" của một form CON lên màn chứa nó — để `useLeaveGuard` của màn cha
 * hỏi "bỏ thay đổi?" cả khi phần dở nằm ở form con (tab Chính sách thuê: thời gian giao nhận,
 * điều khoản, tự nhận chuyến đều là form riêng có nút Lưu riêng). Rời khỏi cây thì báo `false`.
 */
export function useReportDirty(dirty: boolean, onDirtyChange?: (dirty: boolean) => void): void {
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
}

/** Hàm lưu của một form CON - trả `true` khi đã lưu xong (hợp lệ + server nhận). */
export type SubFormSave = () => Promise<boolean>;

/**
 * Đăng ký hàm lưu của form CON lên màn chứa - để màn đó có MỘT nút Lưu cho cả tab (web `PolicyPane`
 * lưu chung, người dùng chốt 17/11/2026). Có `register` thì form con ẩn nút Lưu riêng của nó.
 * Màn cha giữ hàm trong ref (không phải state), nên đăng ký lại mỗi lần render không gây vòng lặp.
 */
export function useRegisterSave(save: SubFormSave, register?: (save: SubFormSave | null) => void) {
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => {
    if (!register) return;
    register(() => latest.current());
    return () => register(null);
  }, [register]);
}
