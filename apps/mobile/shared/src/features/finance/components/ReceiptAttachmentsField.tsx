import { useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DOCUMENT_UPLOAD_MAX_BYTES } from '@xeprime/types';
import { FieldMessage } from '@/components/ui/Field';
import { ReceiptAttachmentRow } from './ReceiptAttachmentRow';
import { LineIcon } from '@/components/icons/LineIcon';
import { FONT_FAMILY } from '@/theme/fonts';
import { ImageSourceSheet } from '@/components/ui/ImageSourceSheet';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { logger } from '@/lib/logger';
import {
  pickImages,
  pickPdfFile,
  uploadImageToR2,
  uploadPublicFileToR2,
  type ImageSource,
} from '@/lib/r2-image-upload';
import { useImageErrorMessage } from '@/lib/image-permission-message';
import { getErrorMessage } from '@/lib/get-error-message';
import { receiptsApi } from '../api';
import { RECEIPT_ATTACHMENTS_MAX } from '../constants';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space, typeScale } from '@/theme/tokens';


const MAX_MB = Math.round(DOCUMENT_UPLOAD_MAX_BYTES / (1024 * 1024));

/** Chứng từ là ảnh hay PDF — server không trả MIME, nên đọc từ đuôi URL như web đang làm. */

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
  const colors = useColors();
  const t = useTranslations('Finance.receipts.form.attachments');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  /* Thiếu quyền máy ảnh · tệp bị từ chối · lỗi mạng — MỘT chỗ đổi lỗi thành chữ cho cả ba. */
  // Web `ReceiptAttachmentsField` nói câu nguyên văn của server khi tải tệp hỏng.
  const imageErrorMessage = useImageErrorMessage(getErrorMessage);
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
    <YStack gap={space.sm} accessibilityLabel={label}>
      {/*
        Figma "File Upload" `24512:130902`: ô viền ĐỨT nền `bg/gray-25`, nút vuông 40 icon Upload,
        chữ vàng "Nhấn để tải lên…" + dòng định dạng. Tệp đã tải hiện thành ô ảnh/PDF bên dưới.
      */}
      {full ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('add')}
          disabled={busy}
          onPress={() => setPicking(true)}
        >
          <XStack
            ai="center"
            gap={space.md}
            px={space.lg}
            py={space.md}
            br={radius.control}
            bw={1}
            bc={colors.borderInput}
            borderStyle="dashed"
            bg={colors.surfaceFaint}
            opacity={busy ? 0.5 : 1}
          >
            <YStack p={10} br={radius.control} bw={1} bc={colors.borderInput} bg={colors.surface}>
              <LineIcon name="upload" color={colors.textMuted} />
            </YStack>
            <YStack f={1} minWidth={0} gap={2}>
              <Text col={colors.brandShape} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fontFamily={FONT_FAMILY.medium}>
                {t('uploadCta')}
              </Text>
              <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} fontFamily={FONT_FAMILY.body}>
                {t('uploadHint', { maxMb: MAX_MB })}
              </Text>
            </YStack>
          </XStack>
        </Pressable>
      )}

      {/* Figma "_File upload item base" `24512:130902`: mỗi tệp một dòng - icon loại tệp, tên, trạng thái, nút gỡ đỏ (bỏ tải về, chốt 26/11/2026). */}
      {urls.map((url) => (
        <ReceiptAttachmentRow
          key={url}
          url={url}
          removeLabel={tActions('remove')}
          onRemove={drop}
        />
      ))}
      {/* Đang tải tệp lên: một dòng giữ chỗ cùng khuôn dòng tệp, kèm vòng quay - không để màn im lặng. */}
      {busy ? (
        <XStack
          ai="center"
          gap={space.md}
          px={space.lg}
          py={space.md}
          br={radius.control}
          bw={1}
          bc={colors.border}
          bg={colors.surface}
          accessibilityLiveRegion="polite"
          accessibilityLabel={t('uploadingFile')}
        >
          <YStack w={40} h={40} ai="center" jc="center" br={radius.sm} bg={colors.surfaceMuted}>
            <ActivityIndicator size="small" color={colors.brandShape} />
          </YStack>
          <YStack f={1} minWidth={0}>
            <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={22} fontFamily={FONT_FAMILY.medium}>
              {t('uploadingFile')}
            </Text>
          </YStack>
        </XStack>
      ) : null}

      <FieldMessage
        error={fieldState.error?.message}
        {...(full ? { hint: t('tooMany', { max: RECEIPT_ATTACHMENTS_MAX }) } : {})}
      />

      {/* Cùng popup chọn nguồn ảnh của cả app (Chụp ảnh · Chọn từ thư viện) + nút PDF bên dưới (chốt 26/11/2026). */}
      <ImageSourceSheet
        open={picking}
        onClose={() => setPicking(false)}
        title={t('add')}
        hint={t('uploadHint', { maxMb: MAX_MB })}
        onPick={(source) => void addImage(source)}
        extraAction={{ label: t('sourcePdf'), lineIcon: 'doc-align-left-6', onPress: () => void addPdf() }}
        libraryPrimary
      />
    </YStack>
  );
}
