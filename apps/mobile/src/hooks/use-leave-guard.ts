import { useCallback, useRef, useState } from 'react';

/**
 * Chặn rời màn khi form còn thay đổi CHƯA LƯU.
 *
 * Sinh ra vì màn sửa xe có hai lối rời đi — nút Lui và dải tab — và cả hai phải hỏi cùng một câu.
 * Trước đó mỗi màn tự giữ một `confirmDiscard` nối cứng vào `onBack()`, nên thêm lối thứ hai là
 * chép lại nguyên cụm state đó ở bốn màn.
 *
 * Ý định rời đi được giữ trong `ref` chứ không phải state: nó là một hàm, mà `setState(fn)` hiểu
 * hàm là bộ cập nhật và sẽ GỌI luôn — tức là rời màn ngay trước khi người dùng kịp trả lời.
 */
export function useLeaveGuard(dirty: boolean) {
  const pending = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);

  /** Bọc một hành động rời màn: sạch thì đi luôn, bẩn thì hỏi trước. */
  const guard = useCallback(
    (go: () => void) => {
      if (!dirty) {
        go();
        return;
      }
      pending.current = go;
      setOpen(true);
    },
    [dirty],
  );

  const cancel = useCallback(() => {
    pending.current = null;
    setOpen(false);
  }, []);

  /** Người dùng đồng ý bỏ thay đổi — chạy đúng ý định đang chờ. */
  const confirm = useCallback(() => {
    const go = pending.current;
    pending.current = null;
    setOpen(false);
    go?.();
  }, []);

  return { guard, open, confirm, cancel };
}
