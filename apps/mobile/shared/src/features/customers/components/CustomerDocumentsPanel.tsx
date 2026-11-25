import FileImageOutlined from '@ant-design/icons-svg/es/asn/FileImageOutlined';
import { Ionicons } from '@/components/icons/Ionicons';
import { LineIcon } from '@/components/icons/LineIcon';
import FilePdfOutlined from '@ant-design/icons-svg/es/asn/FilePdfOutlined';
import LoadingOutlined from '@ant-design/icons-svg/es/asn/LoadingOutlined';
import { AntIcon } from '@/components/icons/AntIcon';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { Linking, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  CUSTOMER_DOCUMENT_EXPIRY_META,
  CUSTOMER_DOCUMENT_TYPE,
  IDENTITY_VERIFY_METHOD,
  IDENTITY_VERIFY_METHOD_VALUES,
  STATUS_COLOR,
  type CustomerDocumentExpiry,
  type CustomerDocumentType,
  type IdentityVerifyMethod,
} from '@xeprime/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { ActionSheetButtons } from '@/components/ui/ActionSheetButtons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
// Hạn giấy tờ nằm ở QUÁ KHỨ được (một CCCD hết hạn năm ngoái) — dùng chung sàn với mọi ô ngày.
import { FORM_DATE_FLOOR } from '@/components/ui/DateField';
import { FieldBox } from '@/components/ui/FieldBox';
import { IconButton } from '@/components/ui/IconButton';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Pill } from '@/components/ui/Pill';
import { TextControl } from '@/components/ui/TextControl';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { getErrorCode } from '@/lib/api-client';
import { useImageErrorMessage } from '@/lib/image-permission-message';
import { getErrorMessage } from '@/lib/get-error-message';
import {
  IMAGE_SOURCE,
  pickImages,
  pickPdfFile,
  uploadPrivateFileToR2,
  type ImageSource,
  type PickedFile,
} from '@/lib/r2-image-upload';
import { useAppFormat } from '@/i18n/use-app-format';
import { useResponsive } from '@/theme/use-responsive';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import { DOCUMENT_TYPE_VALUES, isPreviewableImage } from '../constants';
import {
  useCustomerDocumentPreviews,
  useCustomerDocuments,
  useDeleteCustomerDocument,
  useInvalidateCustomers,
  useUpdateCustomerDocument,
  useVerifyCustomerDocument,
} from '../hooks/use-customers';
import { customersApi, type CustomerDocument, type PresignCustomerDocumentInput } from '../api';

/** Figma "Identity Document Card" `24486:81199`: đệm/khe 12, ảnh 332 × 190,8, vùng tải lên cao 56. */
const CARD_PAD = 12;
const IMAGE_RATIO = 332 / 190.8;
const UPLOAD_ZONE_HEIGHT = 56;

/** Khung chờ của tab Giấy tờ - cùng hình dạng thẻ thật: ảnh · tên + viên trạng thái · ô tải lên. */
function DocumentsSkeleton() {
  return (
    <YStack gap={space.lg}>
      {[0, 1, 2].map((i) => (
        <Card key={i} padded={false}>
          <YStack p={CARD_PAD} gap={CARD_PAD}>
            {i === 0 ? <Skeleton aspectRatio={IMAGE_RATIO} /> : null}
            <XStack ai="center" jc="space-between" gap={space.sm}>
              <Skeleton width="45%" height={18} />
              <Skeleton width={84} height={22} round />
            </XStack>
            {i === 0 ? (
              <Skeleton width="60%" height={14} />
            ) : (
              <Skeleton width="100%" height={UPLOAD_ZONE_HEIGHT} />
            )}
          </YStack>
        </Card>
      ))}
    </YStack>
  );
}

const styles = StyleSheet.create({
  slotImage: { width: '100%', height: '100%' },
});

