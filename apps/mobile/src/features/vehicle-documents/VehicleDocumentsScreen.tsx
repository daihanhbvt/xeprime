import { useMemo, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Linking, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  STATUS_COLOR,
  VEHICLE_DOCUMENT_OCR_STATUS,
  VEHICLE_DOCUMENT_PRESENTATION,
  VEHICLE_DOCUMENT_PRESENTATION_META,
  VEHICLE_DOCUMENT_PRESENTATION_VALUES,
  VEHICLE_DOCUMENT_PRESET_VALUES,
  VEHICLE_DOCUMENT_TYPE,
  type StatusColor,
  type VehicleDocumentPresentation,
  type VehicleDocumentType,
} from '@xeprime/types';
import {
  vehicleDocumentCreateSchema,
  vehicleDocumentFormSchema,
  type VehicleDocumentCreateValues,
  type VehicleDocumentFormValues,
} from '@xeprime/validators';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Chip';
import { CheckOption } from '@/components/ui/RadioOption';
import { SelectField } from '@/components/ui/SelectField';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge, statusTone } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { VehicleEditTabs } from '@/features/vehicles/components/VehicleEditTabs';
import { DateField } from '@/features/vehicles/components/DateField';
import { useVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { ApiClientError, getErrorCode } from '@/lib/api-client';
import {
  IMAGE_SOURCE,
  pickImages,
  uploadPrivateImageToR2,
  type ImageSource,
  type PickedImage,
} from '@/lib/r2-image-upload';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel, type DomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useImageErrorMessage } from '@/lib/image-permission-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import {
  useApplyVehicleDocumentOcr,
  useArchiveVehicleDocument,
  useInvalidateVehicleDocuments,
  useSaveVehicleDocument,
  useVehicleDocument,
  useVehicleDocumentVersions,
  useVehicleDocuments,
} from './hooks/use-documents';
import {
  vehicleDocumentsApi,
  type ApplyOcrFieldsInput,
  type VehicleDocumentOcrJob,
  type VehicleDocumentSummary,
} from './api';

/** Ba loại chuẩn LUÔN có mặt trong danh mục, kể cả khi chưa có hồ sơ nào — như web. */
const STANDARD_TYPES: readonly VehicleDocumentType[] = [
  VEHICLE_DOCUMENT_TYPE.REGISTRATION,
  VEHICLE_DOCUMENT_TYPE.INSPECTION,
  VEHICLE_DOCUMENT_TYPE.INSURANCE,
];

/**
 * Biểu tượng theo LOẠI giấy tờ — cố ý không phải ảnh thu nhỏ của chính tài liệu.
 *
 * Cùng lý do với web: file nằm ở bucket riêng tư, chỉ mở được bằng signed URL sống ~2 phút, và
 * phần lớn giấy tờ xe là PDF. Ảnh thu nhỏ thật cần một bước sinh thumbnail ở server.
 */
const TYPE_ICON: Readonly<Record<VehicleDocumentType, IconName>> = {
  [VEHICLE_DOCUMENT_TYPE.REGISTRATION]: 'card-outline',
  [VEHICLE_DOCUMENT_TYPE.INSPECTION]: 'shield-checkmark-outline',
  [VEHICLE_DOCUMENT_TYPE.INSURANCE]: 'umbrella-outline',
  [VEHICLE_DOCUMENT_TYPE.OTHER]: 'document-text-outline',
};

/**
 * Tông màu của ô biểu tượng theo LOẠI giấy tờ — ba loại chuẩn mỗi loại một sắc, y như web.
 *
 * Đi qua `statusTone` chứ không tự chọn token: đó là chỗ DUY NHẤT dịch một vai trò màu ngữ
 * nghĩa sang token native (xem `StatusBadge`), và mỗi màn tự chọn lấy là mỗi màn một sắc xanh.
 */
const TYPE_TONE: Readonly<Record<VehicleDocumentType, StatusColor>> = {
  [VEHICLE_DOCUMENT_TYPE.REGISTRATION]: STATUS_COLOR.INFO,
  [VEHICLE_DOCUMENT_TYPE.INSPECTION]: STATUS_COLOR.SUCCESS,
  [VEHICLE_DOCUMENT_TYPE.INSURANCE]: STATUS_COLOR.WARNING,
  [VEHICLE_DOCUMENT_TYPE.OTHER]: STATUS_COLOR.NEUTRAL,
};

/** Cạnh ô biểu tượng đầu hàng — vuông, đủ ngưỡng chạm khi nó mang hành động. */
const TILE = sizing.touchTarget;

/** Đường kính huy hiệu góc của ô — bản native của `.rowTileHint` bên web. */
const TILE_HINT = 20;

const styles = StyleSheet.create({
  /** Cùng độ mờ khi nhấn với `IconButton` — hai thứ đứng cạnh nhau trên cùng một hàng. */
  pressed: { opacity: 0.7 },
});

interface DocumentRowModel {
  key: string;
  type: VehicleDocumentType;
  document: VehicleDocumentSummary | null;
}

/**
 * Một lượt tải file của MỘT hàng.
 *
 * Giữ lại `image` kể cả khi lỗi: "Thử lại" phải gửi đúng tấm vừa chọn — bắt người dùng mở lại
 * thư viện ảnh vì một lỗi mạng là bắt họ làm lại việc họ đã làm xong.
 */
interface UploadState {
  image: PickedImage;
  error?: string;
}

/** Sheet chi tiết mở ở chế độ nào: xem thông tin, hay nhập/sửa. */
interface DetailTarget {
  document: VehicleDocumentSummary;
  mode: 'view' | 'edit';
}

/**
 * Tên hàng.
 *
 * Loại chuẩn lấy nhãn từ `Domain.vehicleDocumentType`. Loại `other` lưu tên ở `customTypeName`,
 * và ô đó chứa MỘT TRONG HAI thứ: mã preset (chọn trong danh sách) hoặc chữ người dùng tự gõ.
 * `domainLabel(group, value, value)` tra mã trước rồi rơi về in nguyên văn — nên tên chọn sẵn
 * hiện đúng theo ngôn ngữ, còn tên tự đặt (và dữ liệu cũ gõ tay) vẫn hiện y như đã nhập.
 */
function titleOf(
  type: VehicleDocumentType,
  doc: VehicleDocumentSummary | null,
  domainLabel: DomainLabel,
): string {
  return doc?.type === VEHICLE_DOCUMENT_TYPE.OTHER && doc.customTypeName
    ? domainLabel('vehicleDocumentPreset', doc.customTypeName, doc.customTypeName)
    : domainLabel('vehicleDocumentType', type);
}

/** `presentation` đi trên dây là `string` — thu về union, mã lạ rơi về "chưa có". */
function toPresentation(value: string | null | undefined): VehicleDocumentPresentation {
  return VEHICLE_DOCUMENT_PRESENTATION_VALUES.includes(value as VehicleDocumentPresentation)
    ? (value as VehicleDocumentPresentation)
    : VEHICLE_DOCUMENT_PRESENTATION.MISSING;
}

function isForbidden(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 403;
}

