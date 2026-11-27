import { dismissKeyboardFirst } from '@/lib/dismiss-keyboard-first';
import type { ReactNode } from 'react';
import { Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { IS_PARTNER_APP } from '@/lib/app-kind';
import { Button } from './Button';
import { ConfirmSheet } from './ConfirmSheet';
import { LineIcon } from '@/components/icons/LineIcon';
import { layout, modalColumn } from '@/theme/layout';
import { useAppStyles } from '@/theme/styles';
import { useColors, useFloatingSurfaceBorder } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/** Dấu ✕ đóng hộp - cùng cỡ dấu ✕ của tấm v2 (`BottomSheet` `V2_CLOSE`). */
const CLOSE_ICON = 24;
/** Tổng độ dài hai nhãn không quá ngưỡng này thì hai nút nằm MỘT hàng. */
const ROW_LABEL_LENGTH = 30;

/**
 * Hộp XÁC NHẬN của app — thay cho `Alert.alert` của hệ điều hành.
 *
 * `Alert.alert` bị loại vì ba lý do: nó không theo design token (hai nền tảng ra hai hình, không
 * hình nào của XePrime); **thứ tự nút không kiểm soát được** (iOS xếp theo `style`, Android theo
 * thứ tự khai — cùng một mảng cho ra "Huỷ | Xoá" ở máy này và "Xoá | Huỷ" ở máy kia, rủi ro thật
 * với thao tác phá huỷ); và nó không có trạng thái ĐANG CHẠY, nên người dùng bấm lại vì tưởng
 * chưa ăn. Hộp này luôn nhận `loading` và giữ nút hành động ở TRÊN.
 *
 * Neo ĐÁY màn, rộng hết bề ngang, bo góc trên — cùng hình thái với `BottomSheet`.
 *
 * Bản đầu định neo giữa màn (`jc="center"` + đệm hai bên) nhưng chưa bao giờ chạy như thế: lớp
 * phủ là một `flex: 1` ĐỨNG TRONG LUỒNG, nên nó nuốt hết chỗ trống và đẩy hộp xuống đáy. Kết
 * quả là một hộp dính đáy nhưng vẫn thừa hai dải trắng hai bên, và bo bốn góc ở một thứ đang
 * chạm mép dưới. Neo đáy là hình thái đúng cho một câu hỏi trên điện thoại — ngón cái với tới —
 * nên giữ nó và làm cho tử tế thay vì kéo ngược lên giữa.
 */
export function AlertDialog({
  open,
  title,
  message,
  body,
  confirmLabel,
  cancelLabel,
  destructive = false,
  loading = false,
  actionsRow = false,
  dismissIcon = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  /**
   * Nhận `ReactNode` chứ không chỉ chuỗi: một số câu xác nhận là message ICU có thẻ rich
   * (`<b>`), và `t.rich` trả về node. Ép về chuỗi ở đó nghĩa là mất phần nhấn, hoặc tệ hơn là
   * in ra nguyên khoá.
   */
  message?: ReactNode;
  /** Nội dung có CẤU TRÚC (nhiều đoạn, khối lỗi) — vẽ ngoài `Text`, dưới `message`. */
  body?: ReactNode;
  confirmLabel: string;
  /** Bỏ trống thì dùng "Huỷ" của `Common.actions`. */
  cancelLabel?: string;
  /** Hành động không lấy lại được — nút chính chuyển sang tông cảnh báo. */
  destructive?: boolean;
  loading?: boolean;
  /** Hai nút CÙNG MỘT HÀNG (Huỷ trái · hành động phải) thay cho xếp dọc. */
  actionsRow?: boolean;
  /**
   * Chỉ MỘT nút hành động, đóng hộp bằng dấu ✕ ở góc tiêu đề (vd "Hủy lịch" bảo dưỡng - người dùng chốt
   * 26/11/2026): bỏ nút "Huỷ" vốn đọc gần giống nút hành động.
   */
  dismissIcon?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const appStyles = useAppStyles();
  const colors = useColors();
  const floatingBorder = useFloatingSurfaceBorder();
  const t = useTranslations('Common.actions');
  const insets = useSafeAreaInsets();

  /*
   * App Partner: hộp xác nhận là TẤM `ConfirmSheet` (người dùng 26/11/2026: popup có viền - "Huỷ" viền
   * trái + nút chính phải, một hàng khi nhãn ngắn, xếp dọc khi dài). Một chỗ này đổi cho MỌI nơi gọi
   * `AlertDialog`. Riêng kiểu một nút + ✕ (`dismissIcon`) giữ hộp cũ vì ConfirmSheet luôn có "Huỷ".
   */
  if (IS_PARTNER_APP && !dismissIcon) {
    return (
      <ConfirmSheet
        open={open}
        title={title}
        confirmLabel={confirmLabel}
        onConfirm={onConfirm}
        onClose={onCancel}
        tone={destructive ? 'danger' : 'primary'}
        loading={loading}
        {...(cancelLabel ? { cancelLabel } : {})}
        {...(message || body
          ? {
              message: (
                <YStack gap={space.xs}>
                  {message ? (
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {message}
                    </Text>
                  ) : null}
                  {body}
                </YStack>
              ),
            }
          : {})}
      />
    );
  }

  // App khách: hai nút một hàng khi nhãn ngắn; "Huỷ" luôn có viền (không còn nút ghost).
  const rowLayout = actionsRow || (cancelLabel ?? t('cancel')).length + confirmLabel.length <= ROW_LABEL_LENGTH;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <YStack f={1}>
        {/*
          Lớp phủ là ANH EM của hộp, không phải cha: bọc hộp trong một `Pressable` phủ toàn màn
          thì mọi cú chạm vào chính hộp cũng đóng nó.
        */}
        <Pressable style={appStyles.scrim} onPress={dismissKeyboardFirst(onCancel)} accessibilityLabel={t('close')} />

        {/*
          `pb` cộng thêm safe-area ĐÁY: thanh điều hướng Android nằm ĐÈ lên cửa sổ modal, và
          không cộng nó vào thì nút "Huỷ" — nút dưới cùng — bị che mất một nửa.
        */}
        <YStack
          style={modalColumn}
          bg={colors.surface}
          borderTopLeftRadius={radius.lg}
          borderTopRightRadius={radius.lg}
          {...floatingBorder}
          px={layout.screenX}
          pt={layout.screenX}
          pb={layout.screenX + insets.bottom}
          gap={space.md}
          accessibilityViewIsModal
          accessibilityRole="alert"
        >
          <YStack gap={space.xs}>
            <XStack ai="flex-start" gap={space.sm}>
              <Text f={1} col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                {title}
              </Text>
              {dismissIcon ? (
                <Pressable
                  onPress={onCancel}
                  disabled={loading}
                  hitSlop={space.sm}
                  accessibilityRole="button"
                  accessibilityLabel={t('close')}
                >
                  <LineIcon name="close" size={CLOSE_ICON} color={colors.placeholder} />
                </Pressable>
              ) : null}
            </XStack>
            {message ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {message}
              </Text>
            ) : null}
            {body}
          </YStack>

          {dismissIcon ? (
            <Button
              label={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              loading={loading}
              onPress={onConfirm}
            />
          ) : rowLayout ? (
            <XStack gap={space.sm}>
              <YStack f={1} flexBasis={0}>
                <Button
                  label={cancelLabel ?? t('cancel')}
                  variant="secondary"
                  disabled={loading}
                  onPress={onCancel}
                />
              </YStack>
              <YStack f={1} flexBasis={0}>
                <Button
                  label={confirmLabel}
                  variant={destructive ? 'danger' : 'primary'}
                  loading={loading}
                  onPress={onConfirm}
                />
              </YStack>
            </XStack>
          ) : (
            <YStack gap={space.xs}>
              <Button
                label={confirmLabel}
                variant={destructive ? 'danger' : 'primary'}
                loading={loading}
                onPress={onConfirm}
              />
              <Button
                label={cancelLabel ?? t('cancel')}
                variant="secondary"
                disabled={loading}
                onPress={onCancel}
              />
            </YStack>
          )}
        </YStack>
      </YStack>
    </Modal>
  );
}
