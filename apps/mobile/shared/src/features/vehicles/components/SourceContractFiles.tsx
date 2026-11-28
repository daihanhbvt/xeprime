import { useState } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { Linking } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { SOURCE_CONTRACT_MAX_FILES } from '@xeprime/types';
import { ImageSourceSheet } from '@/components/ui/ImageSourceSheet';
import { FieldLabel } from '@/components/ui/Field';
import { UploadingFileRow } from '@/components/ui/UploadingFileRow';
import { Button } from '@/components/ui/Button';
import { ReceiptAttachmentRow } from '@/features/finance/components/ReceiptAttachmentRow';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useImageErrorMessage } from '@/lib/image-permission-message';
import { getErrorMessage } from '@/lib/get-error-message';
import {
  pickImages,
  pickPdfFile,
  uploadPrivateFileToR2,
  uploadPrivateImageToR2,
  type ImageSource,
} from '@/lib/r2-image-upload';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, iconSize, radius, space, typeScale } from '@/theme/tokens';
import { vehiclesApi } from '../api';

/**
 * Một tài liệu trong form — CHỈ metadata server phát, KHÔNG có URL nào (Wave 4.1).
 * `id = null` + `status = 'legacy'` là bản ghi Wave 4 cũ: chỉ hiển thị kèm yêu cầu tải lên lại,
 * không tải về và không gỡ được từ client.
 */
interface ContractFileItem {
  id: string | null;
  name: string;
  size?: number | null;
  status: 'ready' | 'legacy';
}

/**
 * Hồ sơ hợp đồng của một xe — bản native của `FileListField` bên web.
 *
 * Cùng luồng riêng tư: presign theo XE → PUT thẳng bucket riêng tư → `complete` để server xác
 * minh (HEAD + soi byte đầu) → nhận metadata `ready`. Tải về xin signed URL MỚI cho từng cú
 * chạm — không URL nào nằm trong form state hay DB.
 *
 * Khác web đúng một chỗ, và là khác biệt NĂNG LỰC NỀN TẢNG chứ không phải nghiệp vụ: web mở
 * `<input type="file">` nên chọn được cả PDF, native chụp ảnh hoặc lấy từ thư viện ảnh. Cùng
 * endpoint, cùng trần tệp, cùng thứ được lưu — và PDF do web tải lên vẫn mở được ở đây.
 */