/**
 * Giấy tờ xe (VEH-07 + VEH-08) — bản native của `VehicleDocumentsWorkspace` bên web.
 *
 * Danh mục là BA LOẠI CHUẨN luôn hiện sẵn (placeholder "Chưa có" khi thiếu) + các giấy tờ
 * `other` do gian hàng thêm. Endpoint danh sách chỉ trả bản ghi ĐÃ CÓ, nên hàng placeholder
 * phải dựng ở client — không dựng thì một chiếc xe mới mở màn này ra thấy trống trơn và không
 * biết mình còn thiếu giấy tờ gì.
 *
 * Bốn mức quyền, khớp guard backend: danh sách = `view` · metadata nhạy cảm = `view_details` ·
 * lịch sử + mở file = `view_files` · ghi/OCR/xoá = `manage`. Thiếu mức nào thì phần đó KHÔNG
 * được gọi — bắn request để nhận 403 rồi hiện lỗi là trải nghiệm tệ hơn một khối từ chối chủ động.
 *
 * File là TÀI LIỆU RIÊNG TƯ: tải lên qua presign → PUT bucket riêng tư → gắn (server xác minh);
 * xem lại qua signed URL ngắn hạn phát sau khi kiểm quyền. Không URL nào nằm trong state.
 *
 * Khác web đúng một chỗ, và là khác biệt NĂNG LỰC NỀN TẢNG chứ không phải nghiệp vụ: web mở
 * `<input type="file">` nên chọn được cả PDF, native chụp ảnh hoặc lấy từ thư viện ảnh. Cùng
 * endpoint, cùng trần tệp, cùng thứ được lưu — và PDF do web tải lên vẫn mở được ở đây.
 */
export function VehicleDocumentsScreen({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('Vehicles.documents');
  const tEdit = useTranslations('Vehicles.edit');
  const router = useRouter();
  const { has, isLoading: permissionsLoading } = usePermissions();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  /* Thiếu quyền máy ảnh/thư viện có câu riêng — xem `useImageErrorMessage`. */
  const errorMessage = useImageErrorMessage(useErrorMessage());

  const canView = has(PERMISSION.VEHICLE_DOCUMENT_VIEW);
  const canViewDetails = has(PERMISSION.VEHICLE_DOCUMENT_DETAIL_VIEW);
  const canViewFiles = has(PERMISSION.VEHICLE_DOCUMENT_FILE_VIEW);
  const canManage = has(PERMISSION.VEHICLE_DOCUMENT_MANAGE);

  const back = () => goBackOr(router, ROUTES.manage.vehicleEdit(vehicleId));
  const title = tEdit('tabs.documents');

  const vehicle = useVehicle(vehicleId, has(PERMISSION.VEHICLE_VIEW));
  const documents = useVehicleDocuments(vehicleId, canView);
  const invalidate = useInvalidateVehicleDocuments(vehicleId);
  const archive = useArchiveVehicleDocument(vehicleId);

  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const [adding, setAdding] = useState(false);
  const [detailFor, setDetailFor] = useState<DetailTarget | null>(null);
  const [historyFor, setHistoryFor] = useState<VehicleDocumentSummary | null>(null);
  const [reviewFor, setReviewFor] = useState<{
    document: VehicleDocumentSummary;
    job: VehicleDocumentOcrJob;
  } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [ocrBusyId, setOcrBusyId] = useState<string | null>(null);

  /** Hàng hiển thị: 3 loại chuẩn luôn có mặt (placeholder khi chưa có) + các giấy tờ `other`. */
  const rows = useMemo<DocumentRowModel[]>(() => {
    const list = documents.data ?? [];
    const byType = new Map(list.map((doc) => [doc.type, doc]));
    const standard = STANDARD_TYPES.map((type) => ({
      key: type as string,
      type,
      document: byType.get(type) ?? null,
    }));
    const others = list
      .filter((doc) => doc.type === VEHICLE_DOCUMENT_TYPE.OTHER)
      .map((doc) => ({
        key: doc.id,
        type: VEHICLE_DOCUMENT_TYPE.OTHER as VehicleDocumentType,
        document: doc,
      }));
    return [...standard, ...others];
  }, [documents.data]);

  function setUploadState(key: string, state: UploadState | null) {
    setUploads((current) => {
      const next = { ...current };
      if (state) next[key] = state;
      else delete next[key];
      return next;
    });
  }

  /**
   * Flow tải file: (tạo hồ sơ nếu chưa có) → presign theo giấy tờ → PUT bucket riêng tư → gắn
   * (server HEAD + soi chữ ký byte đầu). Hàng loại chuẩn chưa có hồ sơ thì bản ghi được tạo
   * NGAY TẠI ĐÂY — ba loại luôn hiện sẵn không đi qua bước "thêm loại giấy tờ".
   */
  async function startUpload(row: DocumentRowModel, image: PickedImage) {
    setUploadState(row.key, { image });
    try {
      const target =
        row.document ?? (await vehicleDocumentsApi.create(vehicleId, { type: row.type }));
      const fileId = await uploadPrivateImageToR2(image, (meta) =>
        vehicleDocumentsApi.presignVersion(vehicleId, target.id, meta),
      );
      // Gắn vào giấy tờ là bước BẮT BUỘC sau khi tải lên — server xác minh object rồi mới nhận.
      await vehicleDocumentsApi.attachVersion(vehicleId, target.id, fileId);
      setUploadState(row.key, null);
      invalidate();
      toast.showSuccess(t('upload.saved'));
    } catch (error) {
      setUploadState(row.key, { image, error: errorMessage(error) });
    }
  }

  async function pickAndUpload(row: DocumentRowModel, source: ImageSource) {
    try {
      const [image] = await pickImages(source, 1);
      if (!image) return; // huỷ không phải lỗi
      await startUpload(row, image);
    } catch (error) {
      toast.showError(errorMessage(error));
    }
  }

  async function openFile(doc: VehicleDocumentSummary) {
    if (!doc.activeVersionId) return;
    setDownloadingId(doc.id);
    try {
      // Signed URL sống ~2 phút, xin mới mỗi lần bấm — không lưu ở đâu cả.
      const ticket = await vehicleDocumentsApi.versionDownload(
        vehicleId,
        doc.id,
        doc.activeVersionId,
      );
      await Linking.openURL(ticket.downloadUrl);
    } catch (error) {
      toast.showError(errorMessage(error));
    } finally {
      setDownloadingId(null);
    }
  }

  async function runOcr(doc: VehicleDocumentSummary) {
    setOcrBusyId(doc.id);
    try {
      const job = await vehicleDocumentsApi.requestOcr(vehicleId, doc.id);
      invalidate();
      if (job.status === VEHICLE_DOCUMENT_OCR_STATUS.NEEDS_REVIEW) {
        setReviewFor({ document: doc, job });
      } else if (job.status === VEHICLE_DOCUMENT_OCR_STATUS.UNREADABLE) {
        toast.showError(t('ocr.unreadable'));
      } else {
        toast.showError(t('ocr.failed'));
      }
    } catch (error) {
      if (getErrorCode(error) === 'OCR_NOT_CONFIGURED') {
        // Chưa có provider OCR (thực tế hiện tại) — nói thẳng và mở đường nhập tay.
        toast.showInfo(t('ocr.notConfigured'));
        setDetailFor({ document: doc, mode: 'edit' });
        return;
      }
      toast.showError(errorMessage(error));
    } finally {
      setOcrBusyId(null);
    }
  }

  /**
   * Xoá = LƯU TRỮ ở backend (`archivedAt`): giấy tờ rời khỏi danh mục và loại chuẩn được thêm
   * lại, nhưng file + lịch sử phiên bản + audit vẫn còn để đối soát về sau. Sau khi xoá phải
   * đóng mọi sheet đang trỏ vào chính bản ghi đó, nếu không người dùng ở lại một form ghi vào
   * bản ghi không còn tồn tại và chỉ nhận 404 lúc bấm Lưu.
   *
   * Trả `true`/`false` thay vì ném: nơi gọi là bước xác nhận nằm TRONG tấm trượt của hàng, và
   * nó cần biết có được đóng lại không — xoá hỏng thì tấm trượt ở lại cùng câu lỗi.
   */
  async function removeDocument(row: DocumentRowModel): Promise<boolean> {
    const doc = row.document;
    if (!doc) return false;
    try {
      await archive.mutateAsync(doc.id);
      setUploadState(row.key, null);
      setDetailFor((current) => (current?.document.id === doc.id ? null : current));
      setHistoryFor((current) => (current?.id === doc.id ? null : current));
      setReviewFor((current) => (current?.document.id === doc.id ? null : current));
      toast.showSuccess(t('remove.done'));
      return true;
    } catch (error) {
      toast.showError(errorMessage(error));
      return false;
    }
  }

  if (!permissionsLoading && !canView) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('noPermissionTitle')}
            description={t('noPermissionBody')}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <AppHeader
        title={title}
        {...(vehicle.data
          ? {
              subtitle: [vehicle.data.name, vehicle.data.plateNumber]
                .filter(Boolean)
                .join(LIST_SEPARATOR),
            }
          : {})}
        onBack={back}
      />
      <VehicleEditTabs vehicleId={vehicleId} active={VEHICLE_EDIT_TAB.DOCUMENTS} />
      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={documents.isRefetching}
        onRefresh={() => void documents.refetch()}
        footer={
          canManage ? (
            <Button label={t('addType')} icon="add-outline" onPress={() => setAdding(true)} />
          ) : undefined
        }
      >
        {documents.isPending ? (
          <SkeletonText lines={8} />
        ) : documents.isError ? (
          <ScreenError
            error={documents.error}
            title={t('loadError')}
            onRetry={() => void documents.refetch()}
          />
        ) : (
          <YStack gap={layout.section}>
            {!canManage ? <Callout tone="info">{t('readOnly')}</Callout> : null}

            <Card>
              <YStack gap={space.sm}>
                <BlockTitle>{t('cardTitle')}</BlockTitle>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('cardSubtitle')}
                </Text>

                <YStack gap={space.md} pt={space.xs}>
                  {rows.map((row, index) => (
                    <YStack key={row.key} gap={space.md}>
                      {index > 0 ? <YStack h={1} bg={colors.borderSubtle} /> : null}
                      <DocumentRow
                        row={row}
                        title={titleOf(row.type, row.document, domainLabel)}
                        uploading={uploads[row.key] ?? null}
                        canManage={canManage}
                        canViewDetails={canViewDetails}
                        canViewFiles={canViewFiles}
                        downloading={downloadingId === row.document?.id}
                        ocrBusy={ocrBusyId === row.document?.id}
                        onPick={(source) => void pickAndUpload(row, source)}
                        onRetry={() => {
                          const state = uploads[row.key];
                          if (state) void startUpload(row, state.image);
                        }}
                        onCancelUpload={() => setUploadState(row.key, null)}
                        onOpen={() => row.document && void openFile(row.document)}
                        onOcr={() => row.document && void runOcr(row.document)}
                        onDetail={() =>
                          row.document && setDetailFor({ document: row.document, mode: 'view' })
                        }
                        onHistory={() => row.document && setHistoryFor(row.document)}
                        onRemove={() => removeDocument(row)}
                      />
                    </YStack>
                  ))}
                </YStack>
              </YStack>
            </Card>

            <Callout tone="info" title={t('ocrNoteTitle')}>
              {t('ocrNoteBody')}
            </Callout>
          </YStack>
        )}
      </Screen>

      {adding ? (
        <AddDocumentSheet
          vehicleId={vehicleId}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            invalidate();
          }}
        />
      ) : null}

      {detailFor ? (
        <DocumentDetailSheet
          vehicleId={vehicleId}
          target={detailFor}
          title={titleOf(
            detailFor.document.type as VehicleDocumentType,
            detailFor.document,
            domainLabel,
          )}
          canManage={canManage}
          canViewDetails={canViewDetails}
          onModeChange={(mode) => setDetailFor((current) => (current ? { ...current, mode } : null))}
          onClose={() => setDetailFor(null)}
          onSaved={() => {
            setDetailFor(null);
            invalidate();
          }}
        />
      ) : null}

      {historyFor ? (
        <DocumentHistorySheet
          vehicleId={vehicleId}
          documentId={historyFor.id}
          canViewFiles={canViewFiles}
          onClose={() => setHistoryFor(null)}
        />
      ) : null}

      {reviewFor ? (
        <OcrReviewSheet
          vehicleId={vehicleId}
          review={reviewFor}
          vehiclePlate={vehicle.data?.plateNumber ?? null}
          canViewDetails={canViewDetails}
          onClose={() => setReviewFor(null)}
          onApplied={() => {
            setReviewFor(null);
            invalidate();
          }}
        />
      ) : null}
    </>
  );
}

