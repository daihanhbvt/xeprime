import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Linking, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  CUSTOMER_DOCUMENT_EXPIRY_META,
  CUSTOMER_DOCUMENT_TYPE,
  IDENTITY_VERIFY_METHOD_VALUES,
  STATUS_COLOR,
  TENANT_CUSTOMER_FIELD_MAX,
  type CustomerDocumentExpiry,
  type CustomerDocumentType,
  type IdentityVerifyMethod,
} from '@xeprime/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
// Hạn giấy tờ nằm ở QUÁ KHỨ được (một CCCD hết hạn năm ngoái) — dùng chung sàn với mọi ô ngày.
import { FORM_DATE_FLOOR } from '@/components/ui/DateField';
import { FieldBox } from '@/components/ui/FieldBox';
import { IconButton } from '@/components/ui/IconButton';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { SelectControl } from '@/components/ui/SelectControl';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextControl } from '@/components/ui/TextControl';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { getErrorCode } from '@/lib/api-client';
import { useImageErrorMessage } from '@/lib/image-permission-message';
import {
  IMAGE_SOURCE,
  pickImages,
  pickPdfFile,
  uploadPrivateFileToR2,
  type ImageSource,
  type PickedFile,
} from '@/lib/r2-image-upload';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { DOCUMENT_TYPE_VALUES, isPreviewableImage } from '../constants';
import {
  useCustomerDocumentPreviews,
  useCustomerDocuments,
  useDeleteCustomerDocument,
  useInvalidateCustomers,
  useVerifyCustomerDocument,
} from '../hooks/use-customers';
import { customersApi, type CustomerDocument, type PresignCustomerDocumentInput } from '../api';

/** Ô ảnh thu nhỏ — vuông, đủ để nhận ra CCCD/GPLX bằng mắt mà không chiếm nửa thẻ. */
const THUMB = 56;

const styles = StyleSheet.create({
  thumbImage: { width: THUMB, height: THUMB, borderRadius: radius.sm },
});

/**
 * Giấy tờ tuỳ thân của khách (CCCD / GPLX / giấy tờ khác) — khu "Giấy tờ" của CUS-02.
 *
 * Ba nguyên tắc nhìn thấy được trên bề mặt này, y hệt web:
 *  - **Không có URL nào sống lâu.** Bấm "Mở tệp" mới xin một link ký ngắn hạn; link đó không vào
 *    state, không vào cache, và chỉ mở được nếu người dùng có `customers.documents.view_files`.
 *  - **Thấy trạng thái ≠ mở được tệp.** Nhân viên quầy biết khách đã có CCCD hay chưa mà không
 *    đương nhiên mở được kho ảnh giấy tờ của mọi khách cũ.
 *  - **Hỏng thì thử lại được.** Upload đứt giữa chừng không để lại gì trong danh sách; chọn lại
 *    tệp là xong (server chỉ nhận file đã xác minh nội dung).
 *
 * Khác web ở CÁCH CHỌN TỆP, không ở luật: web có một ô `<input type=file>`, native có ba nguồn
 * (máy ảnh · thư viện ảnh · tệp PDF) đi qua một tấm trượt.
 */
