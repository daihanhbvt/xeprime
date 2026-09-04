'use client';

import {
  CalendarOutlined,
  CarOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FieldNumberOutlined,
  FileTextOutlined,
  HistoryOutlined,
  IdcardOutlined,
  InsuranceOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  ScanOutlined,
  SettingOutlined,
  ToolOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  List,
  Progress,
  Row,
  Skeleton,
  Tag,
  Upload,
} from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  PERMISSION,
  VEHICLE_DOCUMENT_PRESENTATION,
  VEHICLE_DOCUMENT_PRESENTATION_META,
  VEHICLE_DOCUMENT_PRESET_VALUES,
  VEHICLE_DOCUMENT_TYPE,
  type VehicleDocumentPresentation,
  type VehicleDocumentType,
} from '@xeprime/types';
import {
  vehicleDocumentCreateSchema,
  vehicleDocumentFormSchema,
  type VehicleDocumentCreateValues,
  type VehicleDocumentFormValues,
} from '@xeprime/validators';
import { RowActions, type RowAction } from '@/components/data-display/RowActions';
import { DateTimeField } from '@/components/form/DateTimeField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useIsMobile } from '@/hooks/use-media-query';
import { usePermissions } from '@/hooks/use-permissions';
import { ApiClientError, getErrorCode, getErrorMessage } from '@/services/api-client';
import { validateDocumentFile, uploadToR2 } from '@/services/upload';
import type { VehicleDetail } from '@/features/vehicles/types';
import {
  applyDocumentOcr,
  archiveVehicleDocument,
  attachDocumentVersion,
  createVehicleDocument,
  fetchDocumentDownload,
  presignDocumentVersion,
  requestDocumentOcr,
  updateVehicleDocument,
} from '../api';
import {
  useInvalidateVehicleDocuments,
  useVehicleDocument,
  useVehicleDocuments,
  useVehicleDocumentVersions,
} from '../hooks';
import type {
  ApplyOcrFieldsInput,
  VehicleDocumentDetail,
  VehicleDocumentOcrJob,
  VehicleDocumentSummary,
} from '../types';
import styles from './VehicleDocumentsWorkspace.module.css';
import type { DomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useUploadRejectionMessage } from '@/i18n/use-upload-rejection-message';

const STANDARD_TYPES: readonly VehicleDocumentType[] = [
  VEHICLE_DOCUMENT_TYPE.REGISTRATION,
  VEHICLE_DOCUMENT_TYPE.INSPECTION,
  VEHICLE_DOCUMENT_TYPE.INSURANCE,
];

/** Định dạng file được nhận — dùng chung cho `<input type="file">` ẩn của mọi hàng. */
const ACCEPTED_FILES = 'image/jpeg,image/png,image/webp,application/pdf';

/**
 * Ô ảnh đại diện của một loại giấy tờ.
 *
 * CỐ Ý là icon theo loại, KHÔNG phải ảnh thu nhỏ của chính tài liệu: file nằm ở bucket riêng tư
 * và chỉ mở được bằng signed URL sống ~2 phút, phần lớn giấy tờ xe là PDF (thẻ `<img>` không
 * dựng được), và tải bản gốc vài MB cho mỗi hàng chỉ để lấy một ô 56px là lãng phí. Ảnh thu nhỏ
 * thật cần một bước sinh thumbnail ở server (render trang 1 → JPEG) — việc của backend, không
 * phải của màn này.
 */
const TYPE_ICON: Record<string, ReactNode> = {
  [VEHICLE_DOCUMENT_TYPE.REGISTRATION]: <IdcardOutlined />,
  [VEHICLE_DOCUMENT_TYPE.INSPECTION]: <SafetyCertificateOutlined />,
  [VEHICLE_DOCUMENT_TYPE.INSURANCE]: <InsuranceOutlined />,
  [VEHICLE_DOCUMENT_TYPE.OTHER]: <FileTextOutlined />,
};

interface UploadingState {
  key: string;
  fileName: string;
  progress: number;
  error?: string;
  file?: File;
}

/** Hộp thoại chi tiết mở ở chế độ nào: xem thông tin, hay nhập/sửa. */
type DetailTarget = { document: VehicleDocumentSummary; mode: 'view' | 'edit' };

/**
 * Tên hàng.
 *
 * Loại chuẩn lấy nhãn từ `Domain.vehicleDocumentType`. Loại `other` lưu tên ở `customTypeName`,
 * và ô đó chứa MỘT TRONG HAI thứ: mã preset (người dùng chọn trong danh sách) hoặc chữ họ tự gõ.
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

function isForbidden(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 403;
}

/**
 * Tab "Giấy tờ" của Vehicle 360 (Wave 5 + 5.1) — docs/design/12 §8+§10.
 *
 * Quyền — BỐN mức khớp backend, guard backend là lớp thật, FE chỉ phản chiếu:
 *  - thiếu `vehicles.documents.view` → màn không có quyền, KHÔNG gọi API;
 *  - `view` → chỉ TRẠNG THÁI (danh sách dùng DTO summary — không PII/tên file/OCR);
 *  - `view_details` → mở được hộp thoại chi tiết/sửa (metadata nhạy cảm tải riêng khi mở);
 *  - `view_files` → tải file + lịch sử phiên bản; `manage` → tải lên, nhập/sửa, OCR, xoá.
 *
 * Giấy tờ TUỲ CHỌN; hết hạn chỉ CẢNH BÁO — tab này không đụng gì tới trạng thái xe.
 */