// ── Một hàng giấy tờ ─────────────────────────────────────────────────────────

/** Một mục thao tác của hàng — bản native của `RowAction` bên web, cùng bộ và cùng thứ tự. */
interface RowAction {
  key: string;
  label: string;
  icon: IconName;
  danger?: boolean;
  loading?: boolean;
  onPress: () => void;
}

/**
 * Khay thao tác của hàng đang mở ở bước nào. `null` = đóng.
 *
 * Là một khay BUNG RA TRONG HÀNG, không phải `Modal`. Bản trước dùng tấm trượt cho menu, và mục
 * "Xem chi tiết" bấm không ra gì: đóng tấm trượt rồi mở tấm chi tiết là đóng một `Modal` và mở
 * `Modal` khác trong cùng một nhịp — iOS bỏ qua lần mở thứ hai. `InteractionManager` KHÔNG cứu
 * được: hoạt ảnh của `Modal` chạy ở tầng hệ điều hành và không đăng ký interaction handle nào,
 * nên `runAfterInteractions` chạy gần như tức thì. Khay trong hàng gỡ bỏ hẳn tình huống đó —
 * mỗi lúc trong màn chỉ tồn tại đúng một `Modal`.
 */
type RowTray = 'actions' | 'source' | null;

function DocumentRow({
  row,
  title,
  uploading,
  canManage,
  canViewDetails,
  canViewFiles,
  downloading,
  ocrBusy,
  onPick,
  onRetry,
  onCancelUpload,
  onOpen,
  onOcr,
  onDetail,
  onHistory,
  onRemove,
}: {
  row: DocumentRowModel;
  title: string;
  uploading: UploadState | null;
  canManage: boolean;
  canViewDetails: boolean;
  canViewFiles: boolean;
  downloading: boolean;
  ocrBusy: boolean;
  onPick: (source: ImageSource) => void;
  onRetry: () => void;
  onCancelUpload: () => void;
  onOpen: () => void;
  onOcr: () => void;
  onDetail: () => void;
  onHistory: () => void;
  onRemove: () => Promise<boolean>;
}) {
  const t = useTranslations('Vehicles.documents');
  const tCommon = useTranslations('Common');
  const tMedia = useTranslations('Vehicles.form.media');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const [tray, setTray] = useState<RowTray>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const doc = row.document;
  const presentation = toPresentation(doc?.presentation);
  const meta = VEHICLE_DOCUMENT_PRESENTATION_META[presentation];
  const hasFile = Boolean(doc?.hasFile);
  const busy = uploading !== null && uploading.error === undefined;
  const expiryDate = doc?.expiresAt ? fmt.dateKey(doc.expiresAt) : null;

  /**
   * Chưa có file thì TẢI LÊN là việc duy nhất đáng làm ở hàng này — nó phải là một cái nút nhìn
   * thấy được, không phải một mục nằm sau nút ⋯. Đúng `maxInline={1}` của web: mục đầu tiên được
   * kéo ra ngoài, và vì đã ra ngoài thì KHÔNG lặp lại trong khay.
   */
  const uploadFirst = !hasFile && canManage && !busy;

  /** Đóng khay rồi mới chạy — mục mở một tấm trượt phải để hàng thu gọn lại trước. */
  const close = (run: () => void) => () => {
    setTray(null);
    run();
  };

  const actions: RowAction[] = [
    ...(doc && canViewDetails
      ? [
          {
            key: 'detail',
            label: t('row.viewDetail'),
            icon: 'document-text-outline' as IconName,
            onPress: close(onDetail),
          },
        ]
      : []),
    ...(hasFile && canViewFiles
      ? [
          {
            key: 'download',
            label: t('row.download'),
            icon: 'download-outline' as IconName,
            loading: downloading,
            onPress: close(onOpen),
          },
        ]
      : []),
    ...(canManage && !busy && !uploadFirst
      ? [
          {
            key: 'upload',
            // Cùng một hành động, hai câu chữ: chưa có file thì "tải lên", có rồi thì "thay thế".
            label: t('row.replaceFile'),
            icon: 'cloud-upload-outline' as IconName,
            onPress: () => setTray('source'),
          },
        ]
      : []),
    // OCR cần đọc được metadata hiện tại để đối soát — đòi thêm view_details.
    ...(hasFile && canManage && canViewDetails
      ? [
          {
            key: 'ocr',
            label: t('row.ocr'),
            icon: 'scan-outline' as IconName,
            loading: ocrBusy,
            onPress: close(onOcr),
          },
        ]
      : []),
    // Lịch sử phiên bản chứa tên file → sau quyền view_files.
    ...(hasFile && canViewFiles
      ? [
          {
            key: 'history',
            label: t('row.history'),
            icon: 'time-outline' as IconName,
            onPress: close(onHistory),
          },
        ]
      : []),
    ...(doc && canManage
      ? [
          {
            key: 'remove',
            label: t('row.delete'),
            icon: 'trash-outline' as IconName,
            danger: true,
            onPress: close(() => setConfirmRemove(true)),
          },
        ]
      : []),
  ];

  /**
   * Việc mà ô biểu tượng bên trái làm khi bấm: chưa có file thì mở chỗ chọn ảnh, có rồi thì mở
   * chính file đó. Không làm được việc nào (thiếu quyền) thì nó quay về một ô trang trí, không
   * phải một nút bấm vào không có gì xảy ra.
   */
  const tileMode: 'upload' | 'download' | null = uploadFirst
    ? 'upload'
    : hasFile && canViewFiles
      ? 'download'
      : null;

  const tone = statusTone(TYPE_TONE[row.type]);

  const tile = (
    <YStack>
      <XStack
        w={TILE}
        h={TILE}
        br={radius.md}
        bw={1}
        bc={colors.border}
        bg={tone.bg}
        ai="center"
        jc="center"
      >
        <Ionicons
          name={TYPE_ICON[row.type] ?? 'document-text-outline'}
          size={iconSize.lg}
          color={tone.fg}
        />
      </XStack>

      {/*
        Huy hiệu góc — thứ nói cho biết ô này BẤM ĐƯỢC và bấm thì việc gì xảy ra.
        Trên web vai đó do con trỏ chuột + hiệu ứng hover gánh một phần; native không có cả hai,
        nên thiếu nó thì ô đọc ra như một hình trang trí và "tải xuống" coi như không tồn tại.
      */}
      {tileMode ? (
        <XStack
          pos="absolute"
          right={-3}
          bottom={-3}
          w={TILE_HINT}
          h={TILE_HINT}
          br={radius.pill}
          bw={1}
          bc={colors.border}
          bg={colors.surface}
          ai="center"
          jc="center"
        >
          <Ionicons
            name={tileMode === 'upload' ? 'cloud-upload-outline' : 'download-outline'}
            size={iconSize.xs}
            color={colors.primaryActive}
          />
        </XStack>
      ) : null}
    </YStack>
  );

  return (
    <YStack gap={space.sm}>
      <XStack gap={space.sm} ai="flex-start">
        {tileMode ? (
          <Pressable
            onPress={tileMode === 'upload' ? () => setTray('source') : onOpen}
            style={({ pressed }) => (pressed ? styles.pressed : null)}
            accessibilityRole="button"
            accessibilityLabel={
              tileMode === 'upload' ? t('row.uploadFor', { title }) : t('row.downloadFor', { title })
            }
          >
            {tile}
          </Pressable>
        ) : (
          tile
        )}

        <YStack f={1} gap={2}>
          <XStack ai="center" gap={space.xs}>
            <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {title}
            </Text>
            <StatusBadge
              label={domainLabel('vehicleDocumentPresentation', presentation, meta.label)}
              color={meta.color}
              size="sm"
            />
          </XStack>

          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t.rich('row.expiry', {
              value: expiryDate ?? (hasFile ? t('row.noExpiry') : t('row.expiryUnknown')),
              b: strong,
            })}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t.rich('row.updatedAt', {
              // Hàng chưa có hồ sơ thì không có mốc cập nhật nào để nói — giữ đúng dấu gạch của
              // ô ngày hết hạn thay vì bịa ra ngày tạo.
              value: doc ? fmt.date(doc.updatedAt) : tCommon('labels.emptyValue'),
              b: strong,
            })}
          </Text>
        </YStack>

        {actions.length > 0 ? (
          <Pressable
            onPress={() => setTray((current) => (current === null ? 'actions' : null))}
            style={({ pressed }) => (pressed ? styles.pressed : null)}
            accessibilityRole="button"
            accessibilityState={{ expanded: tray !== null }}
            accessibilityLabel={t('row.actionsAria', { title })}
            hitSlop={space.xs}
          >
            <XStack w={TILE} h={TILE} ai="center" jc="center">
              <Ionicons
                name={tray === null ? 'ellipsis-horizontal' : 'chevron-up'}
                size={iconSize.lg}
                color={colors.textMuted}
              />
            </XStack>
          </Pressable>
        ) : null}
      </XStack>

      {presentation === VEHICLE_DOCUMENT_PRESENTATION.EXPIRING_SOON && expiryDate ? (
        <Callout tone="warning">{t('row.expiringSoon', { date: expiryDate })}</Callout>
      ) : null}
      {presentation === VEHICLE_DOCUMENT_PRESENTATION.EXPIRED && expiryDate ? (
        <Callout tone="danger">{t('row.expired', { date: expiryDate })}</Callout>
      ) : null}

      {uploading?.error !== undefined ? (
        <Callout tone="danger" title={t('upload.failed', { message: uploading.error })}>
          <XStack gap={space.xs}>
            <YStack f={1}>
              <Button
                label={tCommon('actions.cancel')}
                variant="secondary"
                size="sm"
                shape="square"
                onPress={onCancelUpload}
              />
            </YStack>
            <YStack f={1}>
              <Button label={tCommon('actions.retry')} size="sm" shape="square" onPress={onRetry} />
            </YStack>
          </XStack>
        </Callout>
      ) : busy && uploading ? (
        <XStack ai="center" gap={space.xs}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text f={1} col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
            {t('upload.inProgress', { fileName: uploading.image.fileName })}
          </Text>
        </XStack>
      ) : null}

      {/* Mục ĐẦU TIÊN của web được kéo ra thành nút thật khi hàng chưa có file (`maxInline={1}`). */}
      {uploadFirst ? (
        <Button
          label={t('row.upload')}
          icon="cloud-upload-outline"
          variant="accent"
          size="sm"
          shape="square"
          onPress={() => setTray('source')}
        />
      ) : null}

      {tray === 'source' ? (
        <YStack gap={space.xs}>
          {/*
            Web mở `<input type="file">` nên chọn được cả PDF; native phải hỏi trước lấy ảnh từ
            đâu, vì máy ảnh và thư viện là hai quyền hệ thống khác nhau.
          */}
          <Button
            label={tMedia('takePhoto')}
            icon="camera-outline"
            variant="secondary"
            size="sm"
            shape="square"
            onPress={() => {
              setTray(null);
              onPick(IMAGE_SOURCE.CAMERA);
            }}
          />
          <Button
            label={tMedia('chooseFromLibrary')}
            icon="images-outline"
            variant="secondary"
            size="sm"
            shape="square"
            onPress={() => {
              setTray(null);
              onPick(IMAGE_SOURCE.LIBRARY);
            }}
          />
          <Button
            label={tCommon('actions.cancel')}
            variant="ghost"
            size="sm"
            shape="square"
            onPress={() => setTray(null)}
          />
        </YStack>
      ) : tray === 'actions' ? (
        <YStack gap={space.xs}>
          {actions.map((action) => (
            <Button
              key={action.key}
              label={action.label}
              icon={action.icon}
              variant={action.danger ? 'danger' : 'secondary'}
              size="sm"
              shape="square"
              loading={action.loading ?? false}
              onPress={action.onPress}
            />
          ))}
        </YStack>
      ) : null}

      {/* Web hỏi bằng `Popconfirm` ngay trong menu; native dùng hộp xác nhận chuẩn của app. */}
      <AlertDialog
        open={confirmRemove}
        title={t('remove.title')}
        message={t('remove.body', { title })}
        confirmLabel={t('remove.ok')}
        destructive
        loading={removing}
        onConfirm={() => {
          setRemoving(true);
          void onRemove()
            .then((removed) => {
              if (removed) setConfirmRemove(false);
            })
            .finally(() => setRemoving(false));
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </YStack>
  );
}