export function CustomerDocumentsPanel({
  customerId,
  canManage,
  canViewFiles,
  disabled,
}: {
  customerId: string;
  canManage: boolean;
  canViewFiles: boolean;
  /** Hồ sơ đang lưu trữ — xem được, không tải lên/gỡ được (backend cũng chặn). */
  disabled?: boolean;
}) {
  const t = useTranslations('Customers');
  const tCommon = useTranslations('Common.actions');
  const tStates = useTranslations('Common.states');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const imageErrorMessage = useImageErrorMessage(errorMessage);
  const toast = useAppToast();
  const invalidate = useInvalidateCustomers();

  const { data, isLoading, isError, error, refetch } = useCustomerDocuments(customerId);
  const remove = useDeleteCustomerDocument();
  const verify = useVerifyCustomerDocument();

  const [documentType, setDocumentType] = useState<string>(CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID);
  const [customTypeName, setCustomTypeName] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [pickingExpiry, setPickingExpiry] = useState(false);
  const [pickingSource, setPickingSource] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CustomerDocument | null>(null);
  const [verifying, setVerifying] = useState<CustomerDocument | null>(null);
  const [zoomed, setZoomed] = useState<string | null>(null);

  const isOtherType = documentType === CUSTOMER_DOCUMENT_TYPE.OTHER;

  const items = useMemo(() => data ?? [], [data]);
  // Ảnh thu nhỏ chỉ nạp cho người ĐƯỢC PHÉP mở tệp; thiếu quyền thì không request nào phát ra.
  const previewQ = useCustomerDocumentPreviews(customerId, items, canViewFiles);
  const previews = previewQ.data ?? {};

  const typeOptions = useMemo(
    () =>
      DOCUMENT_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('customerDocumentType', value),
      })),
    [domainLabel],
  );

  /**
   * Presign → PUT thẳng lên bucket riêng tư → complete (server HEAD + soi chữ ký byte đầu).
   * Nhị phân KHÔNG đi qua API, và không bước nào sinh ra một URL công khai.
   */
  const upload = useCallback(
    async (file: PickedFile) => {
      setUploading(true);
      try {
        const ticket = await uploadPrivateFileToR2(file, (meta) =>
          customersApi.presignDocument(customerId, {
            documentType: documentType as CustomerDocumentType,
            // Nhãn tự đặt chỉ có nghĩa với loại "khác" — gửi kèm loại khác bị CHECK của DB từ chối.
            customTypeName: isOtherType ? customTypeName.trim() || null : null,
            expiresAt,
            fileName: meta.fileName,
            // Thu hẹp về ĐÚNG union của contract; lớp chặn thật là `@IsIn` ở server.
            contentType: meta.contentType as PresignCustomerDocumentInput['contentType'],
            fileSize: meta.fileSize,
          }),
        );
        await customersApi.completeDocument(customerId, ticket.documentId);
        invalidate();
        toast.showSuccess(t('documents.uploaded'));
        setExpiresAt(null);
        setCustomTypeName('');
      } catch (err) {
        toast.showError(
          getErrorCode(err) === API_ERROR_CODE.UPLOADS_NOT_CONFIGURED
            ? t('documents.uploadsNotConfigured')
            : // Biết cả lý do TỪ CHỐI TỆP (quá lớn / sai định dạng) lẫn lỗi API thường.
              imageErrorMessage(err),
        );
      } finally {
        setUploading(false);
      }
    },
    [
      customerId,
      documentType,
      isOtherType,
      customTypeName,
      expiresAt,
      invalidate,
      toast,
      t,
      imageErrorMessage,
    ],
  );

  const pickImage = useCallback(
    async (source: ImageSource) => {
      setPickingSource(false);
      try {
        const [image] = await pickImages(source, 1);
        if (!image) return; // huỷ không phải lỗi
        await upload(image);
      } catch (err) {
        toast.showError(imageErrorMessage(err));
      }
    },
    [upload, toast, imageErrorMessage],
  );

  const pickPdf = useCallback(async () => {
    setPickingSource(false);
    try {
      const file = await pickPdfFile();
      if (!file) return;
      await upload(file);
    } catch (err) {
      toast.showError(errorMessage(err));
    }
  }, [upload, toast, errorMessage]);

  /** Mở PDF: xin signed URL NGAY LÚC BẤM rồi để hệ điều hành render — không giữ URL ở đâu. */
  const openDocument = useCallback(
    async (document: CustomerDocument) => {
      setOpening(document.id);
      try {
        const ticket = await customersApi.documentDownload(customerId, document.id);
        await Linking.openURL(ticket.downloadUrl);
      } catch (err) {
        toast.showError(errorMessage(err));
      } finally {
        setOpening(null);
      }
    },
    [customerId, toast, errorMessage],
  );

  return (
    <YStack gap={space.md}>
      <Callout tone="info">{t('hints.documents')}</Callout>

      {canManage && !disabled ? (
        <Card>
          <YStack gap={space.md}>
            <SelectControl
              label={t('documents.type')}
              value={documentType}
              options={typeOptions}
              onChange={setDocumentType}
            />
            {isOtherType ? (
              <TextControl
                label={t('documents.customName')}
                value={customTypeName}
                placeholder={t('documents.customNamePlaceholder')}
                maxLength={TENANT_CUSTOMER_FIELD_MAX.DOCUMENT_CUSTOM_TYPE_NAME}
                onChangeText={setCustomTypeName}
              />
            ) : null}
            <XStack ai="flex-end" gap={space.xs}>
              <YStack f={1} minWidth={0}>
                <FieldBox
                  label={t('documents.expiresAt')}
                  value={expiresAt ? fmt.dateKey(expiresAt) : ''}
                  placeholder={t('documents.expiresAt')}
                  icon="calendar-outline"
                  onPress={() => setPickingExpiry(true)}
                />
              </YStack>
              {/* Hạn giấy tờ KHÔNG bắt buộc — đặt nhầm thì phải gỡ được, không chỉ đổi. */}
              {expiresAt ? (
                <IconButton
                  icon="close-circle-outline"
                  label={tCommon('clearValue')}
                  onPress={() => setExpiresAt(null)}
                />
              ) : null}
            </XStack>
            <Button
              label={t('documents.upload')}
              icon="cloud-upload-outline"
              loading={uploading}
              onPress={() => setPickingSource(true)}
            />
          </YStack>
        </Card>
      ) : null}

      {isLoading && !data ? <SkeletonText lines={4} /> : null}

      {isError && !data ? (
        <ScreenError
          error={error}
          title={t('documents.errorTitle')}
          onRetry={() => void refetch()}
        />
      ) : null}

      {!isLoading && !isError && items.length === 0 ? (
        <ScreenMessage icon="folder-open-outline" title={t('documents.emptyTitle')} />
      ) : null}

      {items.map((document) => {
        const previewUrl = previews[document.id] ?? null;
        const isImage = isPreviewableImage(document.mimeType);
        const title =
          document.documentType === CUSTOMER_DOCUMENT_TYPE.OTHER && document.customTypeName
            ? document.customTypeName
            : domainLabel('customerDocumentType', document.documentType);

        return (
          <Card key={document.id}>
            <YStack gap={space.sm}>
              <XStack gap={space.sm} ai="flex-start">
                {/*
                  Ảnh thu nhỏ THẬT — chạm là phóng to toàn màn bằng đúng trình xem ảnh dùng chung.
                  Một ảnh hỏng KHÔNG kéo cả danh sách về lỗi: ô đó rơi về icon loại tệp.
                */}
                {previewUrl ? (
                  <IconTile onPress={() => setZoomed(previewUrl)} label={document.originalName}>
                    <Image
                      source={{ uri: previewUrl }}
                      style={styles.thumbImage}
                      contentFit="cover"
                      cachePolicy="memory"
                    />
                  </IconTile>
                ) : (
                  <IconTile>
                    <Ionicons
                      name={isImage ? 'image-outline' : 'document-text-outline'}
                      size={iconSize.lg}
                      color={colors.textMuted}
                    />
                  </IconTile>
                )}

                <YStack f={1} minWidth={0} gap={2}>
                  <Text
                    col={colors.text}
                    fos={fontSize.bodySm}
                    fow={fontWeight.semibold}
                    numberOfLines={2}
                  >
                    {title}
                  </Text>
                  {/* Tên file dài phải cắt bằng "…", không được đẩy nút hành động ra ngoài. */}
                  <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
                    {document.originalName} ·{' '}
                    {document.uploadedByName ?? t('documents.unknownUploader')} ·{' '}
                    {fmt.date(document.createdAt)}
                  </Text>
                </YStack>
              </XStack>

              <XStack gap={space.xs} flexWrap="wrap">
                <StatusBadge
                  label={domainLabel('customerDocumentExpiry', document.expiryStatus)}
                  color={
                    CUSTOMER_DOCUMENT_EXPIRY_META[document.expiryStatus as CustomerDocumentExpiry]
                      .color
                  }
                  size="sm"
                />
                {document.expiresAt ? (
                  <StatusBadge
                    label={t('documents.expiresTag', { date: fmt.date(document.expiresAt) })}
                    color={STATUS_COLOR.NEUTRAL}
                    size="sm"
                  />
                ) : null}
                {/*
                  Đối chiếu là việc RIÊNG với hạn giấy tờ: một CCCD còn hạn mà chưa ai soi vẫn là
                  rủi ro. Hiện cả hai trạng thái, không gộp thành một dấu "ổn".
                */}
                {document.verifiedAt ? (
                  <StatusBadge
                    label={t('documents.verified', { date: fmt.date(document.verifiedAt) })}
                    color={STATUS_COLOR.SUCCESS}
                    size="sm"
                  />
                ) : (
                  <StatusBadge
                    label={t('documents.notVerified')}
                    color={STATUS_COLOR.NEUTRAL}
                    size="sm"
                  />
                )}
              </XStack>

              <XStack gap={space.sm} ai="center" flexWrap="wrap">
                {/*
                  Ảnh đã có ô xem nhanh chạm-là-phóng-to, nên nút này chỉ còn cho PDF — thứ hệ
                  điều hành hiển thị tốt hơn bất cứ gì ta dựng trong app.
                */}
                {canViewFiles && !isImage ? (
                  <Button
                    label={t('documents.openFile')}
                    variant="secondary"
                    size="sm"
                    block={false}
                    icon="eye-outline"
                    loading={opening === document.id}
                    onPress={() => void openDocument(document)}
                  />
                ) : null}
                {canManage && !disabled ? (
                  <Button
                    label={document.verifiedAt ? t('documents.verifyAgain') : t('documents.verify')}
                    variant="secondary"
                    size="sm"
                    block={false}
                    icon="shield-checkmark-outline"
                    onPress={() => setVerifying(document)}
                  />
                ) : null}
                {canManage && !disabled ? (
                  <IconButton
                    icon="trash-outline"
                    label={t('documents.removeLabel', { name: document.originalName })}
                    tone="danger"
                    onPress={() => setRemoving(document)}
                  />
                ) : null}
              </XStack>
            </YStack>
          </Card>
        );
      })}

      <DatePickerSheet
        open={pickingExpiry}
        title={t('documents.expiresAt')}
        value={expiresAt ?? ''}
        minDate={FORM_DATE_FLOOR}
        onClose={() => setPickingExpiry(false)}
        onChange={(value) => {
          setExpiresAt(value || null);
          setPickingExpiry(false);
        }}
      />

      {/* Ba nguồn tệp — bản native của một ô `<input type=file>` bên web. */}
      <BottomSheet
        open={pickingSource}
        onClose={() => setPickingSource(false)}
        title={t('documents.pickSourceTitle')}
      >
        <YStack gap={space.sm}>
          <Button
            label={t('documents.pickCamera')}
            variant="secondary"
            icon="camera-outline"
            onPress={() => void pickImage(IMAGE_SOURCE.CAMERA)}
          />
          <Button
            label={t('documents.pickLibrary')}
            variant="secondary"
            icon="images-outline"
            onPress={() => void pickImage(IMAGE_SOURCE.LIBRARY)}
          />
          <Button
            label={t('documents.pickDocument')}
            variant="secondary"
            icon="document-outline"
            onPress={() => void pickPdf()}
          />
        </YStack>
      </BottomSheet>

      {/*
        Đối chiếu là thao tác THỦ CÔNG có ghi nhận — nhân viên tự soi VNeID hoặc bản gốc rồi tích.
        Hệ thống không gọi API định danh quốc gia, nên phải nói rõ đã soi bằng đường nào; về sau
        tra lại còn biết ai chịu trách nhiệm.
      */}
      <BottomSheet
        open={verifying !== null}
        onClose={() => setVerifying(null)}
        title={t('documents.verify')}
      >
        <YStack gap={space.sm}>
          {IDENTITY_VERIFY_METHOD_VALUES.map((method) => (
            <Button
              key={method}
              label={domainLabel('identityVerifyMethod', method)}
              variant="secondary"
              disabled={verify.isPending}
              onPress={() => {
                const document = verifying;
                if (!document) return;
                verify.mutate(
                  {
                    id: customerId,
                    documentId: document.id,
                    input: { verifyMethod: method as IdentityVerifyMethod },
                  },
                  {
                    onSuccess: () => {
                      toast.showSuccess(t('documents.verifyRecorded'));
                      setVerifying(null);
                    },
                    onError: (err) => {
                      toast.showError(errorMessage(err));
                      setVerifying(null);
                    },
                  },
                );
              }}
            />
          ))}
        </YStack>
      </BottomSheet>

      <AlertDialog
        open={removing !== null}
        title={t('documents.removeTitle')}
        confirmLabel={t('documents.removeOk')}
        cancelLabel={tCommon('close')}
        destructive
        loading={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const document = removing;
          if (!document) return;
          remove.mutate(
            { id: customerId, documentId: document.id },
            {
              onSuccess: () => {
                toast.showSuccess(t('documents.removed'));
                setRemoving(null);
              },
              onError: (err) => {
                toast.showError(errorMessage(err));
                setRemoving(null);
              },
            },
          );
        }}
      />

      {/*
        URL ký sống ~2 phút. Mở lại một ô ảnh sau khi để màn hình đứng lâu thì link đã chết —
        `unavailableLabel` nói ra điều đó thay vì để một khung đen không giải thích gì.
      */}
      <PhotoViewer
        url={zoomed}
        unavailableLabel={tStates('imageUnavailable')}
        onClose={() => setZoomed(null)}
      />
    </YStack>
  );
}

/** Ô vuông đầu hàng: ảnh thu nhỏ hoặc biểu tượng loại tệp. Chạm được khi có ảnh để phóng to. */
function IconTile({
  children,
  onPress,
  label,
}: {
  children: ReactNode;
  onPress?: () => void;
  label?: string;
}) {
  const body = (
    <YStack
      w={THUMB}
      h={THUMB}
      br={radius.sm}
      bg={colors.surfaceMuted}
      bw={1}
      bc={colors.borderSubtle}
      ai="center"
      jc="center"
      ov="hidden"
    >
      {children}
    </YStack>
  );

  if (!onPress) return body;

  return (
    <YStack
      onPress={onPress}
      accessibilityRole="button"
      {...(label === undefined ? {} : { accessibilityLabel: label })}
      minWidth={sizing.touchTarget}
      minHeight={sizing.touchTarget}
      ai="center"
      jc="center"
    >
      {body}
    </YStack>
  );
}
