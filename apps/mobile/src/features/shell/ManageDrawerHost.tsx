import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  type DerivedValue,
} from 'react-native-reanimated';
import { YStack } from 'tamagui';
import { useFocusEffect } from 'expo-router';
import { appStyles } from '@/theme/styles';
import { sidebar } from '@/theme/tokens';
import { duration } from '@/theme/motion';
import { ManageDrawer } from './ManageDrawer';

/** Rộng nhất 320pt, và luôn chừa một dải hé thấy trang phía sau để biết đây là lớp phủ. */
const MAX_WIDTH = 320;
const WIDTH_RATIO = 0.86;

const styles = StyleSheet.create({
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});

interface ManageDrawerControl {
  open: () => void;
  close: () => void;
}

const ManageDrawerContext = createContext<ManageDrawerControl | null>(null);

/**
 * Mở/đóng sidebar khu quản lý. Chỉ gọi được bên trong `<ManageDrawerHost>`.
 *
 * Ném lỗi thay vì trả `null` lặng lẽ: một nút hamburger bấm không ăn là thứ rất khó lần ra, còn
 * cây component sai chỗ thì lộ ngay ở lần render đầu.
 */
export function useManageDrawer(): ManageDrawerControl {
  const control = useContext(ManageDrawerContext);
  if (!control) throw new Error('useManageDrawer phải nằm trong <ManageDrawerHost>.');
  return control;
}

/**
 * Sidebar khu quản lý — tự dựng, KHÔNG dùng `@react-navigation/drawer`.
 *
 * Drawer của react-navigation kéo theo `react-native-gesture-handler` (native code), và trên máy
 * dev Windows nó không build được: đường dẫn codegen trong cây pnpm dài 276 ký tự, vượt giới hạn
 * 260, `ninja` chết ở `rngesturehandler_codegenJSI-generated.cpp`. Chữa được nhưng phải đổi chiến
 * lược link của cả monorepo — quá đắt cho một tấm menu trượt. Bản này chỉ dùng Reanimated, thứ đã
 * nằm sẵn trong binary.
 *
 * **Khác biệt duy nhất so với drawer thật: không vuốt-từ-mép để mở** (cử chỉ đó cần
 * gesture-handler). Nút hamburger, chạm ra ngoài để đóng và nút Back của Android đều chạy đúng.
 */
export function ManageDrawerHost({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  const panelWidth = Math.min(MAX_WIDTH, width * WIDTH_RATIO);

  /*
   * Hoạt cảnh DẪN XUẤT từ `open`, không phải gán tay vào `progress.value`.
   *
   * Gán tay trong callback là sửa một giá trị đã truyền vào hook khác — `react-hooks` chặn, và
   * đúng: hai nguồn điều khiển cùng một con số thì lúc mở nhanh/đóng nhanh liên tiếp chúng đá
   * nhau. Ở đây `open` là nguồn duy nhất, hoạt cảnh chỉ đi theo.
   *
   * Đóng nhanh hơn mở: mở là lời mời đọc, đóng là dọn đường cho thứ người dùng vừa chọn.
   */
  const progress = useDerivedValue<number>(
    () => withTiming(open ? 1 : 0, { duration: open ? duration.base : duration.fast }),
    [open],
  );

  const control = useMemo<ManageDrawerControl>(
    () => ({ open: () => setOpen(true), close: () => setOpen(false) }),
    [],
  );

  /*
   * Nút Back của Android đóng drawer TRƯỚC khi lui màn.
   *
   * Không có nhánh này thì một tấm menu đang che nửa màn hình lại lui hẳn ra khỏi khu quản lý —
   * người dùng mất chỗ đang đứng vì một cú bấm họ nghĩ là "đóng cái này lại".
   */
  useFocusEffect(
    useCallback(() => {
      if (!open) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setOpen(false);
        return true;
      });
      return () => subscription.remove();
    }, [open]),
  );

  /*
   * Lớp phủ và tấm menu MOUNT SẴN, chỉ tắt/bật `pointerEvents`.
   *
   * Tháo chúng ra khi đóng thì hoạt cảnh đóng không bao giờ chạy — tấm menu biến mất khựng một
   * nhịp. Đổi lại, `ManageDrawer` luôn sống nên con số huy hiệu đã sẵn sàng lúc mở, không phải
   * đợi một vòng query.
   */
  return (
    <ManageDrawerContext.Provider value={control}>
      <YStack f={1}>
        {children}
        <Scrim progress={progress} visible={open} onPress={control.close} />
        <Panel progress={progress} visible={open} width={panelWidth} />
      </YStack>
    </ManageDrawerContext.Provider>
  );
}

function Scrim({
  progress,
  visible,
  onPress,
}: {
  progress: DerivedValue<number>;
  visible: boolean;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, style]}
    >
      <Pressable style={appStyles.scrim} onPress={onPress} accessible={false} />
    </Animated.View>
  );
}

function Panel({
  progress,
  visible,
  width,
}: {
  progress: DerivedValue<number>;
  visible: boolean;
  width: number;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -width * (1 - progress.value) }],
  }));

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[styles.panel, { width, backgroundColor: sidebar.bg }, style]}
    >
      <ManageDrawer />
    </Animated.View>
  );
}