// ── Thêm loại giấy tờ ───────────────────────────────────────────────────────

/**
 * Thêm một giấy tờ: CHỌN loại trong danh sách + đính kèm ảnh. Hết.
 *
 * Cố ý không có metadata (biển số, số khung, ngày cấp…): lúc bấm "Thêm", người dùng đang cầm tờ
 * giấy chứ chưa ngồi đọc nó — bắt điền chín ô ngay ở bước này là lý do người ta bỏ dở. Các
 * trường đó nhập sau ở sheet chi tiết, hoặc để "Nhập từ OCR" điền.
 *
 * Tên loại là DANH SÁCH CHỌN chứ không phải ô gõ tự do: cùng một loại giấy tờ gõ tay ra năm cách
 * viết thì không lọc, không thống kê và không dịch được. Chọn "Khác" mới mở ô nhập tên.
 */
function AddDocumentSheet({
  vehicleId,
  onClose,
  onCreated,
}: {
  vehicleId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations('Vehicles.documents');
  const tCommon = useTranslations('Common');
  const tMedia = useTranslations('Vehicles.form.media');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useImageErrorMessage(useErrorMessage());

  const [image, setImage] = useState<PickedImage | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const createResolver = useValidationResolver<VehicleDocumentCreateValues>(
    vehicleDocumentCreateSchema,
    'Vehicles.documents.validation',
  );

  const { control, handleSubmit } = useForm<VehicleDocumentCreateValues>({
    resolver: createResolver,
    defaultValues: { preset: '', customTypeName: '' },
  });
  const preset = useWatch({ control, name: 'preset' });
  const isCustom = preset === VEHICLE_DOCUMENT_TYPE.OTHER;

  const options = useMemo(
    () => [
      ...VEHICLE_DOCUMENT_PRESET_VALUES.map((value) => ({
        value,
        label: domainLabel('vehicleDocumentPreset', value, value),
      })),
      { value: VEHICLE_DOCUMENT_TYPE.OTHER, label: t('add.customOption') },
    ],
    [domainLabel, t],
  );

  /*
   * Hai nút nguồn ảnh nằm THẲNG trong form, không phải một tấm trượt thứ hai đè lên tấm này:
   * `Modal` chồng `Modal` là chỗ iOS hay nuốt mất lần mở sau, và ở đây cũng không cần —
   * chọn ảnh là một bước phụ của biểu mẫu, không phải một màn riêng.
   */
  async function pick(source: ImageSource) {
    setPicking(false);
    try {
      const [picked] = await pickImages(source, 1);
      if (picked) setImage(picked);
    } catch (error) {
      toast.showError(errorMessage(error));
    }
  }

  async function submit(values: VehicleDocumentCreateValues) {
    setSaving(true);
    try {
      // Tên lưu xuống: mã preset, hoặc chữ người dùng tự gõ khi chọn "Khác".
      const customTypeName = isCustom ? values.customTypeName.trim() : values.preset;
      const created = await vehicleDocumentsApi.create(vehicleId, {
        type: VEHICLE_DOCUMENT_TYPE.OTHER,
        customTypeName,
      });

      if (image) {
        try {
          const fileId = await uploadPrivateImageToR2(image, (meta) =>
            vehicleDocumentsApi.presignVersion(vehicleId, created.id, meta),
          );
          await vehicleDocumentsApi.attachVersion(vehicleId, created.id, fileId);
        } catch (error) {
          /*
           * Giấy tờ ĐÃ được tạo — không ném tiếp và không mời thử lại tại chỗ, vì bấm lại sẽ
           * tạo bản ghi thứ hai. Nói rõ trạng thái thật rồi đóng: file tải lại được từ menu
           * thao tác của chính hàng vừa thêm.
           */
          toast.showError(t('add.createdFileFailed', { message: errorMessage(error) }));
          onCreated();
          return;
        }
      }

      toast.showSuccess(t('add.created'));
      onCreated();
    } catch (error) {
      toast.showError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('add.title')}
      footer={
        <YStack gap={space.sm}>
          <Button
            label={t('add.submit')}
            loading={saving}
            onPress={() => void handleSubmit(submit)()}
          />
          <Button
            label={tCommon('actions.cancel')}
            variant="secondary"
            disabled={saving}
            onPress={onClose}
          />
        </YStack>
      }
    >
      <YStack gap={space.md}>
        <SelectField
          control={control}
          name="preset"
          label={t('add.typeLabel')}
          placeholder={t('add.typePlaceholder')}
          options={options}
          required
        />
        {isCustom ? (
          <TextField
            control={control}
            name="customTypeName"
            label={t('add.customLabel')}
            placeholder={t('add.customPlaceholder')}
            required
          />
        ) : null}

        <YStack gap={space.xs}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {t('add.fileLabel')}
          </Text>

          {image ? (
            <XStack ai="center" gap={space.xs} minHeight={sizing.touchTarget}>
              <Ionicons name="image-outline" size={iconSize.sm} color={colors.textMuted} />
              <Text f={1} col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
                {image.fileName}
              </Text>
              <Pressable
                onPress={() => setImage(null)}
                accessibilityRole="button"
                accessibilityLabel={tMedia('changeImage')}
                hitSlop={space.xs}
              >
                <Ionicons name="trash-outline" size={iconSize.sm} color={colors.danger} />
              </Pressable>
            </XStack>
          ) : null}

          {picking ? (
            <XStack gap={space.xs}>
              <YStack f={1}>
                <Button
                  label={tMedia('takePhoto')}
                  icon="camera-outline"
                  variant="secondary"
                  size="sm"
                  shape="square"
                  disabled={saving}
                  onPress={() => void pick(IMAGE_SOURCE.CAMERA)}
                />
              </YStack>
              <YStack f={1}>
                <Button
                  label={tMedia('chooseFromLibrary')}
                  icon="images-outline"
                  variant="secondary"
                  size="sm"
                  shape="square"
                  disabled={saving}
                  onPress={() => void pick(IMAGE_SOURCE.LIBRARY)}
                />
              </YStack>
            </XStack>
          ) : (
            <Button
              label={t('add.pickFile')}
              icon="cloud-upload-outline"
              variant="secondary"
              size="sm"
              block={false}
              disabled={saving}
              onPress={() => setPicking(true)}
            />
          )}

          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('add.fileHint')}
          </Text>
        </YStack>
      </YStack>
    </BottomSheet>
  );
}