export function SourceContractFiles<T extends FieldValues>({
  control,
  name,
  vehicleId,
  label,
  canEdit,
}: {
  control: Control<T>;
  name: Path<T>;
  vehicleId: string;
  label: string;
  canEdit: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Common.components.fileList');
  const tImage = useTranslations('Common.image');
  const toast = useAppToast();
  /*
   * Câu NGUYÊN VĂN của server (`getErrorMessage`), như ô tải ảnh/tệp bên web: hỏng ở bước PUT lên
   * R2 không có mã lỗi, và câu của nó là thứ duy nhất nói được đã ngã ở đâu. Thiếu quyền máy
   * ảnh/thư viện vẫn có câu riêng — xem `useImageErrorMessage`.
   */
  const errorMessage = useImageErrorMessage(getErrorMessage);
  const { field, fieldState } = useController({ control, name });

  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const items = (field.value as ContractFileItem[] | null) ?? [];
  const full = items.length >= SOURCE_CONTRACT_MAX_FILES;

  async function add(source: ImageSource) {
    setChoosing(false);
    setBusy(true);
    try {
      const picked = await pickImages(source, SOURCE_CONTRACT_MAX_FILES - items.length);
      if (picked.length === 0) return;

      /*
       * Nối vào danh sách sau TỪNG tệp, không gom một mẻ ở cuối: một tệp hỏng giữa chừng không
       * được kéo theo những tệp đã tải xong — đúng kỷ luật partial failure của web.
       *
       * Cộng dồn vào biến CỤC BỘ chứ không đọc lại `field.value`: `field` là đối tượng của lần
       * render đang chạy, nên trong vòng lặp nó vẫn trả danh sách lúc bắt đầu — chọn ba ảnh thì
       * chỉ ảnh cuối ở lại.
       */
      let next = (field.value as ContractFileItem[] | null) ?? [];
      for (const image of picked) {
        const fileId = await uploadPrivateImageToR2(image, (meta) =>
          vehiclesApi.presignSourceContract(vehicleId, meta),
        );
        const uploaded = await vehiclesApi.completeSourceContract(vehicleId, fileId);
        next = [
          ...next,
          {
            id: uploaded.id ?? fileId,
            name: uploaded.name,
            size: uploaded.size ?? null,
            status: 'ready' as const,
          },
        ];
        field.onChange(next);
      }
    } catch (error) {
      toast.showError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  /** PDF hợp đồng (web nhận `application/pdf`) - kiểm MIME + dung lượng trong `uploadPrivateFileToR2`. */
  async function addPdf() {
    setChoosing(false);
    setBusy(true);
    try {
      const file = await pickPdfFile();
      if (!file) return;
      const { fileId } = await uploadPrivateFileToR2(file, (meta) =>
        vehiclesApi.presignSourceContract(vehicleId, meta),
      );
      const uploaded = await vehiclesApi.completeSourceContract(vehicleId, fileId);
      field.onChange([
        ...((field.value as ContractFileItem[] | null) ?? []),
        { id: uploaded.id ?? fileId, name: uploaded.name, size: uploaded.size ?? null, status: 'ready' as const },
      ]);
    } catch (error) {
      toast.showError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function open(item: ContractFileItem) {
    if (!item.id) return;
    setDownloadingId(item.id);
    try {
      // URL ký sống ~2 phút, xin mới cho từng cú chạm — không giữ lại ở bất cứ đâu.
      const ticket = await vehiclesApi.sourceContractDownload(vehicleId, item.id);
      await Linking.openURL(ticket.downloadUrl);
    } catch (error) {
      toast.showError(errorMessage(error));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <YStack gap={space.sm + space.xs}>
      {/*
        Figma "Hợp đồng & Chứng từ" `24238:61831` (chốt 27/11/2026): không nhãn ô/đếm riêng (tiêu đề
        thẻ đã nói) - mỗi tệp một dòng "_File upload item base" (icon loại tệp, tên, ✓ 100%, Tải về ·
        Xoá), rồi nút viền "+ Tải lên tài liệu" kèm dòng định dạng nghiêng bên phải.
      */}
      {/* Nhãn ô + ⓘ định dạng (PDF, JPG, PNG - tối đa 10MB) - người dùng chốt 27/11/2026. */}
      <FieldLabel label={label} hint={t('hint')} />
      {items.map((item, index) =>
        item.status === 'legacy' ? (
          /* Bản ghi Wave 4 cũ (từng là URL công khai): không mở, không gỡ — chờ tải lên lại. */
          <YStack
            key={`legacy-${item.name}-${index}`}
            gap={2}
            p={space.sm}
            br={radius.sm}
            bg={colors.warningSurface}
          >
            <XStack ai="center" gap={space.xs}>
              <Ionicons name="warning" size={iconSize.sm} color={colors.warning} />
              <Text f={1} col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
                {item.name}
              </Text>
            </XStack>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('legacyNote')}
            </Text>
          </YStack>
        ) : (
          <ReceiptAttachmentRow
            key={item.id}
            url={item.id ?? item.name}
            name={item.name}
            downloadLabel={t('downloadFile', { name: item.name })}
            onDownload={() => void open(item)}
            downloading={downloadingId === item.id}
            {...(canEdit
              ? {
                  removeLabel: t('removeFile', { name: item.name }),
                  onRemove: () => field.onChange(items.filter((entry) => entry.id !== item.id)),
                }
              : {})}
          />
        ),
      )}

      {busy ? <UploadingFileRow label={t('uploading')} /> : null}

      {canEdit && !full ? (
        <XStack>
          <Button
            label={t('upload')}
            lineIcon="add"
            variant="neutral"
            size="card"
            shape="square"
            block={false}
            loading={busy}
            onPress={() => setChoosing(true)}
          />
        </XStack>
      ) : null}
      {fieldState.error?.message ? (
        <Text col={colors.danger} fos={fontSize.bodySm}>
          {fieldState.error.message}
        </Text>
      ) : full ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('maxReached', { count: SOURCE_CONTRACT_MAX_FILES })}
        </Text>
      ) : null}

      {/* Cùng tấm chọn nguồn của cả app: Chụp ảnh · Chọn tệp PDF, "Chọn từ thư viện" là nút chính. */}
      <ImageSourceSheet
        open={choosing}
        onClose={() => setChoosing(false)}
        title={label}
        onPick={(source) => void add(source)}
        extraAction={{ label: tImage('sourcePdf'), lineIcon: 'doc-align-left-6', onPress: () => void addPdf() }}
        libraryPrimary
      />
    </YStack>
  );
}
