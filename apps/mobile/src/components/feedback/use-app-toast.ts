import { useToastController } from '@tamagui/toast';
import { useMemo } from 'react';
import { dwell } from '@/theme/motion';
import { TOAST_PRESET } from './AppToast';

export interface AppToast {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
}

/**
 * Cách DUY NHẤT để bắn thông báo trong app.
 *
 * Màn hình không import `useToastController` của Tamagui: làm vậy thì mỗi nơi tự chọn
 * `duration`, tự nhớ đặt `customData.preset`, và quên một lần là toast đó rơi về `info` — một
 * lỗi hiện ra màu xanh.
 *
 * `message` phải là chuỗi ĐÃ DỊCH. Hook không gọi `useTranslations` vì nó không biết namespace
 * của nơi gọi; lỗi API thì đi qua `useErrorMessage()` để dịch từ MÃ (ADR 0012), không bao giờ
 * lấy thẳng `message` tiếng Việt của backend.
 */
export function useAppToast(): AppToast {
  const toast = useToastController();

  // `toast` là object mới mỗi lần render của provider, nên không memo thì ba hàm dưới đây đổi
  // danh tính liên tục và mọi `useEffect`/`useCallback` phụ thuộc chúng đều chạy lại.
  return useMemo(
    () => ({
      showSuccess: (message: string) =>
        void toast.show(message, { customData: { preset: TOAST_PRESET.SUCCESS } }),
      showError: (message: string) =>
        void toast.show(message, {
          customData: { preset: TOAST_PRESET.ERROR },
          duration: dwell.toastError,
        }),
      showInfo: (message: string) =>
        void toast.show(message, { customData: { preset: TOAST_PRESET.INFO } }),
    }),
    [toast],
  );
}