// ── Chi tiết giấy tờ: xem thông tin + nhập/sửa ──────────────────────────────

interface DetailField {
  key: string;
  icon: IconName;
  label: string;
  value: string | null | undefined;
  placeholder: string;
  /** Chiếm trọn một hàng — đúng `.detailItemWide` của web (ô Ghi chú). */
  wide?: boolean;
}

/**
 * Lưới thông tin của sheet chi tiết — bản native của `.detailGrid`.
 *
 * Web dùng `grid-template-columns: repeat(auto-fill, minmax(170px, 1fr))`, ở bề ngang điện
 * thoại ra đúng HAI cột. React Native không có CSS grid, và `flexWrap` với bề rộng phần trăm
 * cộng `gap` là chỗ tràn dòng kinh điển — nên chia cặp ở đây rồi cho mỗi ô `f={1}`: hai cột
 * bằng nhau, không phép tính phần trăm nào để lệch.
 */
function DetailGrid({ items }: { items: readonly DetailField[] }) {
  const rows: DetailField[][] = [];
  for (const item of items) {
    const last = rows.at(-1);
    if (item.wide || !last || last.length === 2 || last[0]?.wide) rows.push([item]);
    else last.push(item);
  }

  return (
    <YStack gap={space.md}>
      {rows.map((pair) => (
        <XStack key={pair.map((item) => item.key).join('-')} gap={space.md}>
          {pair.map((item) => (
            <YStack key={item.key} f={1} minWidth={0}>
              <DetailItem item={item} />
            </YStack>
          ))}
          {/* Hàng lẻ: ô rỗng giữ cột thứ hai, nếu không ô cuối nở ra gấp đôi các ô trên nó. */}
          {pair.length === 1 && !pair[0]?.wide ? <YStack f={1} /> : null}
        </XStack>
      ))}
    </YStack>
  );
}

