import { YStack, Text } from 'tamagui';
import { useTranslations } from 'use-intl';
import { IMAGE_SOURCE, type ImageSource } from '@/lib/r2-image-upload';
import { useColors } from '@/theme/ThemeProvider';
import { fieldFontSize, space } from '@/theme/tokens';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

/**
 * Tấm chọn NGUỒN ảnh dùng chung của app: Chụp ảnh · Chọn từ thư viện (· Xoá ảnh). Mọi ô tải
 * ảnh/tệp mở đúng tấm này - ô ảnh xe, logo, giấy tờ xe - để người dùng gặp một kiểu duy nhất.
 * `useImageUpload` dùng nó cho ảnh công khai; giấy tờ (bucket riêng tư) gọi thẳng với `onPick`.
 */
export function ImageSourceSheet({
  open,
  onClose,
  title,
  hint,
  onPick,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hint?: string | undefined;
  onPick: (source: ImageSource) => void;
  onRemove?: (() => void) | undefined;
}) {
  const colors = useColors();
  const t = useTranslations('Common.image');
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <YStack gap={space.sm}>
        {hint ? (
          <Text col={colors.textMuted} fos={fieldFontSize.message}>
            {hint}
          </Text>
        ) : null}
        <Button
          label={t('takePhoto')}
          icon="camera-outline"
          variant="secondary"
          onPress={() => onPick(IMAGE_SOURCE.CAMERA)}
        />
        <Button
          label={t('chooseFromLibrary')}
          icon="images-outline"
          variant="secondary"
          onPress={() => onPick(IMAGE_SOURCE.LIBRARY)}
        />
        {onRemove ? (
          <Button
            label={t('removeImage')}
            icon="trash-outline"
            variant="danger"
            onPress={() => {
              onClose();
              onRemove();
            }}
          />
        ) : null}
      </YStack>
    </BottomSheet>
  );
}