export function VehicleDocumentsWorkspace({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.documents');
  const tCommon = useTranslations('Common');
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.VEHICLE_DOCUMENT_VIEW);
  const canViewDetails = permissions.has(PERMISSION.VEHICLE_DOCUMENT_DETAIL_VIEW);
  const canViewFiles = permissions.has(PERMISSION.VEHICLE_DOCUMENT_FILE_VIEW);
  const canManage = permissions.has(PERMISSION.VEHICLE_DOCUMENT_MANAGE);
  const documents = useVehicleDocuments(vehicle.id, canView);

  if (!canView) {
    return (
      <PermissionState
        title={t('noPermissionTitle')}
        description={t('noPermissionBody')}
        missingPermissions={[PERMISSION.VEHICLE_DOCUMENT_VIEW]}
      />
    );
  }

  if (documents.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;

  if (documents.isError || !documents.data) {
    return (
      <Alert
        type="error"
        showIcon
        message={t('loadError')}
        description={
          <Button size="small" onClick={() => void documents.refetch()}>
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }

  return (
    <DocumentsList
      vehicle={vehicle}
      documents={documents.data}
      canManage={canManage}
      canViewDetails={canViewDetails}
      canViewFiles={canViewFiles}
    />
  );
}

function DocumentsList({
  vehicle,
  documents,
  canManage,
  canViewDetails,
  canViewFiles,
}: {
  vehicle: VehicleDetail;
  documents: VehicleDocumentSummary[];
  canManage: boolean;
  canViewDetails: boolean;
  canViewFiles: boolean;
}) {
  const t = useTranslations('Vehicles.documents');
  const domainLabel = useDomainLabel();
  const uploadRejectionMessage = useUploadRejectionMessage();
  const isMobile = useIsMobile();
  const { message } = App.useApp();
  const invalidate = useInvalidateVehicleDocuments(vehicle.id);
  const [uploading, setUploading] = useState<Record<string, UploadingState>>({});
  const [adding, setAdding] = useState(false);
  const [detailFor, setDetailFor] = useState<DetailTarget | null>(null);
  const [historyFor, setHistoryFor] = useState<VehicleDocumentSummary | null>(null);
  const [reviewFor, setReviewFor] = useState<{
    document: VehicleDocumentSummary;
    job: VehicleDocumentOcrJob;
  } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  /** Hàng hiển thị: 3 loại chuẩn luôn có mặt (placeholder khi chưa có) + các giấy tờ `other`. */
  const rows = useMemo(() => {
    const byType = new Map(documents.map((doc) => [doc.type, doc]));
    const standard = STANDARD_TYPES.map((type) => ({
      key: type as string,
      type,
      document: byType.get(type) ?? null,
    }));
    const others = documents
      .filter((doc) => doc.type === VEHICLE_DOCUMENT_TYPE.OTHER)
      .map((doc) => ({ key: doc.id, type: VEHICLE_DOCUMENT_TYPE.OTHER, document: doc }));
    return [...standard, ...others];
  }, [documents]);

  function setUploadState(key: string, state: UploadingState | null) {
    setUploading((current) => {
      const next = { ...current };
      if (state) next[key] = state;
      else delete next[key];
      return next;
    });
  }

  /**
   * Flow tải file (Wave 4.1): (tạo hồ sơ nếu chưa có) → presign theo giấy tờ → PUT bucket
   * riêng tư → gắn (server HEAD + soi chữ ký byte đầu). File hỏng có Thử lại tại chỗ.
   */
  async function uploadFor(
    rowKey: string,
    type: VehicleDocumentType,
    doc: VehicleDocumentSummary | null,
    file: File,
  ) {
    const invalid = validateDocumentFile(file);
    if (invalid) {
      message.error(uploadRejectionMessage(invalid));
      return;
    }
    setUploadState(rowKey, { key: rowKey, fileName: file.name, progress: 0, file });
    try {
      const target = doc ?? (await createVehicleDocument(vehicle.id, { type }));
      const ticket = await presignDocumentVersion(vehicle.id, target.id, file);
      await uploadToR2(ticket.uploadUrl, file, (progress) =>
        setUploadState(rowKey, { key: rowKey, fileName: file.name, progress, file }),
      );
      await attachDocumentVersion(vehicle.id, target.id, ticket.fileId);
      setUploadState(rowKey, null);
      invalidate();
      message.success(t('upload.saved'));
    } catch (err) {
      setUploadState(rowKey, {
        key: rowKey,
        fileName: file.name,
        progress: 0,
        error: getErrorMessage(err),
        file,
      });
    }
  }

  async function openFile(doc: VehicleDocumentSummary) {
    if (!doc.activeVersionId) return;
    setDownloadingId(doc.id);
    try {
      // Signed URL sống ~2 phút, xin mới mỗi lần bấm — không lưu ở đâu cả (Wave 4.1).
      const ticket = await fetchDocumentDownload(vehicle.id, doc.id, doc.activeVersionId);
      window.open(ticket.downloadUrl, '_blank', 'noopener');
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  }

  async function runOcr(doc: VehicleDocumentSummary) {
    try {
      const job = await requestDocumentOcr(vehicle.id, doc.id);
      invalidate();
      if (job.status === 'needs_review') {
        setReviewFor({ document: doc, job });
      } else if (job.status === 'unreadable') {
        message.warning(t('ocr.unreadable'));
      } else {
        message.error(t('ocr.failed'));
      }
    } catch (err) {
      if (err instanceof ApiClientError && getErrorCode(err) === 'OCR_NOT_CONFIGURED') {
        // Chưa có provider OCR (thực tế hiện tại) — nói thẳng và mở đường nhập tay.
        message.info(t('ocr.notConfigured'));
        setDetailFor({ document: doc, mode: 'edit' });
        return;
      }
      message.error(getErrorMessage(err));
    }
  }

  /**
   * Xoá = LƯU TRỮ ở backend (`archivedAt`): giấy tờ rời khỏi danh mục và loại chuẩn được thêm
   * lại, nhưng file + lịch sử phiên bản + audit vẫn còn để đối soát về sau. Sau khi xoá phải
   * đóng mọi hộp thoại đang trỏ vào chính bản ghi đó, nếu không người dùng ở lại một form ghi
   * vào bản ghi không còn tồn tại và chỉ nhận 404 lúc bấm Lưu.
   */
  async function removeDocument(rowKey: string, doc: VehicleDocumentSummary) {
    setRemovingId(doc.id);
    try {
      await archiveVehicleDocument(vehicle.id, doc.id);
      setUploadState(rowKey, null);
      setDetailFor((current) => (current?.document.id === doc.id ? null : current));
      setHistoryFor((current) => (current?.id === doc.id ? null : current));
      setReviewFor((current) => (current?.document.id === doc.id ? null : current));
      invalidate();
      message.success(t('remove.done'));
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className={styles.stack}>
      {!canManage ? <Alert type="info" showIcon message={t('readOnly')} /> : null}

      <Card
        className={styles.card}
        classNames={{ header: styles.cardHeader, body: styles.cardBody }}
        title={
          <div className={styles.cardTitle}>
            <span className={styles.cardTitleText}>
              {isMobile ? t('cardTitleCompact') : t('cardTitle')}
            </span>
            <span className={styles.cardSubtitle}>
              {isMobile ? t('cardSubtitleCompact') : t('cardSubtitle')}
            </span>
          </div>
        }
        extra={
          canManage ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setAdding(true)}
            >
              {isMobile ? t('addTypeCompact') : t('addType')}
            </Button>
          ) : null
        }
      >
        <List
          className={styles.list}
          dataSource={rows}
          renderItem={(row) => (
            <DocumentRow
              key={row.key}
              row={row}
              title={titleOf(row.type, row.document, domainLabel)}
              uploading={uploading[row.key] ?? null}
              canManage={canManage}
              canViewDetails={canViewDetails}
              canViewFiles={canViewFiles}
              downloading={downloadingId === row.document?.id}
              removing={removingId === row.document?.id}
              onUpload={(file) => void uploadFor(row.key, row.type, row.document, file)}
              onRetry={() => {
                const state = uploading[row.key];
                if (state?.file) void uploadFor(row.key, row.type, row.document, state.file);
              }}
              onCancelUpload={() => setUploadState(row.key, null)}
              onOpen={() => row.document && void openFile(row.document)}
              onOcr={() => row.document && void runOcr(row.document)}
              onDetail={() =>
                row.document && setDetailFor({ document: row.document, mode: 'view' })
              }
              onHistory={() => row.document && setHistoryFor(row.document)}
              onRemove={() => row.document && void removeDocument(row.key, row.document)}
            />
          )}
        />
      </Card>

      <Alert
        type="info"
        showIcon
        className={styles.ocrNote}
        message={t('ocrNoteTitle')}
        description={t('ocrNoteBody')}
      />

      <AddDocumentDialog
        vehicleId={vehicle.id}
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={() => {
          setAdding(false);
          invalidate();
        }}
      />

      <DocumentDetailDialog
        vehicleId={vehicle.id}
        target={detailFor}
        canManage={canManage}
        canViewDetails={canViewDetails}
        onModeChange={(mode) => setDetailFor((current) => (current ? { ...current, mode } : null))}
        onClose={() => setDetailFor(null)}
        onSaved={() => {
          setDetailFor(null);
          invalidate();
        }}
      />

      <DocumentHistoryDialog
        vehicleId={vehicle.id}
        document={historyFor}
        canViewFiles={canViewFiles}
        onClose={() => setHistoryFor(null)}
      />

      <OcrReviewDialog
        vehicleId={vehicle.id}
        review={reviewFor}
        vehiclePlate={vehicle.plateNumber ?? null}
        canViewDetails={canViewDetails}
        onClose={() => setReviewFor(null)}
        onApplied={() => {
          setReviewFor(null);
          invalidate();
        }}
      />
    </div>
  );
}

// ── Một hàng giấy tờ ─────────────────────────────────────────────────────────

function DocumentRow({
  row,
  title,
  uploading,
  canManage,
  canViewDetails,
  canViewFiles,
  downloading,
  removing,
  onUpload,
  onRetry,
  onCancelUpload,
  onOpen,
  onOcr,
  onDetail,
  onHistory,
  onRemove,
}: {
  row: { type: VehicleDocumentType; document: VehicleDocumentSummary | null };
  title: string;
  uploading: UploadingState | null;
  canManage: boolean;
  canViewDetails: boolean;
  canViewFiles: boolean;
  downloading: boolean;
  removing: boolean;
  onUpload: (file: File) => void;
  onRetry: () => void;
  onCancelUpload: () => void;
  onOpen: () => void;
  onOcr: () => void;
  onDetail: () => void;
  onHistory: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations('Vehicles.documents');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  /**
   * `<input type="file">` ẩn thay cho `<Upload>` của AntD: mục "Tải lên/Thay thế file" giờ nằm
   * TRONG menu ⋮, mà mục menu không bọc được một trigger upload. Ref này là cách mở hộp chọn
   * file từ một handler thường.
   */
  const fileInput = useRef<HTMLInputElement>(null);

  const doc = row.document;
  const presentation = (doc?.presentation ??
    VEHICLE_DOCUMENT_PRESENTATION.MISSING) as VehicleDocumentPresentation;
  const meta = VEHICLE_DOCUMENT_PRESENTATION_META[presentation];
  const hasFile = Boolean(doc?.hasFile);
  // `expiresAt` là NGÀY LỊCH (không giờ) — ghim UTC để không lệch một ngày khi đổi múi giờ.
  const expiryDate = doc?.expiresAt ? fmt.date(`${doc.expiresAt}T00:00:00.000Z`) : null;

  const pickFile = () => fileInput.current?.click();
  /**
   * Chưa có file thì TẢI LÊN là việc duy nhất đáng làm ở hàng này — nó phải là một cái nút nhìn
   * thấy được, không phải một mục nằm sau nút ⋮. Ba hàng loại chuẩn luôn hiện sẵn ở trạng thái
   * "Chưa có", nên chôn nút tải lên trong menu là chôn đúng bước đầu tiên của cả màn.
   */
  const uploadFirst = !hasFile && canManage && !uploading;

  const uploadAction: RowAction = {
    key: 'upload',
    // Cùng một hành động, hai câu chữ: chưa có file thì là "tải lên", có rồi là "thay thế".
    label: hasFile ? t('row.replaceFile') : t('row.upload'),
    icon: <UploadOutlined />,
    hidden: !canManage || Boolean(uploading),
    onClick: pickFile,
  };

  /**
   * Việc mà ô bên trái làm khi bấm — `null` nghĩa là không có gì để làm, đừng giả làm nút.
   *
   * Là một MÃ chứ không phải một object mang sẵn handler: gói `pickFile` (có đọc ref) vào một giá
   * trị rồi đem giá trị đó ra làm điều kiện render là thứ `react-hooks/refs` chặn, và nó chặn
   * đúng — ref không được phép tham gia vào việc quyết định render ra cái gì.
   */
  const tileMode: 'upload' | 'download' | null = uploadFirst
    ? 'upload'
    : hasFile && canViewFiles
      ? 'download'
      : null;

  const actions: RowAction[] = [
    // `maxInline` bên dưới lấy action ĐẦU TIÊN ra ngoài — nên thứ tự ở đây là thứ quyết định
    // nút nào hiện thành nút thật.
    ...(uploadFirst ? [uploadAction] : []),
    {
      key: 'detail',
      label: t('row.viewDetail'),
      icon: <FileTextOutlined />,
      hidden: !doc || !canViewDetails,
      onClick: onDetail,
    },
    {
      key: 'download',
      label: t('row.download'),
      icon: <DownloadOutlined />,
      loading: downloading,
      hidden: !hasFile || !canViewFiles,
      onClick: onOpen,
    },
    ...(uploadFirst ? [] : [uploadAction]),
    {
      // OCR cần đọc được metadata hiện tại để đối soát — đòi thêm view_details.
      key: 'ocr',
      label: t('row.ocr'),
      icon: <ScanOutlined />,
      hidden: !hasFile || !canManage || !canViewDetails,
      onClick: onOcr,
    },
    {
      // Lịch sử phiên bản chứa tên file → sau quyền view_files (Wave 5.1).
      key: 'history',
      label: t('row.history'),
      icon: <HistoryOutlined />,
      hidden: !hasFile || !canViewFiles,
      onClick: onHistory,
    },
    {
      key: 'remove',
      label: t('row.delete'),
      icon: <DeleteOutlined />,
      danger: true,
      loading: removing,
      hidden: !doc || !canManage,
      confirm: {
        title: t('remove.title'),
        description: <span className={styles.removeConfirm}>{t('remove.body', { title })}</span>,
        okText: t('remove.ok'),
        cancelText: tCommon('actions.cancel'),
      },
      onClick: onRemove,
    },
  ];

  return (
    <List.Item className={styles.row}>
      {/*
       * Ô bên trái là điểm bấm LỚN của hàng, làm đúng việc chính của trạng thái hiện tại: chưa
       * có file thì mở hộp chọn file, có rồi thì mở chính file đó. Không làm được việc nào (thiếu
       * quyền) thì nó quay về một ô trang trí, không phải một nút bấm vào không có gì xảy ra.
       */}
      {tileMode ? (
        <button
          type="button"
          className={`${styles.rowTile} ${styles.rowTileAction}`}
          data-type={row.type}
          aria-label={
            tileMode === 'upload'
              ? t('row.uploadFor', { title })
              : t('row.downloadFor', { title })
          }
          onClick={tileMode === 'upload' ? pickFile : onOpen}
        >
          {TYPE_ICON[row.type] ?? <FileTextOutlined />}
          <span className={styles.rowTileHint} aria-hidden="true">
            {tileMode === 'upload' ? <UploadOutlined /> : <DownloadOutlined />}
          </span>
        </button>
      ) : (
        <span className={styles.rowTile} data-type={row.type} aria-hidden="true">
          {TYPE_ICON[row.type] ?? <FileTextOutlined />}
        </span>
      )}
      <div className={styles.rowBody}>
        <div className={styles.rowHead}>
          <strong className={styles.rowTitle}>{title}</strong>
          <Tag className={styles.rowTag} color={meta.color}>
            {domainLabel('vehicleDocumentPresentation', presentation, meta.label)}
          </Tag>
        </div>
        <div className={styles.rowMeta}>
          {t.rich('row.expiry', {
            value: expiryDate ?? (hasFile ? t('row.noExpiry') : t('row.expiryUnknown')),
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </div>
        <div className={styles.rowMeta}>
          {t.rich('row.updatedAt', {
            // Hàng chưa có hồ sơ thì không có mốc cập nhật nào để nói — giữ đúng dấu gạch của
            // ô ngày hết hạn thay vì bịa ra ngày tạo.
            value: doc ? fmt.date(doc.updatedAt) : tCommon('labels.emptyValue'),
            b: (chunks) => <strong>{chunks}</strong>,
          })}
        </div>
        {presentation === VEHICLE_DOCUMENT_PRESENTATION.EXPIRING_SOON && expiryDate ? (
          <Alert
            className={styles.rowAlert}
            type="warning"
            showIcon
            message={t('row.expiringSoon', { date: expiryDate })}
          />
        ) : null}
        {presentation === VEHICLE_DOCUMENT_PRESENTATION.EXPIRED && expiryDate ? (
          <Alert
            className={styles.rowAlert}
            type="error"
            showIcon
            message={t('row.expired', { date: expiryDate })}
          />
        ) : null}
        {uploading ? (
          uploading.error ? (
            <Alert
              className={styles.rowAlert}
              type="error"
              showIcon
              role="alert"
              message={t('upload.failed', { message: uploading.error })}
              action={
                <span className={styles.uploadActions}>
                  <Button size="small" onClick={onCancelUpload}>
                    {tCommon('actions.cancel')}
                  </Button>
                  <Button size="small" type="primary" onClick={onRetry}>
                    {tCommon('actions.retry')}
                  </Button>
                </span>
              }
            />
          ) : (
            <div
              className={styles.uploadProgress}
              aria-label={t('upload.inProgressAria', { fileName: uploading.fileName })}
            >
              <span className={styles.fileName}>
                {t('upload.inProgress', { fileName: uploading.fileName })}
              </span>
              <Progress percent={uploading.progress} size="small" />
            </div>
          )
        ) : null}
      </div>
      {/* Mọi hành động gom vào menu ⋮ — hàng giữ một điểm bấm duy nhất ở cả desktop lẫn mobile. */}
      <RowActions
        actions={actions}
        maxInline={uploadFirst ? 1 : 0}
        variant="filled"
        overflowLabel={t('row.actionsAria', { title })}
      />
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_FILES}
        className={styles.hiddenInput}
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Xoá value để chọn LẠI đúng file vừa lỗi vẫn bắn `change` (trình duyệt bỏ qua khi trùng).
          event.target.value = '';
          if (file) onUpload(file);
        }}
      />
    </List.Item>
  );
}

// ── Thêm loại giấy tờ ───────────────────────────────────────────────────────

/**
 * Thêm một giấy tờ: CHỌN loại trong danh sách + đính kèm ảnh/file. Hết.
 *
 * Cố ý không có metadata (biển số, số khung, ngày cấp…): lúc bấm "Thêm", người dùng đang cầm tờ
 * giấy chứ chưa ngồi đọc nó — bắt điền chín ô ngay ở bước này là lý do người ta bỏ dở. Các
 * trường đó nhập sau ở màn chi tiết, hoặc để "Nhập từ OCR" điền.
 *
 * Tên loại là SELECT chứ không phải ô gõ tự do: cùng một loại giấy tờ gõ tay ra năm cách viết
 * thì không lọc, không thống kê và không dịch được. Chọn "Khác" mới mở ô nhập tên.
 */
function AddDocumentDialog({
  vehicleId,
  open,
  onClose,
  onCreated,
}: {
  vehicleId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations('Vehicles.documents');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const uploadRejectionMessage = useUploadRejectionMessage();
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const { control, handleSubmit, reset } = useForm<VehicleDocumentCreateValues>({
    resolver: yupResolver(vehicleDocumentCreateSchema),
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

  function close() {
    reset({ preset: '', customTypeName: '' });
    setFile(null);
    setProgress(null);
    onClose();
  }

  async function submit(values: VehicleDocumentCreateValues) {
    setSaving(true);
    try {
      // Tên lưu xuống: mã preset, hoặc chữ người dùng tự gõ khi chọn "Khác".
      const customTypeName = isCustom ? values.customTypeName.trim() : values.preset;
      const created = await createVehicleDocument(vehicleId, {
        type: VEHICLE_DOCUMENT_TYPE.OTHER,
        customTypeName,
      });

      if (file) {
        try {
          setProgress(0);
          const ticket = await presignDocumentVersion(vehicleId, created.id, file);
          await uploadToR2(ticket.uploadUrl, file, setProgress);
          await attachDocumentVersion(vehicleId, created.id, ticket.fileId);
        } catch (err) {
          /*
           * Giấy tờ ĐÃ được tạo — không ném tiếp và không mời thử lại tại chỗ, vì bấm lại sẽ
           * tạo bản ghi thứ hai. Nói rõ trạng thái thật rồi đóng: file tải lại được từ menu
           * thao tác của chính hàng vừa thêm.
           */
          message.warning(t('add.createdFileFailed', { message: getErrorMessage(err) }));
          reset({ preset: '', customTypeName: '' });
          setFile(null);
          setProgress(null);
          onCreated();
          return;
        }
      }

      message.success(t('add.created'));
      reset({ preset: '', customTypeName: '' });
      setFile(null);
      setProgress(null);
      onCreated();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      title={t('add.title')}
      size="sm"
      mobileMode="sheet"
      confirmLoading={saving}
      onClose={close}
      onOk={() => void handleSubmit(submit)()}
      okText={t('add.submit')}
      cancelText={tCommon('actions.cancel')}
    >
      <Form component={false} layout="vertical" colon={false}>
        <div className={styles.addForm}>
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

          <div className={styles.addFile}>
            <span className={styles.addFileLabel}>{t('add.fileLabel')}</span>
            <Upload
              accept={ACCEPTED_FILES}
              maxCount={1}
              disabled={saving}
              fileList={file ? [{ uid: 'picked', name: file.name, status: 'done' as const }] : []}
              beforeUpload={(picked) => {
                const invalid = validateDocumentFile(picked);
                if (invalid) message.error(uploadRejectionMessage(invalid));
                else setFile(picked);
                return false; // flow presign→PUT→attach tự lo, không dùng upload mặc định AntD
              }}
              onRemove={() => setFile(null)}
            >
              <Button icon={<UploadOutlined />} disabled={saving}>
                {t('add.pickFile')}
              </Button>
            </Upload>
            <span className={styles.addFileHint}>{t('add.fileHint')}</span>
            {progress != null ? <Progress percent={progress} size="small" /> : null}
          </div>
        </div>
      </Form>
    </ResponsiveDialog>
  );
}

// ── Chi tiết giấy tờ: xem thông tin + nhập/sửa ──────────────────────────────

/** Một ô nhãn/giá trị trong lưới thông tin — giá trị trống hiện chữ mờ, không để ô rỗng. */
function DetailItem({
  icon,
  label,
  value,
  placeholder,
  wide,
}: {
  icon: ReactNode;
  label: string;
  value: string | null | undefined;
  placeholder: string;
  wide?: boolean;
}) {
  const filled = Boolean(value);
  return (
    <div className={wide ? `${styles.detailItem} ${styles.detailItemWide}` : styles.detailItem}>
      <span className={styles.detailLabel}>
        <span className={styles.detailIcon} aria-hidden="true">
          {icon}
        </span>
        {label}
      </span>
      <span className={filled ? styles.detailValue : styles.detailPlaceholder}>
        {filled ? value : placeholder}
      </span>
    </div>
  );
}

function DocumentDetailView({
  detail,
  canManage,
  onEdit,
}: {
  detail: VehicleDocumentDetail;
  canManage: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations('Vehicles.documents');
  const fmt = useAppFormat();
  const notEntered = t('detail.notEntered');
  const notSelected = t('detail.notSelected');

  /** Ngày lịch (không giờ) — ghim UTC, cùng lý do với ô hạn ở danh sách. */
  const calendarDate = (value: string | null | undefined) =>
    value ? fmt.date(`${value}T00:00:00.000Z`) : null;

  const isEmpty = ![
    detail.plateNumber,
    detail.holderName,
    detail.holderAddress,
    detail.chassisNumber,
    detail.engineNumber,
    detail.documentNumber,
    detail.issuedAt,
    detail.expiresAt,
    detail.notes,
  ].some(Boolean);

  return (
    <div className={styles.detailStack}>
      <div className={styles.detailHeader}>
        <span className={styles.detailHeaderIcon} aria-hidden="true">
          <FileTextOutlined />
        </span>
        <div className={styles.detailHeaderText}>
          <strong>{t('detail.title')}</strong>
          <span className={styles.detailSubtitle}>{t('detail.subtitle')}</span>
        </div>
        {canManage ? (
          <Button icon={<EditOutlined />} onClick={onEdit}>
            {t('detail.edit')}
          </Button>
        ) : null}
      </div>

      {isEmpty ? <Alert type="info" showIcon message={t('detail.empty')} /> : null}

      <div className={styles.detailGrid}>
        <DetailItem
          icon={<CarOutlined />}
          label={t('metadata.plateNumber')}
          value={detail.plateNumber}
          placeholder={notEntered}
        />
        <DetailItem
          icon={<UserOutlined />}
          label={t('metadata.holderName')}
          value={detail.holderName}
          placeholder={notEntered}
        />
        <DetailItem
          icon={<EnvironmentOutlined />}
          label={t('metadata.holderAddress')}
          value={detail.holderAddress}
          placeholder={notEntered}
        />
        <DetailItem
          icon={<ToolOutlined />}
          label={t('metadata.chassisNumber')}
          value={detail.chassisNumber}
          placeholder={notEntered}
        />
        <DetailItem
          icon={<SettingOutlined />}
          label={t('metadata.engineNumber')}
          value={detail.engineNumber}
          placeholder={notEntered}
        />
        <DetailItem
          icon={<FieldNumberOutlined />}
          label={t('metadata.documentNumber')}
          value={detail.documentNumber}
          placeholder={t('metadata.documentNumberPlaceholder')}
        />
        <DetailItem
          icon={<CalendarOutlined />}
          label={t('metadata.issuedAt')}
          value={calendarDate(detail.issuedAt)}
          placeholder={notSelected}
        />
        <DetailItem
          icon={<CalendarOutlined />}
          label={t('metadata.expiresAt')}
          value={calendarDate(detail.expiresAt)}
          placeholder={notSelected}
        />
        <DetailItem
          icon={<FileTextOutlined />}
          label={t('metadata.notes')}
          value={detail.notes}
          placeholder={notEntered}
          wide
        />
      </div>

      {/* Bản file đang dùng — `activeVersion` chỉ có mặt khi người xem đủ quyền mở file. */}
      <div className={styles.detailFile}>
        <span className={styles.detailLabel}>{t('detail.fileTitle')}</span>
        <span className={detail.activeVersion ? styles.detailValue : styles.detailPlaceholder}>
          {detail.activeVersion
            ? t('detail.fileVersion', {
                version: detail.activeVersion.version,
                date: fmt.date(detail.activeVersion.uploadedAt),
              })
            : t('detail.fileNone')}
        </span>
      </div>
    </div>
  );
}

function DocumentDetailDialog({
  vehicleId,
  target,
  canManage,
  canViewDetails,
  onModeChange,
  onClose,
  onSaved,
}: {
  vehicleId: string;
  target: DetailTarget | null;
  canManage: boolean;
  canViewDetails: boolean;
  onModeChange: (mode: 'view' | 'edit') => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('Vehicles.documents');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const { message } = App.useApp();
  // Thêm mới đi qua `AddDocumentDialog` — hộp thoại này LUÔN đứng trên một giấy tờ có thật.
  const document = target?.document ?? null;
  const editing = target?.mode === 'edit';
  const open = Boolean(target);
  const [saving, setSaving] = useState(false);
  // Metadata nhạy cảm KHÔNG nằm trong danh sách — tải riêng khi mở, chỉ khi đủ quyền chi tiết.
  const detail = useVehicleDocument(
    vehicleId,
    document?.id ?? null,
    open && Boolean(document) && canViewDetails,
  );
  const current = document ? detail.data : undefined;
  const defaults = useMemo<VehicleDocumentFormValues>(
    () => ({
      type: (document?.type ?? VEHICLE_DOCUMENT_TYPE.OTHER) as VehicleDocumentFormValues['type'],
      customTypeName: current?.customTypeName ?? document?.customTypeName ?? '',
      documentNumber: current?.documentNumber ?? '',
      holderName: current?.holderName ?? '',
      holderAddress: current?.holderAddress ?? '',
      plateNumber: current?.plateNumber ?? '',
      chassisNumber: current?.chassisNumber ?? '',
      engineNumber: current?.engineNumber ?? '',
      issuedAt: current?.issuedAt ?? null,
      expiresAt: current?.expiresAt ?? document?.expiresAt ?? null,
      notes: current?.notes ?? '',
    }),
    [document, current],
  );
  const { control, handleSubmit, reset } = useForm<VehicleDocumentFormValues>({
    resolver: yupResolver(vehicleDocumentFormSchema),
    defaultValues: defaults,
    values: defaults,
  });

  const blocked = Boolean(document) && (!canViewDetails || isForbidden(detail.error));
  const loading = Boolean(document) && canViewDetails && detail.isLoading;

  async function save(values: VehicleDocumentFormValues) {
    if (document && !current) return; // chưa có rowVersion thì không được ghi
    setSaving(true);
    const text = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);
    const body = {
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
    };
    try {
      if (document && current) {
        await updateVehicleDocument(vehicleId, document.id, {
          ...body,
          expectedRowVersion: current.rowVersion,
        });
      } else {
        await createVehicleDocument(vehicleId, body);
      }
      message.success(t('metadata.saved'));
      reset(defaults);
      onSaved();
    } catch (err) {
      if (getErrorCode(err) === 'CONFLICT') {
        // Sửa đè: người khác vừa lưu — không âm thầm ghi đè, mời tải lại.
        message.error(t('metadata.conflict'));
      } else {
        message.error(getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  const title = document
    ? t(editing ? 'metadata.editTitle' : 'detail.dialogTitle', {
        title: titleOf(document.type as VehicleDocumentType, document, domainLabel),
      })
    : '';

  /** Xem là bề mặt CHỈ ĐỌC — không có nút Lưu, chỉ một nút đóng. */
  const viewOnlyFooter = !editing && !blocked && !loading;

  return (
    <ResponsiveDialog
      open={open}
      title={title}
      size="md"
      mobileMode="fullscreen"
      confirmLoading={saving}
      onClose={onClose}
      {...(viewOnlyFooter
        ? // Chỉ đọc thì chỉ có một đường ra. Footer mặc định luôn dựng kèm nút Huỷ, mà "Huỷ"
          // cạnh "Đóng" trên một bề mặt không sửa gì là hai nút nói cùng một việc.
          {
            footer: (
              <Button type="primary" onClick={onClose}>
                {tCommon('actions.close')}
              </Button>
            ),
          }
        : {
            onOk: () => void handleSubmit(save)(),
            okText: t('metadata.save'),
            okDisabled: blocked || loading,
            cancelText: tCommon('actions.cancel'),
          })}
    >
      {blocked ? (
        <Alert
          type="warning"
          showIcon
          message={t('metadata.noDetailTitle')}
          description={t('metadata.noDetailBody')}
        />
      ) : loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !editing && current ? (
        <DocumentDetailView
          detail={current}
          canManage={canManage}
          onEdit={() => onModeChange('edit')}
        />
      ) : (
        <div className={styles.metaForm}>
          <Form component={false} layout="vertical" colon={false}>
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <TextField
                  control={control}
                  name="plateNumber"
                  label={t('metadata.plateNumber')}
                  placeholder={t('metadata.plateNumberPlaceholder')}
                />
              </Col>
              <Col xs={24} sm={12}>
                <TextField
                  control={control}
                  name="holderName"
                  label={t('metadata.holderName')}
                  placeholder={t('metadata.holderNamePlaceholder')}
                />
              </Col>
              <Col xs={24}>
                <TextField
                  control={control}
                  name="holderAddress"
                  label={t('metadata.holderAddress')}
                  placeholder={t('metadata.holderAddressPlaceholder')}
                />
              </Col>
              <Col xs={24} sm={12}>
                <TextField
                  control={control}
                  name="chassisNumber"
                  label={t('metadata.chassisNumber')}
                  placeholder={t('metadata.chassisNumberPlaceholder')}
                />
              </Col>
              <Col xs={24} sm={12}>
                <TextField
                  control={control}
                  name="engineNumber"
                  label={t('metadata.engineNumber')}
                  placeholder={t('metadata.engineNumberPlaceholder')}
                />
              </Col>
              <Col xs={24} sm={12}>
                <TextField
                  control={control}
                  name="documentNumber"
                  label={t('metadata.documentNumber')}
                  placeholder={t('metadata.documentNumberPlaceholder')}
                />
              </Col>
              <Col xs={24} sm={12}>
                <DateTimeField
                  control={control}
                  name="issuedAt"
                  label={t('metadata.issuedAt')}
                  dateOnly
                />
              </Col>
              <Col xs={24} sm={12}>
                <DateTimeField
                  control={control}
                  name="expiresAt"
                  label={t('metadata.expiresAt')}
                  dateOnly
                />
              </Col>
              <Col xs={24}>
                <TextAreaField
                  control={control}
                  name="notes"
                  label={t('metadata.notes')}
                  rows={2}
                  maxLength={4000}
                />
              </Col>
            </Row>
          </Form>
        </div>
      )}
    </ResponsiveDialog>
  );
}

// ── Lịch sử phiên bản ────────────────────────────────────────────────────────

function DocumentHistoryDialog({
  vehicleId,
  document,
  canViewFiles,
  onClose,
}: {
  vehicleId: string;
  document: VehicleDocumentSummary | null;
  canViewFiles: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Vehicles.documents');
  const fmt = useAppFormat();

  const { message } = App.useApp();
  // Lịch sử chứa tên file → endpoint riêng sau quyền view_files (Wave 5.1).
  const versions = useVehicleDocumentVersions(vehicleId, document?.id ?? null, canViewFiles);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function download(versionId: string) {
    setDownloadingId(versionId);
    try {
      const ticket = await fetchDocumentDownload(vehicleId, document!.id, versionId);
      window.open(ticket.downloadUrl, '_blank', 'noopener');
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <ResponsiveDialog
      open={Boolean(document)}
      title={t('history.title')}
      size="sm"
      onClose={onClose}
      footer={null}
    >
      {!canViewFiles || isForbidden(versions.error) ? (
        <Alert
          type="warning"
          showIcon
          message={t('history.noPermissionTitle')}
          description={t('history.noPermissionBody')}
        />
      ) : (
        <>
          {versions.isLoading ? <Skeleton active paragraph={{ rows: 3 }} /> : null}
          {versions.isError ? (
            <Alert type="error" showIcon message={t('history.loadError')} />
          ) : null}
          {versions.data ? (
            <List
              dataSource={versions.data}
              locale={{ emptyText: t('history.empty') }}
              renderItem={(version) => (
                <List.Item
                  actions={[
                    <Button
                      key="dl"
                      size="small"
                      loading={downloadingId === version.id}
                      onClick={() => void download(version.id)}
                    >
                      {t('history.download')}
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={t('history.version', {
                      version: version.version,
                      fileName: version.file.name,
                    })}
                    description={
                      version.archivedAt
                        ? t('history.replaced', { date: fmt.date(version.archivedAt) })
                        : t('history.active', { date: fmt.date(version.uploadedAt) })
                    }
                  />
                </List.Item>
              )}
            />
          ) : null}
        </>
      )}
    </ResponsiveDialog>
  );
}

// ── Đối soát OCR ────────────────────────────────────────────────────────────

function OcrReviewDialog({
  vehicleId,
  review,
  vehiclePlate,
  canViewDetails,
  onClose,
  onApplied,
}: {
  vehicleId: string;
  review: { document: VehicleDocumentSummary; job: VehicleDocumentOcrJob } | null;
  vehiclePlate: string | null;
  canViewDetails: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const t = useTranslations('Vehicles.documents');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const { message } = App.useApp();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applyPlateToVehicle, setApplyPlateToVehicle] = useState(false);
  const [saving, setSaving] = useState(false);

  const job = review?.job ?? null;
  // Cột "Hiện tại" là metadata nhạy cảm — tải qua endpoint chi tiết (quyền view_details).
  const detail = useVehicleDocument(
    vehicleId,
    review?.document.id ?? null,
    Boolean(review) && canViewDetails,
  );
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

  async function apply(fields: string[]) {
    if (!review) return;
    setSaving(true);
    try {
      await applyDocumentOcr(vehicleId, review.document.id, review.job.id, {
        fields: fields as ApplyOcrFieldsInput['fields'],
        applyPlateToVehicle: applyPlateToVehicle && fields.includes('plateNumber'),
      });
      message.success(fields.length > 0 ? t('review.applied') : t('review.markedReviewed'));
      setSelected(new Set());
      setApplyPlateToVehicle(false);
      onApplied();
    } catch (err) {
      if (getErrorCode(err) === 'CONFLICT') {
        message.error(t('review.conflict'));
      } else {
        message.error(getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open={Boolean(review)}
      title={t('review.title')}
      size="md"
      mobileMode="fullscreen"
      confirmLoading={saving}
      onClose={onClose}
      // "Cập nhật đã chọn" là hành động chính nhưng KHÔNG mặc định chọn gì — không có "ghi đè
      // tất cả": người dùng phải tự tick từng trường (docs §8).
      onOk={() => void apply([...selected])}
      okText={
        selected.size > 0 ? t('review.applyCount', { count: selected.size }) : t('review.apply')
      }
      okDisabled={selected.size === 0}
      cancelText={tCommon('actions.close')}
      footer={undefined}
    >
      {job ? (
        <div className={styles.reviewStack}>
          <Alert
            type="success"
            showIcon
            message={
              job.confidence != null
                ? t('review.successWithConfidence', { confidence: job.confidence })
                : t('review.success')
            }
          />
          <Alert type="warning" showIcon message={t('review.warning')} />
          {job.fields.length === 0 ? (
            <Alert type="info" showIcon message={t('review.empty')} />
          ) : (
            /* Bảng rộng cuộn TRONG khung — hộp thoại/trang không bao giờ cuộn ngang. */
            <div className={styles.reviewTableWrap}>
              <table className={styles.reviewTable}>
                <thead>
                  <tr>
                    <th aria-label={t('review.colSelect')} />
                    <th>{t('review.colField')}</th>
                    <th>{t('review.colCurrent')}</th>
                    <th>{t('review.colOcr')}</th>
                  </tr>
                </thead>
                <tbody>
                  {job.fields.map((field) => {
                    const fieldLabel = domainLabel(
                      'vehicleDocumentOcrField',
                      field.field,
                      field.field,
                    );
                    return (
                      <tr key={field.field}>
                        <td>
                          <Checkbox
                            aria-label={t('review.selectField', { field: fieldLabel })}
                            checked={selected.has(field.field)}
                            onChange={(event) => {
                              setSelected((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(field.field);
                                else next.delete(field.field);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td>{fieldLabel}</td>
                        <td className={styles.currentValue}>{currentValueOf(field.field)}</td>
                        <td>
                          <span className={styles.ocrValue}>{field.value}</span>
                          {field.confidence != null ? (
                            <Tag className={styles.confidenceTag}>{field.confidence}%</Tag>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {selected.has('plateNumber') ? (
            <Checkbox
              checked={applyPlateToVehicle}
              onChange={(event) => setApplyPlateToVehicle(event.target.checked)}
            >
              {t('review.applyPlateToVehicle')}
            </Checkbox>
          ) : null}
          <Button block onClick={() => void apply([])} disabled={saving}>
            {t('review.skip')}
          </Button>
        </div>
      ) : null}
    </ResponsiveDialog>
  );
}
