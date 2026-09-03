import { Modal, Pressable } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from './Button';
import { layout } from '@/theme/layout';
import { appStyles } from '@/theme/styles';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

/**
 * Hộp XÁC NHẬN của app — thay cho `Alert.alert` của hệ điều hành.
 *
 * `Alert.alert` bị loại vì ba lý do: nó không theo design token (hai nền tảng ra hai hình, không
 * hình nào của XePrime); **thứ tự nút không kiểm soát được** (iOS xếp theo `style`, Android theo
 * thứ tự khai — cùng một mảng cho ra "Huỷ | Xoá" ở máy này và "Xoá | Huỷ" ở máy kia, rủi ro thật
 * với thao tác phá huỷ); và nó không có trạng thái ĐANG CHẠY, nên người dùng bấm lại vì tưởng
 * chưa ăn. Hộp này luôn nhận `loading` và giữ nút hành động ở TRÊN.
 *
 * Không phải `BottomSheet`: tấm trượt là nơi LÀM một việc, hộp này là nơi TRẢ LỜI một câu hỏi —
 * nó neo giữa màn, hẹp, và không cuộn.
 */
export function AlertDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  /** Bỏ trống thì dùng "Huỷ" của `Common.actions`. */
  cancelLabel?: string;
  /** Hành động không lấy lại được — nút chính chuyển sang tông cảnh báo. */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('Common.actions');

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <YStack f={1} jc="center" px={layout.screenX}>
        {/*
          Lớp phủ là ANH EM của hộp, không phải cha: bọc hộp trong một `Pressable` phủ toàn màn
          thì mọi cú chạm vào chính hộp cũng đóng nó.
        */}
        <Pressable style={appStyles.scrim} onPress={onCancel} accessibilityLabel={t('close')} />

        <YStack
          bg={colors.surface}
          br={radius.lg}
          p={layout.screenX}
          gap={space.md}
          accessibilityViewIsModal
          accessibilityRole="alert"
        >
          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
              {title}
            </Text>
            {message ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {message}
              </Text>
            ) : null}
          </YStack>

          <YStack gap={space.xs}>
            <Button
              label={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              loading={loading}
              onPress={onConfirm}
            />
            {/* Huỷ ở DƯỚI và không viền: nó là lối thoát, không phải một lựa chọn ngang hàng. */}
            <Button
              label={cancelLabel ?? t('cancel')}
              variant="ghost"
              disabled={loading}
              onPress={onCancel}
            />
          </YStack>
        </YStack>
      </YStack>
    </Modal>
  );
}
