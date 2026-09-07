import type { ReactNode } from 'react';
import { Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  confirmLabel,
  cancelLabel,
  destructive = false,
  loading = false,
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
  const insets = useSafeAreaInsets();

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
        <Pressable style={appStyles.scrim} onPress={onCancel} accessibilityLabel={t('close')} />

        {/*
          `pb` cộng thêm safe-area ĐÁY: thanh điều hướng Android nằm ĐÈ lên cửa sổ modal, và
          không cộng nó vào thì nút "Huỷ" — nút dưới cùng — bị che mất một nửa.
        */}
        <YStack
          bg={colors.surface}
          borderTopLeftRadius={radius.lg}
          borderTopRightRadius={radius.lg}
          px={layout.screenX}
          pt={layout.screenX}
          pb={layout.screenX + insets.bottom}
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