/** Ba loại giấy tờ LUÔN có một ô, kể cả khi chưa tải — web `FIXED_TYPES`. */
const FIXED_TYPES = [
  CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID,
  CUSTOMER_DOCUMENT_TYPE.DRIVER_LICENCE,
  CUSTOMER_DOCUMENT_TYPE.PASSPORT,
] as const;

/** Ô đang chờ chọn tệp: ô nào, loại nào, và (khi THAY) bản cũ sẽ gỡ sau khi bản mới lên xong. */
type UploadTarget = { slotKey: string; type: string; replaces?: CustomerDocument };

/**
 * Giấy tờ tuỳ thân của khách — bản native của `CustomerDocumentsPanel` web (sổ redesign §3.4).
 *
 * Đúng khuôn web: tiêu đề "Giấy tờ" + nút "+ Tải lên" (chọn loại trước); lưới ô CỐ ĐỊNH theo loại —
 * CCCD · Bằng lái · Hộ chiếu luôn có ô (ô rỗng là vùng tải lên viền đứt), mọi giấy tờ "khác" đã
 * có, và một ô "khác" rỗng ở cuối. Mỗi ô: ảnh/biểu tượng, tên loại, bốn dòng (chủ thẻ · số · thời
 * hạn + viên hạn · trạng thái), dòng tệp, rồi nút: mở tệp (PDF) · Gỡ · sửa · Thay (đã xác minh) /
 * Xác minh (chưa). "Thay" = tải bản mới RỒI gỡ bản cũ, như web.
 *
 * Luật tệp giữ nguyên: không URL sống lâu, thấy trạng thái ≠ mở được tệp, upload đứt thì chọn lại.
 * Khác web ở CÁCH CHỌN TỆP: ba nguồn (máy ảnh · thư viện · PDF) qua một tấm trượt.
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
  const colors = useColors();
  const t = useTranslations('Customers');
  const tCommon = useTranslations('Common.actions');
  const tDocs = useTranslations('Customers.profile.docs');
  const tApp = useTranslations('Customers.app.detail.docs');
  const tStates = useTranslations('Common.states');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const imageErrorMessage = useImageErrorMessage(getErrorMessage);
  const toast = useAppToast();
  const invalidate = useInvalidateCustomers();
  const { isTablet } = useResponsive();

  const { data, isLoading, isError, error, refetch } = useCustomerDocuments(customerId);
  const remove = useDeleteCustomerDocument();
  const verify = useVerifyCustomerDocument();

  const [editing, setEditing] = useState<CustomerDocument | null>(null);
  const [choosingType, setChoosingType] = useState(false);
  const [target, setTarget] = useState<UploadTarget | null>(null);
  const [uploading, setUploading] = useState<ReadonlySet<string>>(new Set());
  const [opening, setOpening] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CustomerDocument | null>(null);
  const [verifying, setVerifying] = useState<CustomerDocument | null>(null);
  const [zoomed, setZoomed] = useState<string | null>(null);

  const items = useMemo(() => data ?? [], [data]);
  // Ảnh thu nhỏ chỉ nạp cho người ĐƯỢC PHÉP mở tệp; thiếu quyền thì không request nào phát ra.
  const previewQ = useCustomerDocumentPreviews(customerId, items, canViewFiles);
  const previews = previewQ.data ?? {};
  const editable = canManage && !disabled;

  const slots = useMemo(() => {
    const result: { key: string; type: string; document: CustomerDocument | null }[] = [];
    for (const type of FIXED_TYPES) {
      const ofType = items.filter((d) => d.documentType === type);
      if (ofType.length === 0) result.push({ key: `empty-${type}`, type, document: null });
      for (const document of ofType) result.push({ key: document.id, type, document });
    }
    for (const document of items.filter((d) => d.documentType === CUSTOMER_DOCUMENT_TYPE.OTHER)) {
      result.push({ key: document.id, type: CUSTOMER_DOCUMENT_TYPE.OTHER, document });
    }
    result.push({ key: 'empty-other', type: CUSTOMER_DOCUMENT_TYPE.OTHER, document: null });
    return result;
  }, [items]);

  const setBusy = useCallback(
    (key: string, busy: boolean) =>
      setUploading((prev) => {
        const next = new Set(prev);
        if (busy) next.add(key);
        else next.delete(key);
        return next;
      }),
    [],
  );

  /** Presign → PUT thẳng lên bucket riêng tư → complete; THAY thì gỡ bản cũ sau khi bản mới xong. */
  const upload = useCallback(
    async (file: PickedFile, to: UploadTarget) => {
      setBusy(to.slotKey, true);
      try {
        const ticket = await uploadPrivateFileToR2(file, (meta) =>
          customersApi.presignDocument(customerId, {
            documentType: to.type as CustomerDocumentType,
            // Nhãn tự đặt chỉ có nghĩa với loại "khác" — gửi kèm loại khác bị CHECK của DB từ chối.
            customTypeName: to.replaces?.customTypeName ?? null,
            expiresAt: null,
            holderName: to.replaces?.holderName ?? null,
            documentNumber: to.replaces?.documentNumber ?? null,
            fileName: meta.fileName,
            contentType: meta.contentType as PresignCustomerDocumentInput['contentType'],
            fileSize: meta.fileSize,
          }),
        );
        await customersApi.completeDocument(customerId, ticket.documentId);
        if (to.replaces) {
          await remove.mutateAsync({ id: customerId, documentId: to.replaces.id });
          toast.showSuccess(tDocs('replaced'));
        } else {
          toast.showSuccess(t('documents.uploaded'));
        }
        invalidate();
      } catch (err) {
        toast.showError(
          getErrorCode(err) === API_ERROR_CODE.UPLOADS_NOT_CONFIGURED
            ? t('documents.uploadsNotConfigured')
            : // Web `uploadFile`: có MÃ lỗi thì dịch theo mã, không thì câu của server.
              getErrorCode(err)
              ? errorMessage(err)
              : imageErrorMessage(err),
        );
      } finally {
        setBusy(to.slotKey, false);
      }
    },
    [customerId, remove, invalidate, toast, t, tDocs, imageErrorMessage, errorMessage, setBusy],
  );

  const pickImage = useCallback(
    async (source: ImageSource) => {
      const to = target;
      setTarget(null);
      if (!to) return;
      try {
        const [image] = await pickImages(source, 1);
        if (!image) return; // huỷ không phải lỗi
        await upload(image, to);
      } catch (err) {
        toast.showError(imageErrorMessage(err));
      }
    },
    [target, upload, toast, imageErrorMessage],
  );

  const pickPdf = useCallback(async () => {
    const to = target;
    setTarget(null);
    if (!to) return;
    try {
      const file = await pickPdfFile();
      if (!file) return;
      await upload(file, to);
    } catch (err) {
      toast.showError(errorMessage(err));
    }
  }, [target, upload, toast, errorMessage]);

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

  const typeLabel = (type: string, document: CustomerDocument | null) =>
    type === CUSTOMER_DOCUMENT_TYPE.OTHER && document?.customTypeName
      ? document.customTypeName
      : domainLabel('customerDocumentType', type);

  if (isLoading && !data) return <DocumentsSkeleton />;
  if (isError && !data) {
    return (
      <ScreenError error={error} title={t('documents.errorTitle')} onRetry={() => void refetch()} />
    );
  }

  const fact = (label: string, value: ReactNode) => (
    <XStack jc="space-between" ai="center" gap={space.sm}>
      <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
        {label}
      </Text>
      {typeof value === 'string' ? (
        <Text
          f={1}
          ta="right"
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </XStack>
  );

  return (
    <YStack gap={space.lg}>
      <XStack flexWrap="wrap" mx={-space.xs}>
        {slots.map(({ key, type, document }) => {
          const busy = uploading.has(key);
          const previewUrl = document ? (previews[document.id] ?? null) : null;
          const isImage = document ? isPreviewableImage(document.mimeType) : true;
          const verified = Boolean(document?.verifiedAt);
          const badge = (
            <Pill
              label={
                !document
                  ? tDocs('notUploaded')
                  : verified
                    ? tDocs('verified')
                    : tDocs('notVerified')
              }
              tone={!document ? 'neutral' : verified ? 'success' : 'warning'}
            />
          );
          return (
            <YStack key={key} w={isTablet ? '50%' : '100%'} p={space.xs}>
              {/* Figma "Identity Document Card": đệm 12, ảnh trải hết thẻ, khe 12 giữa các khối. */}
              <Card padded={false}>
                <YStack p={CARD_PAD} gap={CARD_PAD}>
                  {document ? (
                    <YStack
                      w="100%"
                      aspectRatio={IMAGE_RATIO}
                      br={radius.control}
                      bg={colors.surfaceMuted}
                      ai="center"
                      jc="center"
                      ov="hidden"
                      {...(previewUrl
                        ? {
                            onPress: () => setZoomed(previewUrl),
                            accessibilityRole: 'button' as const,
                            accessibilityLabel: document.originalName,
                          }
                        : {})}
                    >
                      {previewUrl ? (
                        <Image
                          source={{ uri: previewUrl }}
                          style={styles.slotImage}
                          contentFit="cover"
                          cachePolicy="memory"
                        />
                      ) : (
                        // Web: `FileImageOutlined` cho ảnh, `FilePdfOutlined` cho tệp PDF.
                        <AntIcon
                          icon={isImage ? FileImageOutlined : FilePdfOutlined}
                          size={iconSize.lg}
                          color={colors.textMuted}
                        />
                      )}
                      {/* Con mắt chỉ cho tệp KHÔNG có ảnh xem trước (PDF cũ): mở tệp qua URL ký. */}
                      {canViewFiles && !isImage && !previewUrl ? (
                        <XStack
                          pos="absolute"
                          bottom={6}
                          right={6}
                          w={28}
                          h={28}
                          br={14}
                          ai="center"
                          jc="center"
                          bg={colors.primary}
                          bw={2}
                          bc={colors.surface}
                          onPress={() => {
                            if (opening !== document.id) void openDocument(document);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={t('documents.openFile')}
                        >
                          <Ionicons name="eye" size={14} color={colors.onPrimary} />
                        </XStack>
                      ) : null}
                    </YStack>
                  ) : null}

                  <XStack ai="center" jc="space-between" gap={space.sm}>
                    <Text
                      f={1}
                      minWidth={0}
                      col={colors.text}
                      fos={typeScale.title.fontSize}
                      lh={typeScale.title.lineHeight}
                      fow={fontWeight.semibold}
                      numberOfLines={1}
                    >
                      {typeLabel(type, document)}
                    </Text>
                    {badge}
                  </XStack>

                  {document ? (
                    <YStack gap={space.sm}>
                      {fact(tDocs('holder'), document.holderName ?? '-')}
                      {fact(
                        tDocs(`numberOf.${type}` as 'numberOf.other'),
                        document.documentNumber ?? '-',
                      )}
                      {fact(
                        tDocs('expiry'),
                        document.expiresAt ? (
                          <XStack ai="center" gap={space.xs}>
                            <Text
                              col={colors.text}
                              fos={typeScale.body.fontSize}
                              lh={typeScale.body.lineHeight}
                              fow={fontWeight.semibold}
                            >
                              {fmt.date(document.expiresAt)}
                            </Text>
                            <StatusBadge
                              label={domainLabel('customerDocumentExpiry', document.expiryStatus)}
                              color={
                                CUSTOMER_DOCUMENT_EXPIRY_META[
                                  document.expiryStatus as CustomerDocumentExpiry
                                ].color
                              }
                              size="sm"
                            />
                          </XStack>
                        ) : (
                          tDocs('noExpiry')
                        ),
                      )}
                      {/* Figma: dòng "Trạng thái" + viên chỉ khi CHƯA đối chiếu (đã đối chiếu thì viên chỉ ở tiêu đề). */}
                      {!verified
                        ? fact(tApp('status'), <Pill label={tDocs('notVerified')} tone="warning" />)
                        : null}
                    </YStack>
                  ) : null}

                  {document && editable ? (
                    <YStack gap={CARD_PAD} pt={CARD_PAD} borderTopWidth={1} borderTopColor={colors.borderSubtle}>
                      <XStack gap={space.sm} ai="center">
                        <Button
                          label={tDocs('remove')}
                          variant="dangerOutline"
                          size="compact"
                          onPress={() => setRemoving(document)}
                        />
                        {/* Nút CHỮ rõ ràng, không icon (người dùng 25/11/2026). */}
                        <Button
                          label={tDocs('edit')}
                          variant="neutral"
                          size="compact"
                          onPress={() => setEditing(document)}
                        />
                        <YStack f={1} minWidth={0}>
                          {verified ? (
                            <Button
                              label={tApp('replace')}
                              variant="neutral"
                              size="compact"
                              loading={busy}
                              onPress={() => setTarget({ slotKey: key, type, replaces: document })}
                            />
                          ) : (
                            <Button
                              label={tApp('verify')}
                              variant="gradient"
                              size="compact"
                              disabled={verify.isPending}
                              onPress={() => setVerifying(document)}
                            />
                          )}
                        </YStack>
                      </XStack>
                    </YStack>
                  ) : null}

                  {!document && editable ? (
                    // Vùng tải lên viền đứt (Figma "Hộ chiếu"): biểu tượng tải lên + "Tải lên ảnh {loại}".
                    <YStack
                      h={UPLOAD_ZONE_HEIGHT}
                      br={radius.control}
                      bw={1}
                      borderStyle="dashed"
                      bc={colors.border}
                      bg={colors.background}
                      ai="center"
                      jc="center"
                      onPress={busy ? undefined : () => setTarget({ slotKey: key, type })}
                      accessibilityRole="button"
                      accessibilityLabel={`${tDocs('upload')} - ${typeLabel(type, null)}`}
                    >
                      <XStack ai="center" gap={space.sm}>
                        {busy ? (
                          <AntIcon icon={LoadingOutlined} size={iconSize.sm} color={colors.textMuted} />
                        ) : (
                          <LineIcon name="upload" size={iconSize.sm} color={colors.placeholder} />
                        )}
                        <Text
                          col={colors.textMuted}
                          fos={typeScale.label.fontSize}
                          lh={typeScale.label.lineHeight}
                        >
                          {tApp('uploadImage', { type: typeLabel(type, null) })}
                        </Text>
                      </XStack>
                    </YStack>
                  ) : null}
                </YStack>
              </Card>
            </YStack>
          );
        })}
      </XStack>

      {editing ? (
        <EditDocumentSheet
          customerId={customerId}
          document={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {/* "+ Tải lên" ở đầu khối: chọn LOẠI trước (web Dropdown), rồi tới nguồn tệp. */}
      <BottomSheet
        open={choosingType}
        onClose={() => setChoosingType(false)}
        title={tDocs('upload')}
      >
        <YStack gap={space.sm}>
          {DOCUMENT_TYPE_VALUES.map((value) => (
            <Button
              key={value}
              label={domainLabel('customerDocumentType', value)}
              variant="secondary"
              onPress={() => {
                setChoosingType(false);
                setTarget({ slotKey: 'header', type: value });
              }}
            />
          ))}
        </YStack>
      </BottomSheet>

      {/* Ba nguồn tệp — bản native của ô `<Upload>` bên web. */}
      <BottomSheet
        open={target !== null}
        onClose={() => setTarget(null)}
        title={t('documents.pickSourceTitle')}
      >
        {/* Chỉ chụp ảnh / chọn ảnh - bỏ chọn tệp PDF (người dùng 16/11/2026); PDF cũ vẫn mở xem được. Hai hàng, có icon, "Chọn từ thư viện" là nút chính (25/11/2026). */}
        <ActionSheetButtons
          actions={[
            {
              key: 'camera',
              label: t('documents.pickCamera'),
              icon: 'camera',
              onPress: () => void pickImage(IMAGE_SOURCE.CAMERA),
            },
            {
              key: 'library',
              label: t('documents.pickLibrary'),
              icon: 'gallery',
              primary: true,
              onPress: () => void pickImage(IMAGE_SOURCE.LIBRARY),
            },
          ]}
        />
      </BottomSheet>

      {/* Đối chiếu THỦ CÔNG có ghi nhận — nói rõ đã soi bằng đường nào (web Dropdown phương thức). */}
      <BottomSheet
        open={verifying !== null}
        onClose={() => setVerifying(null)}
        title={tDocs('verify')}
      >
        <YStack gap={space.sm}>
          {IDENTITY_VERIFY_METHOD_VALUES.map((method) => (
            <Button
              key={method}
              label={domainLabel('identityVerifyMethod', method)}
              variant={method === IDENTITY_VERIFY_METHOD.IN_PERSON ? 'primary' : 'secondary'}
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

      {/* URL ký sống ~2 phút — `unavailableLabel` nói ra khi link đã chết. */}
      <PhotoViewer
        url={zoomed}
        unavailableLabel={tStates('imageUnavailable')}
        onClose={() => setZoomed(null)}
      />
    </YStack>
  );
}

/** "Sửa thông tin giấy tờ" — chủ thẻ / số / hạn, ảnh không đổi (web `EditDocumentDialog`, 02/11/2026). */
function EditDocumentSheet({
  customerId,
  document,
  onClose,
}: {
  customerId: string;
  document: CustomerDocument;
  onClose: () => void;
}) {
  const t = useTranslations('Customers.profile.docs');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const update = useUpdateCustomerDocument();
  const [holderName, setHolderName] = useState(document.holderName ?? '');
  const [documentNumber, setDocumentNumber] = useState(document.documentNumber ?? '');
  const [expiresAt, setExpiresAt] = useState<string | null>(document.expiresAt ?? null);
  const [picking, setPicking] = useState(false);

  async function submit() {
    if (update.isPending) return;
    try {
      await update.mutateAsync({
        id: customerId,
        documentId: document.id,
        input: {
          holderName: holderName.trim() || null,
          documentNumber: documentNumber.trim() || null,
          expiresAt,
        },
      });
      toast.showSuccess(t('saved'));
      onClose();
    } catch (err) {
      toast.showError(errorMessage(err));
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('dialogEdit')}
      footer={<Button label={t('save')} loading={update.isPending} onPress={() => void submit()} />}
    >
      <YStack gap={space.md}>
        <TextControl
          label={t('holder')}
          value={holderName}
          maxLength={160}
          onChangeText={setHolderName}
        />
        <TextControl
          label={t(`numberOf.${document.documentType}` as 'numberOf.other')}
          value={documentNumber}
          maxLength={60}
          onChangeText={setDocumentNumber}
        />
        <XStack ai="flex-end" gap={space.xs}>
          <YStack f={1} minWidth={0}>
            <FieldBox
              label={t('expiry')}
              value={expiresAt ? fmt.dateKey(expiresAt) : ''}
              placeholder={t('expiry')}
              icon="calendar-outline"
              onPress={() => setPicking(true)}
            />
          </YStack>
          {expiresAt ? (
            <IconButton
              icon="close-circle-outline"
              label={tCommon('clearValue')}
              onPress={() => setExpiresAt(null)}
            />
          ) : null}
        </XStack>
      </YStack>
      <DatePickerSheet
        open={picking}
        title={t('expiry')}
        value={expiresAt ?? ''}
        minDate={FORM_DATE_FLOOR}
        onClose={() => setPicking(false)}
        onChange={(value) => {
          setExpiresAt(value || null);
          setPicking(false);
        }}
      />
    </BottomSheet>
  );
}
