'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * MỘT form con của mục đang mở trên màn sửa xe.
 *
 * `submit` tự validate và tự báo lỗi (toast, ô đỏ) như khi nó còn nút Lưu riêng — trả `true` khi đã
 * lưu xong, `false` khi dừng lại (lỗi validate, người dùng huỷ hộp xác nhận, server từ chối).
 */
export interface EditFormHandle {
  dirty: boolean;
  submitting: boolean;
  submit: () => Promise<boolean>;
  reset: () => void;
}

interface FormState {
  dirty: boolean;
  submitting: boolean;
}

interface EditActionsRegistry {
  attach: (key: string, handle: { current: EditFormHandle }) => void;
  detach: (key: string) => void;
  report: (key: string, state: FormState) => void;
}

/** Trạng thái gộp mà cột phải đọc để dựng hai nút "Hoàn tác · Lưu thay đổi". */
export interface EditActions {
  /** Mục đang mở có form nào không — mục tự lưu (ảnh, giấy tờ…) thì không có, cột phải ẩn hai nút. */
  hasForms: boolean;
  dirty: boolean;
  submitting: boolean;
  /** Lưu LẦN LƯỢT các form đang có thay đổi; dừng ở form đầu tiên không lưu được. */
  save: () => Promise<boolean>;
  undo: () => void;
}

const RegistryContext = createContext<EditActionsRegistry | null>(null);
const ActionsContext = createContext<EditActions | null>(null);

/**
 * Nút "Hoàn tác · Lưu thay đổi" của màn sửa xe nằm ở CỘT PHẢI (design `23731:37932`), nhưng form
 * nằm ở nội dung giữa — có mục chỉ một form (Thông tin chung), có mục vài form ghi vào vài endpoint
 * (Dịch vụ xe: giá + thiết lập có tài xế; Giao nhận: giao xe + khung giờ). Mỗi form đăng ký vào đây
 * bằng `useEditForm`, và cột phải lưu tất cả những form đang dở bằng một lần bấm.
 *
 * Mỗi form vẫn lưu qua đúng mutation của nó như trước — chỗ này chỉ dời NÚT, không gộp dữ liệu.
 */
export function EditActionsProvider({ children }: { children: ReactNode }) {
  const handles = useRef(new Map<string, { current: EditFormHandle }>());
  const [states, setStates] = useState<Record<string, FormState>>({});

  const registry = useMemo<EditActionsRegistry>(
    () => ({
      attach: (key, handle) => {
        handles.current.set(key, handle);
      },
      detach: (key) => {
        handles.current.delete(key);
        setStates((prev) => {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      },
      report: (key, state) =>
        setStates((prev) => {
          const current = prev[key];
          if (current?.dirty === state.dirty && current.submitting === state.submitting) {
            return prev;
          }
          return { ...prev, [key]: state };
        }),
    }),
    [],
  );

  const list = Object.values(states);
  const dirty = list.some((state) => state.dirty);
  const submitting = list.some((state) => state.submitting);

  const save = useCallback(async () => {
    for (const [key, handle] of handles.current) {
      if (!states[key]?.dirty) continue;
      const ok = await handle.current.submit();
      if (!ok) return false;
    }
    return true;
  }, [states]);

  const undo = useCallback(() => {
    for (const [key, handle] of handles.current) {
      if (states[key]?.dirty) handle.current.reset();
    }
  }, [states]);

  /*
   * Rời trang (đóng tab, F5) khi còn thay đổi chưa lưu — trình duyệt tự hỏi. Đổi mục bên trong màn
   * thì `VehicleEditWorkspace` hỏi bằng hộp thoại của nó.
   */
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const actions = useMemo<EditActions>(
    () => ({ hasForms: list.length > 0, dirty, submitting, save, undo }),
    [list.length, dirty, submitting, save, undo],
  );

  return (
    <RegistryContext.Provider value={registry}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </RegistryContext.Provider>
  );
}

/**
 * Đăng ký một form với cột phải. Trả `true` khi đang nằm trong màn sửa xe — form đó KHÔNG tự dựng
 * nút Lưu nữa. Ngoài màn sửa (wizard, màn khác dùng lại section) trả `false` và form giữ nút riêng.
 */
export function useEditForm(key: string, handle: EditFormHandle): boolean {
  const registry = useContext(RegistryContext);
  const ref = useRef(handle);
  useEffect(() => {
    ref.current = handle;
  });
  useEffect(() => {
    if (!registry) return;
    registry.attach(key, ref);
    return () => registry.detach(key);
  }, [registry, key]);
  useEffect(() => {
    registry?.report(key, { dirty: handle.dirty, submitting: handle.submitting });
  }, [registry, key, handle.dirty, handle.submitting]);
  return registry !== null;
}

/** Trạng thái gộp cho cột phải và hộp "Bỏ thay đổi chưa lưu?". `null` ngoài màn sửa xe. */
export function useEditActions(): EditActions | null {
  return useContext(ActionsContext);
}