/** Một ô nhãn/giá trị. Giá trị trống hiện chữ mờ, không để ô rỗng — đúng `DetailItem` của web. */
function DetailItem({ item }: { item: DetailField }) {
  const filled = Boolean(item.value);

  return (
    <YStack gap={2}>
      <XStack ai="center" gap={space.xs}>
        <Ionicons name={item.icon} size={iconSize.sm} color={colors.textMuted} />
        <Text f={1} col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
          {item.label}
        </Text>
      </XStack>
      {/*
        Nhãn và giá trị CÙNG cỡ `bodySm`, phân biệt bằng độ đậm và màu — đúng quy ước của
        `DataRow`. Web cho giá trị lớn hơn nhãn một bậc, nhưng thang chữ của web bắt đầu ở 14
        cho nội dung thường còn app chạy phần lớn chữ ở 12: bê nguyên tỉ lệ đó sang đây thì dòng
        "Chưa nhập" — vốn chỉ là chỗ trống — đọc to hơn chính cái nhãn nó đứng dưới.

        `placeholder` chứ không phải `textMuted`: cùng màu với nhãn thì ô trống trông như đã
        có dữ liệu. Đúng vai `--xp-color-text-tertiary` mà web dùng cho `.detailPlaceholder`.
      */}
      <Text
        col={filled ? colors.text : colors.placeholder}
        fos={fontSize.bodySm}
        {...(filled ? { fow: fontWeight.medium } : {})}
      >
        {filled ? item.value : item.placeholder}
      </Text>
    </YStack>
  );
}

