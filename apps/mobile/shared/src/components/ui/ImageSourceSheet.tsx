import { XStack, YStack, Text } from 'tamagui';
import { useTranslations } from 'use-intl';
import { IMAGE_SOURCE, type ImageSource } from '@/lib/r2-image-upload';
import { useColors } from '@/theme/ThemeProvider';
import { typeScale } from '@/theme/tokens';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

/** Figma `24486:66049`: hai nút cách 12. */
const GAP_12 = 12;
/** Dưới bề ngang này mỗi nút không đủ chỗ cho "Chọn từ thư viện" + icon - hai nút xuống hai hàng (máy 360dp). */
const BUTTON_MIN = 168;

/**
 * Tấm chọn NGUỒN ảnh dùng chung của app: Chụp ảnh · Chọn từ thư viện (· Xoá ảnh). Mọi ô tải
 * ảnh/tệp mở đúng tấm này - ô ảnh xe, logo, giấy tờ xe, ảnh đại diện - để người dùng gặp một kiểu
 * duy nhất. `useImageUpload` dùng nó cho ảnh công khai; giấy tờ (bucket riêng tư) gọi thẳng với `onPick`.
 *
 * Dáng theo Figma Partner "Tải lên ảnh đại diện" (`24486:65997`): đầu tấm v2, hai nút viền đứng cạnh
 * nhau (icon nét Camera 1 · Image), gợi ý định dạng in nghiêng mờ BÊN DƯỚI. "Xoá ảnh" bản vẽ không
 * có - giữ làm một lối chữ đỏ dưới gợi ý để không mất thao tác gỡ ảnh (người dùng chốt 25/11/2026).
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
    <BottomSheet open={open} onClose={onClose} title={title} chrome="v2" headerDivider>
      <YStack gap={GAP_12}>
        <XStack gap={GAP_12} flexWrap="wrap">
          <YStack f={1} minWidth={BUTTON_MIN}>
            <Button
              label={t('takePhoto')}
              lineIcon="camera-1"
              variant="neutral"
              onPress={() => onPick(IMAGE_SOURCE.CAMERA)}
            />
          </YStack>
          <YStack f={1} minWidth={BUTTON_MIN}>
            <Button
              label={t('chooseFromLibrary')}
              lineIcon="image"
              variant="neutral"
              onPress={() => onPick(IMAGE_SOURCE.LIBRARY)}
            />
          </YStack>
        </XStack>
        {hint ? (
          <Text
            col={colors.textPlaceholder}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fontStyle="italic"
          >
            {hint}
          </Text>
        ) : null}
        {onRemove ? (
          <Button
            label={t('removeImage')}
            lineIcon="trash"
            variant="ghostDanger"
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
