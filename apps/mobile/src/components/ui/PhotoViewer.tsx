import { useState } from 'react';
import { Image } from 'expo-image';
import { Modal, useWindowDimensions } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { IconButton } from './IconButton';
import { colors, fontSize, space } from '@/theme/tokens';

/** Nền của trình xem: gần đen tuyệt đối để ảnh là thứ duy nhất còn sáng trên màn. */
const VIEWER_BACKDROP = 'rgba(0,0,0,0.92)';

/** Ảnh chừa lại một dải trên–dưới để nút đóng và mép màn không dính vào ảnh. */
const VIEWER_HEIGHT_RATIO = 0.8;

/** Nút đóng nằm dưới thanh trạng thái — modal này vẽ tràn cả vùng đó. */
const CLOSE_TOP = space.xl + space.sm;

/**
 * Xem MỘT ảnh toàn màn hình.
 *
 * Tách khỏi `HandoverPhotoGrid` khi thư viện ảnh của hồ sơ xe cần đúng hành vi này — bản của
 * bàn giao đã giải xong hai cái bẫy (xem `key` dưới đây) và chép lại là chép cả rủi ro quên một
 * cái.
 *
 * `unavailableLabel` do NƠI GỌI truyền vào, không tự dịch: mỗi nơi có một lý do khác nhau khiến
 * ảnh không mở được — ảnh bàn giao là URL ký sống vài phút, ảnh hồ sơ xe thì không.
 */
export function PhotoViewer({
  url,
  unavailableLabel,
  onClose,
}: {
  /** `null` = đóng. Truyền URL để mở. */
  url: string | null;
  unavailableLabel: string;
  onClose: () => void;
}) {
  const t = useTranslations('Common.actions');
  const { width, height } = useWindowDimensions();
  const [failed, setFailed] = useState(false);

  return (
    <Modal visible={url != null} transparent animationType="fade" onRequestClose={onClose}>
      <YStack f={1} bg={VIEWER_BACKDROP} ai="center" jc="center">
        <XStack pos="absolute" top={CLOSE_TOP} right={space.sm} zi={1}>
          <IconButton icon="close" label={t('close')} onPress={onClose} tone="surface" />
        </XStack>
        {url && !failed ? (
          <Image
            /*
             * `key={url}` để mỗi URL là một `<Image>` MỚI.
             *
             * `failed` là state của component này; không có key thì một URL hỏng đặt cờ đó lên và
             * mọi ảnh mở sau đều hiện "không mở được" — dù chúng hoàn toàn bình thường.
             */
            key={url}
            source={{ uri: url }}
            style={{ width, height: height * VIEWER_HEIGHT_RATIO }}
            contentFit="contain"
            cachePolicy="memory-disk"
            onError={() => setFailed(true)}
            onLoad={() => setFailed(false)}
          />
        ) : (
          <Text col={colors.textInverse} fos={fontSize.body} ta="center" px={space.md}>
            {unavailableLabel}
          </Text>
        )}
      </YStack>
    </Modal>
  );
}
