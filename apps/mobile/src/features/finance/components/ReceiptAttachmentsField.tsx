import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet } from 'react-native';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DOCUMENT_UPLOAD_MAX_BYTES } from '@xeprime/types';
import { FieldLabel, FieldMessage } from '@/components/ui/Field';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { logger } from '@/lib/logger';
import {
  IMAGE_SOURCE,
  pickImages,
  pickPdfFile,
  uploadImageToR2,
  uploadPublicFileToR2,
  type ImageSource,
} from '@/lib/r2-image-upload';
import { useImageErrorMessage } from '@/lib/image-permission-message';
import { receiptsApi } from '../api';
import { RECEIPT_ATTACHMENTS_MAX } from '../constants';
import { colors, fontSize, iconSize, radius, space } from '@/theme/tokens';

const TILE = 84;

const styles = StyleSheet.create({
  image: { width: TILE, height: TILE, borderRadius: radius.md },
});

const MAX_MB = Math.round(DOCUMENT_UPLOAD_MAX_BYTES / (1024 * 1024));

/** Chứng từ là ảnh hay PDF — server không trả MIME, nên đọc từ đuôi URL như web đang làm. */
const isPdfUrl = (url: string) => url.toLowerCase().split('?')[0]?.endsWith('.pdf') === true;

/**
 * Chứng từ của phiếu thu/chi: ảnh hoá đơn HOẶC file PDF — bản native của
 * `ReceiptAttachmentsField`.
 *
 * Là một dải Ô VUÔNG, không phải danh sách dòng: ảnh hoá đơn thì **hiện chính nó** — một thẻ ghi
 * "IMG_2481.jpg · 1.2 MB" không nói được nó là hoá đơn xăng hay ảnh chụp nhầm màn hình, mà đó
 * đúng là câu hỏi người duyệt phiếu sẽ hỏi. PDF không có ảnh thu nhỏ nên giữ icon.
 *
 * Native không có một ô chọn tệp vạn năng, nên nút "Thêm tệp" mở một tấm trượt BA NGUỒN: máy
 * ảnh · thư viện ảnh · tệp PDF — cùng khuôn với ô giấy tờ của hồ sơ khách.
 *
 * Bucket CÔNG KHAI như ảnh xe (`/uploads/receipt-attachments/presign`): đây là hoá đơn xăng, rửa
 * xe, biên lai chuyển khoản — không mang giấy tờ tuỳ thân, nên không đi kho riêng tư.
 */
export function ReceiptAttachmentsField<T extends FieldValues>({
  control,
  name,
  label,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
}) {
  const t = useTranslations('Finance.receipts.form.attachments');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  /* Thiếu quyền máy ảnh · tệp bị từ chối · lỗi mạng — MỘT chỗ đổi lỗi thành chữ cho cả ba. */
  const imageErrorMessage = useImageErrorMessage(errorMessage);
  const { field, fieldState } = useController({ control, name });

  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const urls = (field.value as string[] | undefined) ?? [];
  const full = urls.length >= RECEIPT_ATTACHMENTS_MAX;

  const append = (url: string) => field.onChange([...urls, url]);
  const drop = (url: string) => field.onChange(urls.filter((candidate) => candidate !== url));

  const handleError = (error: unknown) => {
    logger.error('receipt attachment upload failed', { error });
    toast.showError(imageErrorMessage(error));
  };

  const addImage = async (source: ImageSource) => {
    setPicking(false);
    setBusy(true);
    try {
      const [image] = await pickImages(source, 1);
      if (image) append(await uploadImageToR2(image, receiptsApi.presignAttachment));
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  };

  const addPdf = async () => {
    setPicking(false);
    setBusy(true);
    try {
      const file = await pickPdfFile();
      if (file) append(await uploadPublicFileToR2(file, receiptsApi.presignAttachment));
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={label} />

      <XStack flexWrap="wrap" gap={space.sm}>
        {urls.map((url) => (
          <YStack key={url}>
            {isPdfUrl(url) ? (
              <YStack
                w={TILE}
                h={TILE}
                br={radius.md}
                bw={1}
                bc={colors.border}
                bg={colors.surfaceMuted}
                ai="center"
                jc="center"
              >
                <Ionicons
                  name="document-text-outline"
                  size={iconSize.lg}
                  color={colors.textMuted}
                />
              </YStack>
            ) : (
              <Image source={{ uri: url }} style={styles.image} contentFit="cover" />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tActions('remove')}
              onPress={() => drop(url)}
              style={removeStyle}
            >
              <Ionicons name="close" size={iconSize.sm} color={colors.onPrimary} />
            </Pressable>
          </YStack>
        ))}

        {full ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('add')}
            disabled={busy}
            onPress={() => setPicking(true)}
          >
            <YStack
              w={TILE}
              h={TILE}
              br={radius.md}
              bw={1}
              bc={colors.borderInput}
              ai="center"
              jc="center"
              gap={2}
              opacity={busy ? 0.5 : 1}
            >
              <Ionicons name="cloud-upload-outline" size={iconSize.md} color={colors.textMuted} />
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('add')}
              </Text>
            </YStack>
          </Pressable>
        )}
      </XStack>

      <FieldMessage
        error={fieldState.error?.message}
        hint={full ? t('tooMany', { max: RECEIPT_ATTACHMENTS_MAX }) : t('hint', { maxMb: MAX_MB })}
      />

      <BottomSheet open={picking} onClose={() => setPicking(false)} title={t('add')}>
        <SourceRow
          icon="camera-outline"
          label={t('sourceCamera')}
          onPress={() => void addImage(IMAGE_SOURCE.CAMERA)}
        />
        <SourceRow
          icon="images-outline"
          label={t('sourceLibrary')}
          onPress={() => void addImage(IMAGE_SOURCE.LIBRARY)}
        />
        <SourceRow icon="document-outline" label={t('sourcePdf')} onPress={() => void addPdf()} />
      </BottomSheet>
    </YStack>
  );
}

const removeStyle = {
  position: 'absolute' as const,
  top: -space.xs,
  right: -space.xs,
  width: 24,
  height: 24,
  borderRadius: 12,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: colors.danger,
};

function SourceRow({
  icon,
  label,
  onPress,
}: {
  icon: 'camera-outline' | 'images-outline' | 'document-outline';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      <XStack ai="center" gap={space.md} py={space.sm}>
        <Ionicons name={icon} size={iconSize.md} color={colors.textMuted} />
        <Text col={colors.text} fos={fontSize.body}>
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}