function DocumentDetailSheet({
  vehicleId,
  target,
  title,
  canManage,
  canViewDetails,
  onModeChange,
  onClose,
  onSaved,
}: {
  vehicleId: string;
  target: DetailTarget;
  title: string;
  canManage: boolean;
  canViewDetails: boolean;
  onModeChange: (mode: 'view' | 'edit') => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('Vehicles.documents');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const document = target.document;
  const editing = target.mode === 'edit';

  // Metadata nhạy cảm KHÔNG nằm trong danh sách — tải riêng khi mở, chỉ khi đủ quyền chi tiết.
  const detail = useVehicleDocument(vehicleId, document.id, canViewDetails);
  const current = detail.data;
  const save = useSaveVehicleDocument(vehicleId);

  const defaults = useMemo<VehicleDocumentFormValues>(
    () => ({
      type: document.type as VehicleDocumentFormValues['type'],
      customTypeName: current?.customTypeName ?? document.customTypeName ?? '',
      documentNumber: current?.documentNumber ?? '',
      holderName: current?.holderName ?? '',
      holderAddress: current?.holderAddress ?? '',
      plateNumber: current?.plateNumber ?? '',
      chassisNumber: current?.chassisNumber ?? '',
      engineNumber: current?.engineNumber ?? '',
      issuedAt: current?.issuedAt ?? null,
      expiresAt: current?.expiresAt ?? document.expiresAt ?? null,
      notes: current?.notes ?? '',
    }),
    [document, current],
  );
  const metadataResolver = useValidationResolver<VehicleDocumentFormValues>(
    vehicleDocumentFormSchema,
    'Vehicles.documents.validation',
  );
  const { control, handleSubmit } = useForm<VehicleDocumentFormValues>({
    resolver: metadataResolver,
    defaultValues: defaults,
    values: defaults,
  });

  const blocked = !canViewDetails || isForbidden(detail.error);
  const loading = canViewDetails && detail.isPending;

  function submit(values: VehicleDocumentFormValues) {
    if (!current) return; // chưa có rowVersion thì không được ghi
    const text = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);
    save.mutate(
      {
        documentId: document.id,
        body: {
          type: values.type,
          customTypeName:
            values.type === VEHICLE_DOCUMENT_TYPE.OTHER ? text(values.customTypeName) : null,
          documentNumber: text(values.documentNumber),
          holderName: text(values.holderName),
          holderAddress: text(values.holderAddress),
          plateNumber: text(values.plateNumber),
          chassisNumber: text(values.chassisNumber),
          engineNumber: text(values.engineNumber),
          issuedAt: values.issuedAt || null,
          expiresAt: values.expiresAt || null,
          notes: text(values.notes),
          // Optimistic concurrency: backend TỪ CHỐI update thiếu mốc này.
          expectedRowVersion: current.rowVersion,
        },
      },
      {
        onSuccess: () => {
          toast.showSuccess(t('metadata.saved'));
          onSaved();
        },
        onError: (error) => {
          // Sửa đè: người khác vừa lưu — không âm thầm ghi đè, mời tải lại.
          toast.showError(
            getErrorCode(error) === 'CONFLICT' ? t('metadata.conflict') : errorMessage(error),
          );
        },
      },
    );
  }

  const empty =
    current !== undefined &&
    ![
      current.plateNumber,
      current.holderName,
      current.holderAddress,
      current.chassisNumber,
      current.engineNumber,
      current.documentNumber,
      current.issuedAt,
      current.expiresAt,
      current.notes,
    ].some(Boolean);

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={editing ? t('metadata.editTitle', { title }) : t('detail.dialogTitle', { title })}
      footer={
        editing && !blocked && !loading ? (
          <YStack gap={space.sm}>
            <Button
              label={t('metadata.save')}
              loading={save.isPending}
              onPress={() => void handleSubmit(submit)()}
            />
            <Button
              label={tCommon('actions.cancel')}
              variant="secondary"
              disabled={save.isPending}
              onPress={onClose}
            />
          </YStack>
        ) : (
          /* Xem là bề mặt CHỈ ĐỌC — chỉ một đường ra, không kèm một nút "Huỷ" nói cùng việc. */
          <Button label={tCommon('actions.close')} variant="secondary" onPress={onClose} />
        )
      }
    >
      {blocked ? (
        <Callout tone="warning" title={t('metadata.noDetailTitle')}>
          {t('metadata.noDetailBody')}
        </Callout>
      ) : loading ? (
        <SkeletonText lines={6} />
      ) : detail.isError ? (
        /* Không phải 403 (đã bắt ở `blocked`) — mạng hỏng, 404, 5xx: nói ra thay vì đứng im. */
        <Callout tone="danger">{errorMessage(detail.error)}</Callout>
      ) : !editing && current ? (
        <YStack gap={space.md}>
          {/* Khối tiêu đề nền vàng nhạt của web — `Card tone="accent"` là bản native của nó. */}
          <Card tone="accent" lift="flat">
            {/*
              Nút nằm XUỐNG HÀNG dưới khối chữ, không đứng cạnh tiêu đề như web: phụ đề ở đây
              dài hai dòng, và một nút chen bên phải bóp nó còn hơn nửa bề ngang.
            */}
            <YStack gap={space.sm}>
              <XStack ai="flex-start" gap={space.sm}>
                <Ionicons
                  name="document-text-outline"
                  size={iconSize.lg}
                  color={colors.primaryActive}
                />
                <YStack f={1} gap={2}>
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {t('detail.title')}
                  </Text>
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('detail.subtitle')}
                  </Text>
                </YStack>
              </XStack>
              {canManage ? (
                <Button
                  label={t('detail.edit')}
                  icon="create-outline"
                  variant="secondary"
                  size="sm"
                  shape="square"
                  onPress={() => onModeChange('edit')}
                />
              ) : null}
            </YStack>
          </Card>

          {empty ? <Callout tone="info">{t('detail.empty')}</Callout> : null}

          <DetailGrid
            items={[
              {
                key: 'plateNumber',
                icon: 'car-outline',
                label: t('metadata.plateNumber'),
                value: current.plateNumber,
                placeholder: t('detail.notEntered'),
              },
              {
                key: 'holderName',
                icon: 'person-outline',
                label: t('metadata.holderName'),
                value: current.holderName,
                placeholder: t('detail.notEntered'),
              },
              {
                key: 'holderAddress',
                icon: 'location-outline',
                label: t('metadata.holderAddress'),
                value: current.holderAddress,
                placeholder: t('detail.notEntered'),
              },
              {
                key: 'chassisNumber',
                icon: 'construct-outline',
                label: t('metadata.chassisNumber'),
                value: current.chassisNumber,
                placeholder: t('detail.notEntered'),
              },
              {
                key: 'engineNumber',
                icon: 'settings-outline',
                label: t('metadata.engineNumber'),
                value: current.engineNumber,
                placeholder: t('detail.notEntered'),
              },
              {
                key: 'documentNumber',
                icon: 'keypad-outline',
                label: t('metadata.documentNumber'),
                value: current.documentNumber,
                // Web dùng chính placeholder của ô nhập ở đây, không phải "Chưa nhập" — giữ nguyên.
                placeholder: t('metadata.documentNumberPlaceholder'),
              },
              {
                key: 'issuedAt',
                icon: 'calendar-outline',
                label: t('metadata.issuedAt'),
                value: current.issuedAt ? fmt.dateKey(current.issuedAt) : null,
                placeholder: t('detail.notSelected'),
              },
              {
                key: 'expiresAt',
                icon: 'calendar-outline',
                label: t('metadata.expiresAt'),
                value: current.expiresAt ? fmt.dateKey(current.expiresAt) : null,
                placeholder: t('detail.notSelected'),
              },
              {
                key: 'notes',
                icon: 'document-text-outline',
                label: t('metadata.notes'),
                value: current.notes,
                placeholder: t('detail.notEntered'),
                wide: true,
              },
            ]}
          />

          {/* Bản file đang dùng — `activeVersion` chỉ có mặt khi người xem đủ quyền mở file. */}
          <YStack
            gap={2}
            pt={space.sm}
            borderTopWidth={1}
            borderTopColor={colors.borderSubtle}
          >
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('detail.fileTitle')}
            </Text>
            <Text
              col={current.activeVersion ? colors.text : colors.placeholder}
              fos={fontSize.bodySm}
              {...(current.activeVersion ? { fow: fontWeight.medium } : {})}
            >
              {current.activeVersion
                ? t('detail.fileVersion', {
                    version: current.activeVersion.version,
                    date: fmt.date(current.activeVersion.uploadedAt),
                  })
                : t('detail.fileNone')}
            </Text>
          </YStack>
        </YStack>
      ) : (
        <YStack gap={space.sm}>
          <TextField
            control={control}
            name="plateNumber"
            label={t('metadata.plateNumber')}
            placeholder={t('metadata.plateNumberPlaceholder')}
          />
          <TextField
            control={control}
            name="holderName"
            label={t('metadata.holderName')}
            placeholder={t('metadata.holderNamePlaceholder')}
          />
          <TextField
            control={control}
            name="holderAddress"
            label={t('metadata.holderAddress')}
            placeholder={t('metadata.holderAddressPlaceholder')}
          />
          <TextField
            control={control}
            name="chassisNumber"
            label={t('metadata.chassisNumber')}
            placeholder={t('metadata.chassisNumberPlaceholder')}
          />
          <TextField
            control={control}
            name="engineNumber"
            label={t('metadata.engineNumber')}
            placeholder={t('metadata.engineNumberPlaceholder')}
          />
          <TextField
            control={control}
            name="documentNumber"
            label={t('metadata.documentNumber')}
            placeholder={t('metadata.documentNumberPlaceholder')}
          />
          <DateField control={control} name="issuedAt" label={t('metadata.issuedAt')} />
          <DateField control={control} name="expiresAt" label={t('metadata.expiresAt')} />
          <TextField
            control={control}
            name="notes"
            label={t('metadata.notes')}
            multiline
            rows={3}
            maxLength={4000}
          />
        </YStack>
      )}
    </BottomSheet>
  );
}

