import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  edges?: readonly Edge[];
  centered?: boolean;
  /**
   * Đặt `false` cho màn danh sách tràn viền (FlatList kẻ phân cách sát mép).
   *
   * Có prop này vì `Screen` gánh hai việc khác nhau: an toàn viền + bàn phím là CẤU TRÚC,
   * còn lề trang là TRÌNH BÀY. Không tách được thì màn đầu tiên cần tràn viền sẽ bỏ luôn
   * `Screen` — và mất theo cả safe area lẫn xử lý bàn phím.
   */
  padded?: boolean;
}

/**
 * Gom safe area + tránh bàn phím + cuộn vào một chỗ vì luôn có một cái bị quên: thiếu
 * `SafeAreaView` là chữ chui vào tai thỏ, thiếu `KeyboardAvoidingView` là bàn phím che ô
 * nhập, thiếu `keyboardShouldPersistTaps` là phải chạm hai lần mới bấm được nút.
 */
export function Screen({
  children,
  scroll = true,
  edges,
  centered = false,
  padded = true,
}: ScreenProps) {
  const contentStyle = [
    styles.content,
    padded ? styles.padded : null,
    centered ? styles.centered : null,
  ];

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={contentStyle}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[contentStyle, styles.flex]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.flex} {...(edges ? { edges } : {})}>
      {/* Android tự đẩy layout khi bàn phím mở (`adjustResize`); thêm padding nữa là đẩy hai lần. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  padded: {
    gap: 16,
    padding: 24,
  },
  centered: {
    justifyContent: 'center',
  },
});
