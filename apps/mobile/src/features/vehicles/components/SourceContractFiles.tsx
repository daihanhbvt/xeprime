import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Linking, Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { SOURCE_CONTRACT_MAX_FILES } from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { FieldLabel } from '@/components/ui/Field';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useImageErrorMessage } from '@/lib/image-permission-message';
import {
  IMAGE_SOURCE,
  pickImages,
  uploadPrivateImageToR2,
  type ImageSource,
} from '@/lib/r2-image-upload';
import { colors, fontSize, iconSize, radius, sizing, space } from '@/theme/tokens';
import { vehiclesApi } from '../api';

const styles = StyleSheet.create({
  /** Tên tệp phải chiếm hết chiều ngang còn lại; nút gỡ đứng yên ở mép phải. */
  nameArea: { flex: 1 },
});

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
  const t = useTranslations('Common.components.fileList');
  const tActions = useTranslations('Common.actions');
  const tMedia = useTranslations('Vehicles.form.media');
  const toast = useAppToast();
  /* Thiếu quyền máy ảnh/thư viện có câu riêng — xem `useImageErrorMessage`. */
  const errorMessage = useImageErrorMessage(useErrorMessage());
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
    <YStack gap={space.xs}>
      <XStack ai="center" jc="space-between">
        <FieldLabel label={label} />
        <Text col={colors.textMuted} fos={fontSize.label}>
          {`${items.length}/${SOURCE_CONTRACT_MAX_FILES}`}
        </Text>
      </XStack>

      {items.length === 0 && !busy ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('empty')}
        </Text>
      ) : null}

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
          <XStack key={item.id} ai="center" gap={space.xs}>
            <Pressable
              onPress={() => void open(item)}
              accessibilityRole="button"
              accessibilityLabel={t('downloadFile', { name: item.name })}
              style={styles.nameArea}
            >
              <XStack ai="center" gap={space.xs} minHeight={sizing.touchTarget}>
                <Ionicons
                  name={
                    item.name.toLowerCase().endsWith('.pdf')
                      ? 'document-text-outline'
                      : 'image-outline'
                  }
                  size={iconSize.sm}
                  color={colors.textMuted}
                />
                <Text f={1} col={colors.primaryActive} fos={fontSize.bodySm} numberOfLines={1}>
                  {item.name}
                </Text>
              </XStack>
            </Pressable>

            {/*
              Nút tải xuống HIỆN RA thành chữ, không chỉ là cái tên tệp bấm được.

              Web có `<Button icon={<DownloadOutlined />}>Tải xuống</Button>` cho từng tệp; ở đây
              chỉ có tên tệp tô màu nhấn, mà trên điện thoại không có con trỏ chuột để hé lộ rằng
              nó bấm được — người dùng đọc ra là "app không tải xuống được".
            */}
            <Button
              label={tActions('download')}
              icon="download-outline"
              variant="ghost"
              size="sm"
              block={false}
              loading={downloadingId === item.id}
              onPress={() => void open(item)}
            />

            {canEdit ? (
              <Pressable
                onPress={() => field.onChange(items.filter((entry) => entry.id !== item.id))}
                accessibilityRole="button"
                accessibilityLabel={t('removeFile', { name: item.name })}
                hitSlop={space.xs}
              >
                <Ionicons name="trash-outline" size={iconSize.sm} color={colors.danger} />
              </Pressable>
            ) : null}
          </XStack>
        ),
      )}

      {busy ? (
        <XStack ai="center" gap={space.xs}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('uploading')}
          </Text>
        </XStack>
      ) : null}

      {fieldState.error?.message ? (
        <Text col={colors.danger} fos={fontSize.bodySm}>
          {fieldState.error.message}
        </Text>
      ) : (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {full ? t('maxReached', { count: SOURCE_CONTRACT_MAX_FILES }) : t('hintImageOnly')}
        </Text>
      )}

      {canEdit && !full ? (
        <Button
          label={t('upload')}
          icon="cloud-upload-outline"
          variant="secondary"
          size="sm"
          block={false}
          loading={busy}
          onPress={() => setChoosing(true)}
        />
      ) : null}

      <BottomSheet open={choosing} onClose={() => setChoosing(false)} title={label}>
        <YStack gap={space.sm}>
          <Button
            label={tMedia('takePhoto')}
            icon="camera-outline"
            variant="secondary"
            onPress={() => void add(IMAGE_SOURCE.CAMERA)}
          />
          <Button
            label={tMedia('chooseFromLibrary')}
            icon="images-outline"
            variant="secondary"
            onPress={() => void add(IMAGE_SOURCE.LIBRARY)}
          />
        </YStack>
      </BottomSheet>
    </YStack>
  );
}