// ── Lịch sử phiên bản ────────────────────────────────────────────────────────

function DocumentHistorySheet({
  vehicleId,
  documentId,
  canViewFiles,
  onClose,
}: {
  vehicleId: string;
  documentId: string;
  canViewFiles: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Vehicles.documents.history');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  // Lịch sử chứa tên file → endpoint riêng sau quyền view_files.
  const versions = useVehicleDocumentVersions(vehicleId, documentId, canViewFiles);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function download(versionId: string) {
    setDownloadingId(versionId);
    try {
      const ticket = await vehicleDocumentsApi.versionDownload(vehicleId, documentId, versionId);
      await Linking.openURL(ticket.downloadUrl);
    } catch (error) {
      toast.showError(errorMessage(error));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <BottomSheet open onClose={onClose} title={t('title')}>
      {!canViewFiles || isForbidden(versions.error) ? (
        <Callout tone="warning" title={t('noPermissionTitle')}>
          {t('noPermissionBody')}
        </Callout>
      ) : versions.isPending ? (
        <SkeletonText lines={4} />
      ) : versions.isError ? (
        <Callout tone="danger">{t('loadError')}</Callout>
      ) : versions.data.length === 0 ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('empty')}
        </Text>
      ) : (
        <YStack gap={space.sm}>
          {versions.data.map((version) => (
            <XStack key={version.id} ai="center" jc="space-between" gap={space.sm}>
              <YStack f={1} gap={2}>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                  {t('version', { version: version.version, fileName: version.file.name })}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {version.archivedAt
                    ? t('replaced', { date: fmt.date(version.archivedAt) })
                    : t('active', { date: fmt.date(version.uploadedAt) })}
                </Text>
              </YStack>
              <Button
                label={t('download')}
                variant="ghost"
                size="sm"
                block={false}
                loading={downloadingId === version.id}
                onPress={() => void download(version.id)}
              />
            </XStack>
          ))}
        </YStack>
      )}
    </BottomSheet>
  );
}

// ── Đối soát OCR ────────────────────────────────────────────────────────────

function OcrReviewSheet({
  vehicleId,
  review,
  vehiclePlate,
  canViewDetails,
  onClose,
  onApplied,
}: {
  vehicleId: string;
  review: { document: VehicleDocumentSummary; job: VehicleDocumentOcrJob };
  vehiclePlate: string | null;
  canViewDetails: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const t = useTranslations('Vehicles.documents.review');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applyPlateToVehicle, setApplyPlateToVehicle] = useState(false);
  const apply = useApplyVehicleDocumentOcr(vehicleId);

  const job = review.job;
  // "Hiện tại" là metadata nhạy cảm — tải qua endpoint chi tiết (quyền view_details).
  const detail = useVehicleDocument(vehicleId, review.document.id, canViewDetails);
  const doc = detail.data ?? null;
  const emptyValue = tCommon('labels.emptyValue');

  function currentValueOf(field: string): string {
    if (!doc) return emptyValue;
    const map: Record<string, string | null | undefined> = {
      holderName: doc.holderName,
      holderAddress: doc.holderAddress,
      plateNumber: doc.plateNumber ?? vehiclePlate,
      chassisNumber: doc.chassisNumber,
      engineNumber: doc.engineNumber,
      issuedAt: doc.issuedAt,
      expiresAt: doc.expiresAt,
      documentNumber: doc.documentNumber,
    };
    return map[field] ?? emptyValue;
  }

  function run(fields: string[]) {
    apply.mutate(
      {
        documentId: review.document.id,
        jobId: job.id,
        body: {
          // Client gửi TÊN trường; giá trị lấy từ job ở server.
          fields: fields as ApplyOcrFieldsInput['fields'],
          applyPlateToVehicle: applyPlateToVehicle && fields.includes('plateNumber'),
        },
      },
      {
        onSuccess: () => {
          toast.showSuccess(fields.length > 0 ? t('applied') : t('markedReviewed'));
          setSelected(new Set());
          setApplyPlateToVehicle(false);
          onApplied();
        },
        onError: (error) => {
          toast.showError(getErrorCode(error) === 'CONFLICT' ? t('conflict') : errorMessage(error));
        },
      },
    );
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('title')}
      footer={
        <YStack gap={space.sm}>
          {/*
            "Cập nhật đã chọn" là hành động chính nhưng KHÔNG mặc định chọn gì — không có "ghi đè
            tất cả": người dùng phải tự tick từng trường.
          */}
          <Button
            label={selected.size > 0 ? t('applyCount', { count: selected.size }) : t('apply')}
            disabled={selected.size === 0}
            loading={apply.isPending}
            onPress={() => run([...selected])}
          />
          <Button
            label={tCommon('actions.close')}
            variant="secondary"
            disabled={apply.isPending}
            onPress={onClose}
          />
        </YStack>
      }
    >
      <YStack gap={space.sm}>
        <Callout tone="success">
          {job.confidence != null
            ? t('successWithConfidence', { confidence: job.confidence })
            : t('success')}
        </Callout>
        <Callout tone="warning">{t('warning')}</Callout>

        {job.fields.length === 0 ? (
          <Callout tone="info">{t('empty')}</Callout>
        ) : (
          job.fields.map((field) => (
            <CheckOption
              key={field.field}
              label={domainLabel('vehicleDocumentOcrField', field.field, field.field)}
              /*
               * Web bày ba cột (Trường · Hiện tại · Nhận dạng). Bề ngang điện thoại không đủ cho
               * một bảng, nên hai cột giá trị xuống dòng dưới nhãn — vẫn là ĐỐI CHIẾU, chỉ đọc
               * theo chiều dọc.
               */
              hint={`${t('colCurrent')}: ${currentValueOf(field.field)}\n${t('colOcr')}: ${field.value}${
                field.confidence != null ? ` (${field.confidence}%)` : ''
              }`}
              checked={selected.has(field.field)}
              onPress={() =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(field.field)) next.delete(field.field);
                  else next.add(field.field);
                  return next;
                })
              }
            />
          ))
        )}

        {selected.has('plateNumber') ? (
          <CheckOption
            label={t('applyPlateToVehicle')}
            checked={applyPlateToVehicle}
            onPress={() => setApplyPlateToVehicle((current) => !current)}
          />
        ) : null}

        {/* Web để nút này ở CUỐI THÂN chứ không ở footer — nó là một lối ra thứ hai, không phải
            hành động chính, và đứng cạnh "Cập nhật đã chọn" thì hai cái tranh nhau. */}
        <Button
          label={t('skip')}
          variant="secondary"
          disabled={apply.isPending}
          onPress={() => run([])}
        />
      </YStack>
    </BottomSheet>
  );
}

/**
 * Phần `<b>` của message: giá trị được nhấn, chữ dẫn quanh nó vẫn mờ — đúng vai `<b>` của web.
 *
 * Khai ở module scope, không phải trong thân component: viết `(chunks) => <Text>…` ngay tại chỗ
 * gọi là hai closure mới cho mỗi hàng, mỗi lần render.
 */
const strong = (chunks: ReactNode) => (
  <Text col={colors.text} fow={fontWeight.semibold}>
    {chunks}
  </Text>
);
