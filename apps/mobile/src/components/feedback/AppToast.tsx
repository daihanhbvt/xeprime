import { Ionicons } from '@expo/vector-icons';
import { Toast, ToastProvider, ToastViewport, useToastState } from '@tamagui/toast';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack } from 'tamagui';
import { elevation } from '@/theme/elevation';
import { dwell } from '@/theme/motion';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { IconName } from '@/components/ui/Chip';

/**
 * Ba loại thông báo, và CHỈ ba. Thêm loại thứ tư nghĩa là người dùng phải học thêm một màu —
 * thứ hạng của tin (`warning`, `promo`…) thuộc về nội dung câu chữ, không phải về khung.
 */
export const TOAST_PRESET = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
} as const;

export type ToastPreset = (typeof TOAST_PRESET)[keyof typeof TOAST_PRESET];

/**
 * Dạy TypeScript về trường tuỳ biến của chính app này.
 *
 * Không có khai báo này thì `customData` là `Record<string, any>` và `preset` gõ sai chính tả
 * vẫn biên dịch được — toast sẽ lặng lẽ rơi về `info` ở runtime.
 */
declare module '@tamagui/toast' {
  interface CustomData {
    /**
     * TUỲ CHỌN: `ShowOptions` là `CreateNativeToastOptions & CustomData`, nên khai bắt buộc
     * sẽ đòi `preset` ngay cấp ngoài cùng của `show()` — chỗ nó không thuộc về.
     */
    preset?: ToastPreset;
  }
}

interface PresetSkin {
  icon: IconName;
  accent: string;
  surface: string;
}

/** Gold thương hiệu cố ý KHÔNG có mặt ở đây: nó là màu HÀNH ĐỘNG, không phải màu trạng thái. */
const PRESET_SKIN: Readonly<Record<ToastPreset, PresetSkin>> = {
  [TOAST_PRESET.SUCCESS]: {
    icon: 'checkmark-circle',
    accent: colors.success,
    surface: colors.successSurface,
  },
  [TOAST_PRESET.ERROR]: {
    icon: 'alert-circle',
    accent: colors.danger,
    surface: colors.dangerSurface,
  },
  [TOAST_PRESET.INFO]: {
    icon: 'information-circle',
    accent: colors.info,
    surface: colors.infoSurface,
  },
};

/** Vạch màu bên trái — thứ DUY NHẤT phân biệt ba preset khi liếc nhanh, nên nó có tên. */
const ACCENT_BAR_WIDTH = 3;

/**
 * MỘT component cho cả ba preset — ba bản riêng sẽ trôi khỏi nhau ngay lần chỉnh khoảng cách đầu.
 *
 * Đừng thêm prop `animation`/`enterStyle`: bộ prop của `Toast` chốt lúc `@tamagui/toast` biên
 * dịch, theo config MẶC ĐỊNH của Tamagui, nên nó không nhận dù app đã khai driver và augment
 * `TamaguiCustomConfig` (`XStack` bên trong cũng vậy). Không cần: `ToastImpl` tự dùng driver
 * cắm ở `theme/tamagui.config.ts` cho hoạt cảnh và cử chỉ vuốt.
 */
function AppToast() {
  const toast = useToastState();

  // Toast bị thư viện xử lý bằng native (burnt) thì không có gì để render — ở đây luôn `false`
  // vì `native={false}`, nhưng kiểm vẫn đúng nếu ngày nào đó bật lên cho riêng một lời gọi.
  if (!toast || toast.isHandledNatively) return null;

  const skin = PRESET_SKIN[toast.customData?.preset ?? TOAST_PRESET.INFO];

  return (
    <Toast
      // `key` theo id: không có nó thì toast thứ hai tái dùng view của toast thứ nhất và
      // đồng hồ tự đóng không được đặt lại — tin mới biến mất theo hạn của tin cũ.
      key={toast.id}
      unstyled
      duration={toast.duration}
      // BẮT BUỘC: `unstyled` bỏ kích thước mặc định, khung co theo nội dung, và `flex: 1` của
      // phần chữ tính ra bề rộng 0 — toast chỉ còn cái icon. Web không lộ vì flexbox lùi min-content.
      width="100%"
    >
      <XStack
        width="100%"
        ai="center"
        gap={space.sm}
        bg={skin.surface}
        br={radius.md}
        borderLeftWidth={ACCENT_BAR_WIDTH}
        bc={skin.accent}
        px={space.md}
        py={space.sm}
        style={elevation.card}
      >
        <Ionicons name={skin.icon} size={iconSize.lg} color={skin.accent} />
        <Toast.Title
          col={colors.text}
          fos={fontSize.body}
          fow={fontWeight.medium}
          f={1}
          // Không có `flexShrink` thì một câu lỗi dài đẩy chính nó tràn khỏi khung thay vì xuống dòng.
          flexShrink={1}
          numberOfLines={3}
        >
          {toast.title}
        </Toast.Title>
      </XStack>
    </Toast>
  );
}

/**
 * Provider + viewport + component render gói làm một: thiếu viewport thì `show()` vẫn trả `true`
 * và không có gì hiện ra.
 *
 * `native={false}` — toast dựng bằng JS để ba nền tảng giống nhau; bản native (`burnt`) không
 * nhận token màu của app.
 */
export function AppToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <ToastProvider native={false} duration={dwell.toast} swipeDirection="up">
      {children}

      <AppToast />

      {/*
 
      */}
      <ToastViewport
        pos="absolute"
        top={insets.top + space.xs}
        left={space.md}
        right={space.md}
      />
    </ToastProvider>
  );
}
