'use client';

import {
  FileImageOutlined,
  FilePdfOutlined,
  HistoryOutlined,
  PlusOutlined,
  ScanOutlined,
  UploadOutlined,
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
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  PERMISSION,
  VEHICLE_DOCUMENT_OCR_FIELD_LABEL,
  VEHICLE_DOCUMENT_PRESENTATION,
  VEHICLE_DOCUMENT_PRESENTATION_META,
  VEHICLE_DOCUMENT_TYPE,
  VEHICLE_DOCUMENT_TYPE_LABEL,
  type VehicleDocumentOcrField as OcrFieldKey,
  type VehicleDocumentPresentation,
  type VehicleDocumentType,
} from '@xeprime/types';
import { vehicleDocumentFormSchema, type VehicleDocumentFormValues } from '@xeprime/validators';
import { DateTimeField } from '@/components/form/DateTimeField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { usePermissions } from '@/hooks/use-permissions';
import { ApiClientError, getErrorCode, getErrorMessage } from '@/services/api-client';
import { validateDocumentFile, uploadToR2 } from '@/services/upload';
import type { VehicleDetail } from '@/features/vehicles/types';
import {
  applyDocumentOcr,
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
import type { ApplyOcrFieldsInput, VehicleDocumentOcrJob, VehicleDocumentSummary } from '../types';
import styles from './VehicleDocumentsWorkspace.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useUploadRejectionMessage } from '@/i18n/use-upload-rejection-message';

const STANDARD_TYPES: readonly VehicleDocumentType[] = [
  VEHICLE_DOCUMENT_TYPE.REGISTRATION,
  VEHICLE_DOCUMENT_TYPE.INSPECTION,
  VEHICLE_DOCUMENT_TYPE.INSURANCE,
];

interface UploadingState {
  key: string;
  fileName: string;
  progress: number;
  error?: string;
  file?: File;
}

function titleOf(type: VehicleDocumentType, doc: VehicleDocumentSummary | null): string {
  return doc?.type === VEHICLE_DOCUMENT_TYPE.OTHER && doc.customTypeName
    ? doc.customTypeName
    : VEHICLE_DOCUMENT_TYPE_LABEL[type];
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
 *  - `view_files` → "Xem file" + lịch sử phiên bản; `manage` → tải file, nhập/sửa, OCR.
 *
 * Giấy tờ TUỲ CHỌN; hết hạn chỉ CẢNH BÁO — tab này không đụng gì tới trạng thái xe.
 */
export function VehicleDocumentsWorkspace({ vehicle }: { vehicle: VehicleDetail }) {
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.VEHICLE_DOCUMENT_VIEW);
  const canViewDetails = permissions.has(PERMISSION.VEHICLE_DOCUMENT_DETAIL_VIEW);
  const canViewFiles = permissions.has(PERMISSION.VEHICLE_DOCUMENT_FILE_VIEW);
  const canManage = permissions.has(PERMISSION.VEHICLE_DOCUMENT_MANAGE);
  const documents = useVehicleDocuments(vehicle.id, canView);

  if (!canView) {
    return (
      <PermissionState
        title="Không có quyền xem giấy tờ"
        description="Bạn không có quyền xem hồ sơ giấy tờ của xe này. Liên hệ chủ gian hàng để được cấp quyền."
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
        message="Không tải được danh mục giấy tờ"
        description={
          <Button size="small" onClick={() => void documents.refetch()}>
            Thử lại
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
  const uploadRejectionMessage = useUploadRejectionMessage();
  const { message } = App.useApp();
  const invalidate = useInvalidateVehicleDocuments(vehicle.id);
  const [uploading, setUploading] = useState<Record<string, UploadingState>>({});
  const [metadataFor, setMetadataFor] = useState<VehicleDocumentSummary | null>(null);
  const [addOther, setAddOther] = useState(false);
  const [historyFor, setHistoryFor] = useState<VehicleDocumentSummary | null>(null);
  const [reviewFor, setReviewFor] = useState<{
    document: VehicleDocumentSummary;
    job: VehicleDocumentOcrJob;
  } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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
      message.success('Đã lưu tài liệu');
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
        message.warning(
          'Không thể trích xuất do ảnh mờ hoặc không đúng định dạng — nhập thủ công hoặc tải ảnh khác.',
        );
      } else {
        message.error('Trích xuất thất bại — thử lại hoặc nhập thủ công.');
      }
    } catch (err) {
      if (err instanceof ApiClientError && getErrorCode(err) === 'OCR_NOT_CONFIGURED') {
        // Chưa có provider OCR (thực tế hiện tại) — nói thẳng và mở đường nhập tay.
        message.info('Trích xuất tự động chưa khả dụng — vui lòng nhập thông tin thủ công.');
        setMetadataFor(doc);
        return;
      }
      message.error(getErrorMessage(err));
    }
  }

  return (
    <div className={styles.stack}>
      {!canManage ? (
        <Alert
          type="info"
          showIcon
          message="Chế độ xem — Bạn chỉ có quyền xem giấy tờ, không thể chỉnh sửa."
        />
      ) : null}

      <Card
        title="Danh mục hồ sơ & giấy tờ xe"
        className={styles.card}
        extra={
          canManage ? (
            <Button icon={<PlusOutlined />} onClick={() => setAddOther(true)}>
              Thêm loại giấy tờ
            </Button>
          ) : null
        }
      >
        <List
          dataSource={rows}
          renderItem={(row) => (
            <DocumentRow
              key={row.key}
              row={row}
              uploading={uploading[row.key] ?? null}
              canManage={canManage}
              canViewDetails={canViewDetails}
              canViewFiles={canViewFiles}
              downloading={downloadingId === row.document?.id}
              onUpload={(file) => void uploadFor(row.key, row.type, row.document, file)}
              onRetry={() => {
                const state = uploading[row.key];
                if (state?.file) void uploadFor(row.key, row.type, row.document, state.file);
              }}
              onCancelUpload={() => setUploadState(row.key, null)}
              onOpen={() => row.document && void openFile(row.document)}
              onOcr={() => row.document && void runOcr(row.document)}
              onEdit={() => row.document && setMetadataFor(row.document)}
              onHistory={() => row.document && setHistoryFor(row.document)}
            />
          )}
        />
      </Card>

      <Alert
        type="info"
        showIcon
        className={styles.ocrNote}
        message="Quy trình trích xuất thông tin tự động bằng AI (OCR Review)"
        description="Kết quả trích xuất OCR luôn chỉ là bản nháp hỗ trợ nhập liệu — bạn bắt buộc đối soát với tài liệu gốc và tự chọn từng trường trước khi lưu vào hồ sơ xe."
      />

      <DocumentMetadataDialog
        vehicleId={vehicle.id}
        document={metadataFor}
        createOther={addOther}
        canViewDetails={canViewDetails}
        onClose={() => {
          setMetadataFor(null);
          setAddOther(false);
        }}
        onSaved={() => {
          setMetadataFor(null);
          setAddOther(false);
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
  uploading,
  canManage,
  canViewDetails,
  canViewFiles,
  downloading,
  onUpload,
  onRetry,
  onCancelUpload,
  onOpen,
  onOcr,
  onEdit,
  onHistory,
}: {
  row: { type: VehicleDocumentType; document: VehicleDocumentSummary | null };
  uploading: UploadingState | null;
  canManage: boolean;
  canViewDetails: boolean;
  canViewFiles: boolean;
  downloading: boolean;
  onUpload: (file: File) => void;
  onRetry: () => void;
  onCancelUpload: () => void;
  onOpen: () => void;
  onOcr: () => void;
  onEdit: () => void;
  onHistory: () => void;
}) {
  const fmt = useAppFormat();

  const doc = row.document;
  const presentation = (doc?.presentation ??
    VEHICLE_DOCUMENT_PRESENTATION.MISSING) as VehicleDocumentPresentation;
  const meta = VEHICLE_DOCUMENT_PRESENTATION_META[presentation];
  const title = titleOf(row.type, doc);
  // DTO summary không mang tên file (metadata file riêng tư — Wave 5.1); icon suy từ việc có file.
  const hasFile = Boolean(doc?.hasFile);

  return (
    <List.Item className={styles.row}>
      <span className={styles.rowIcon} aria-hidden="true">
        {hasFile ? <FilePdfOutlined /> : <FileImageOutlined />}
      </span>
      <div className={styles.rowBody}>
        <div className={styles.rowHead}>
          <strong>{title}</strong>
          <Tag color={meta.color}>{meta.label}</Tag>
        </div>
        <div className={styles.rowMeta}>
          Ngày hết hạn:{' '}
          <strong>
            {doc?.expiresAt
              ? fmt.date(`${doc.expiresAt}T00:00:00.000Z`)
              : hasFile
                ? 'Không thời hạn'
                : '--/--/----'}
          </strong>
        </div>
        {presentation === VEHICLE_DOCUMENT_PRESENTATION.EXPIRING_SOON && doc?.expiresAt ? (
          <Alert
            className={styles.rowAlert}
            type="warning"
            showIcon
            message={`Giấy tờ sắp hết hạn (mốc hết hạn: ${fmt.date(`${doc.expiresAt}T00:00:00.000Z`)}).`}
          />
        ) : null}
        {presentation === VEHICLE_DOCUMENT_PRESENTATION.EXPIRED && doc?.expiresAt ? (
          <Alert
            className={styles.rowAlert}
            type="error"
            showIcon
            message={`Hết hạn sử dụng: đã hết hiệu lực từ ngày ${fmt.date(`${doc.expiresAt}T00:00:00.000Z`)}.`}
          />
        ) : null}
        {uploading ? (
          uploading.error ? (
            <Alert
              className={styles.rowAlert}
              type="error"
              showIcon
              role="alert"
              message={`Lỗi tải lên: ${uploading.error}`}
              action={
                <span className={styles.uploadActions}>
                  <Button size="small" onClick={onCancelUpload}>
                    Hủy
                  </Button>
                  <Button size="small" type="primary" onClick={onRetry}>
                    Thử lại
                  </Button>
                </span>
              }
            />
          ) : (
            <div className={styles.uploadProgress} aria-label={`Đang tải ${uploading.fileName}`}>
              <span className={styles.fileName}>Đang tải lên tài liệu… {uploading.fileName}</span>
              <Progress percent={uploading.progress} size="small" />
            </div>
          )
        ) : null}
      </div>
      <div className={styles.rowActions}>
        {hasFile && canViewFiles ? (
          <Button size="small" loading={downloading} onClick={onOpen}>
            Xem file
          </Button>
        ) : null}
        {/* OCR/nhập tay cần đọc được metadata hiện tại để đối soát — đòi thêm view_details. */}
        {hasFile && canManage && canViewDetails ? (
          <Button size="small" icon={<ScanOutlined />} onClick={onOcr}>
            Trích xuất OCR
          </Button>
        ) : null}
        {doc && canManage && canViewDetails ? (
          <Button size="small" onClick={onEdit}>
            Nhập thủ công
          </Button>
        ) : null}
        {/* Lịch sử phiên bản chứa tên file → sau quyền view_files (Wave 5.1). */}
        {hasFile && canViewFiles ? (
          <Button
            size="small"
            icon={<HistoryOutlined />}
            onClick={onHistory}
            aria-label={`Lịch sử ${title}`}
          />
        ) : null}
        {canManage && !uploading ? (
          <Upload
            accept="image/jpeg,image/png,image/webp,application/pdf"
            showUploadList={false}
            beforeUpload={(file) => {
              onUpload(file);
              return false; // flow presign→PUT→attach tự lo, không dùng upload mặc định AntD
            }}
          >
            <Button size="small" type={hasFile ? 'default' : 'primary'} icon={<UploadOutlined />}>
              {hasFile ? 'Tải lại' : 'Tải lên tài liệu'}
            </Button>
          </Upload>
        ) : null}
      </div>
    </List.Item>
  );
}

// ── Nhập/sửa metadata (nhập tay) ────────────────────────────────────────────

function DocumentMetadataDialog({
  vehicleId,
  document,
  createOther,
  canViewDetails,
  onClose,
  onSaved,
}: {
  vehicleId: string;
  document: VehicleDocumentSummary | null;
  createOther: boolean;
  canViewDetails: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const open = Boolean(document) || createOther;
  const [saving, setSaving] = useState(false);
  // Metadata nhạy cảm KHÔNG nằm trong danh sách — tải riêng khi mở, chỉ khi đủ quyền chi tiết.
  const detail = useVehicleDocument(
    vehicleId,
    document?.id ?? null,
    open && Boolean(document) && canViewDetails,
  );
  const editing = document ? detail.data : undefined;
  const defaults = useMemo<VehicleDocumentFormValues>(
    () => ({
      type: (document?.type ?? VEHICLE_DOCUMENT_TYPE.OTHER) as VehicleDocumentFormValues['type'],
      customTypeName: editing?.customTypeName ?? document?.customTypeName ?? '',
      documentNumber: editing?.documentNumber ?? '',
      holderName: editing?.holderName ?? '',
      holderAddress: editing?.holderAddress ?? '',
      plateNumber: editing?.plateNumber ?? '',
      chassisNumber: editing?.chassisNumber ?? '',
      engineNumber: editing?.engineNumber ?? '',
      issuedAt: editing?.issuedAt ?? null,
      expiresAt: editing?.expiresAt ?? document?.expiresAt ?? null,
      notes: editing?.notes ?? '',
    }),
    [document, editing],
  );
  const { control, handleSubmit, reset } = useForm<VehicleDocumentFormValues>({
    resolver: yupResolver(vehicleDocumentFormSchema),
    defaultValues: defaults,
    values: defaults,
  });

  const blocked = Boolean(document) && (!canViewDetails || isForbidden(detail.error));
  const loading = Boolean(document) && canViewDetails && detail.isLoading;

  async function save(values: VehicleDocumentFormValues) {
    if (document && !editing) return; // chưa có rowVersion thì không được ghi
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
      if (document && editing) {
        await updateVehicleDocument(vehicleId, document.id, {
          ...body,
          expectedRowVersion: editing.rowVersion,
        });
      } else {
        await createVehicleDocument(vehicleId, body);
      }
      message.success('Đã lưu thông tin giấy tờ');
      reset(defaults);
      onSaved();
    } catch (err) {
      if (getErrorCode(err) === 'CONFLICT') {
        // Sửa đè: người khác vừa lưu — không âm thầm ghi đè, mời tải lại.
        message.error(
          'Giấy tờ vừa được người khác cập nhật — đóng hộp thoại và tải lại trước khi sửa tiếp.',
        );
      } else {
        message.error(getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      title={
        document
          ? `Nhập thông tin giấy tờ — ${titleOf(document.type as VehicleDocumentType, document)}`
          : 'Thêm loại giấy tờ'
      }
      size="md"
      mobileMode="fullscreen"
      confirmLoading={saving}
      onClose={onClose}
      onOk={() => void handleSubmit(save)()}
      okText="Lưu giấy tờ"
      okDisabled={blocked || loading}
      cancelText="Hủy"
    >
      {blocked ? (
        <Alert
          type="warning"
          showIcon
          message="Không có quyền xem chi tiết giấy tờ"
          description="Cần quyền xem chi tiết giấy tờ (vehicles.documents.view_details) để đọc và sửa thông tin nhạy cảm."
        />
      ) : loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <div className={styles.metaForm}>
          <Form component={false} layout="vertical" colon={false}>
            <Row gutter={16}>
              {!document ? (
                <Col xs={24}>
                  <TextField
                    control={control}
                    name="customTypeName"
                    label="Tên loại giấy tờ"
                    placeholder="VD: Phù hiệu xe hợp đồng"
                    required
                  />
                </Col>
              ) : null}
              <Col xs={24} sm={12}>
                <TextField
                  control={control}
                  name="plateNumber"
                  label="Biển số xe"
                  placeholder="VD: 51A-123.45"
                />
              </Col>
              <Col xs={24} sm={12}>
                <TextField
                  control={control}
                  name="holderName"
                  label="Họ tên chủ xe"
                  placeholder="VD: Nguyễn Văn A"
                />
              </Col>
              <Col xs={24}>
                <TextField
                  control={control}
                  name="holderAddress"
                  label="Địa chỉ"
                  placeholder="VD: 123 Lê Lợi, Q.1, TP. HCM"
                />
              </Col>
              <Col xs={24} sm={12}>
                <TextField
                  control={control}
                  name="chassisNumber"
                  label="Số khung (Chassis)"
                  placeholder="VD: WDD12345678"
                />
              </Col>
              <Col xs={24} sm={12}>
                <TextField
                  control={control}
                  name="engineNumber"
                  label="Số máy (Engine)"
                  placeholder="VD: M27201234"
                />
              </Col>
              <Col xs={24} sm={12}>
                <TextField
                  control={control}
                  name="documentNumber"
                  label="Số giấy tờ"
                  placeholder="Số serial trên giấy tờ"
                />
              </Col>
              <Col xs={24} sm={12}>
                <DateTimeField
                  control={control}
                  name="issuedAt"
                  label="Ngày đăng ký / ngày cấp"
                  dateOnly
                />
              </Col>
              <Col xs={24} sm={12}>
                <DateTimeField control={control} name="expiresAt" label="Ngày hết hạn" dateOnly />
              </Col>
              <Col xs={24}>
                <TextAreaField
                  control={control}
                  name="notes"
                  label="Ghi chú"
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
      title="Lịch sử phiên bản giấy tờ"
      size="sm"
      onClose={onClose}
      footer={null}
    >
      {!canViewFiles || isForbidden(versions.error) ? (
        <Alert
          type="warning"
          showIcon
          message="Không có quyền xem lịch sử file"
          description="Cần quyền mở file giấy tờ (vehicles.documents.view_files)."
        />
      ) : (
        <>
          {versions.isLoading ? <Skeleton active paragraph={{ rows: 3 }} /> : null}
          {versions.isError ? (
            <Alert type="error" showIcon message="Không tải được lịch sử" />
          ) : null}
          {versions.data ? (
            <List
              dataSource={versions.data}
              renderItem={(version) => (
                <List.Item
                  actions={[
                    <Button
                      key="dl"
                      size="small"
                      loading={downloadingId === version.id}
                      onClick={() => void download(version.id)}
                    >
                      Xem file
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={`Bản ${version.version} — ${version.file.name}`}
                    description={
                      version.archivedAt
                        ? `Đã thay thế ${fmt.date(version.archivedAt)}`
                        : `Đang sử dụng · tải lên ${fmt.date(version.uploadedAt)}`
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

  function currentValueOf(field: string): string {
    if (!doc) return '—';
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
    return map[field] ?? '—';
  }

  async function apply(fields: string[]) {
    if (!review) return;
    setSaving(true);
    try {
      await applyDocumentOcr(vehicleId, review.document.id, review.job.id, {
        fields: fields as ApplyOcrFieldsInput['fields'],
        applyPlateToVehicle: applyPlateToVehicle && fields.includes('plateNumber'),
      });
      message.success(
        fields.length > 0 ? 'Đã cập nhật các trường đã chọn' : 'Đã đánh dấu đối soát xong',
      );
      setSelected(new Set());
      setApplyPlateToVehicle(false);
      onApplied();
    } catch (err) {
      if (getErrorCode(err) === 'CONFLICT') {
        message.error('Kết quả OCR này đã được người khác đối soát — đóng hộp thoại và tải lại.');
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
      title="Kiểm tra kết quả OCR"
      size="md"
      mobileMode="fullscreen"
      confirmLoading={saving}
      onClose={onClose}
      // "Cập nhật đã chọn" là hành động chính nhưng KHÔNG mặc định chọn gì — không có "ghi đè
      // tất cả": người dùng phải tự tick từng trường (docs §8).
      onOk={() => void apply([...selected])}
      okText={`Cập nhật đã chọn${selected.size > 0 ? ` (${selected.size})` : ''}`}
      okDisabled={selected.size === 0}
      cancelText="Đóng"
      footer={undefined}
    >
      {job ? (
        <div className={styles.reviewStack}>
          <Alert
            type="success"
            showIcon
            message={`Nhận dạng thành công${job.confidence != null ? ` — độ tin cậy trích xuất: ${job.confidence}%` : ''}`}
          />
          <Alert
            type="warning"
            showIcon
            message="Kết quả OCR chỉ được dùng làm bản nháp hỗ trợ nhập liệu nhanh. Bạn bắt buộc phải đối soát lại với tài liệu gốc trước khi lưu."
          />
          {/* Bảng rộng cuộn TRONG khung — hộp thoại/trang không bao giờ cuộn ngang. */}
          <div className={styles.reviewTableWrap}>
            <table className={styles.reviewTable}>
              <thead>
                <tr>
                  <th aria-label="Chọn" />
                  <th>Trường</th>
                  <th>Hiện tại</th>
                  <th>Nhận dạng (OCR)</th>
                </tr>
              </thead>
              <tbody>
                {job.fields.map((field) => (
                  <tr key={field.field}>
                    <td>
                      <Checkbox
                        aria-label={`Chọn ${VEHICLE_DOCUMENT_OCR_FIELD_LABEL[field.field as OcrFieldKey] ?? field.field}`}
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
                    <td>
                      {VEHICLE_DOCUMENT_OCR_FIELD_LABEL[field.field as OcrFieldKey] ?? field.field}
                    </td>
                    <td className={styles.currentValue}>{currentValueOf(field.field)}</td>
                    <td>
                      <span className={styles.ocrValue}>{field.value}</span>
                      {field.confidence != null ? (
                        <Tag className={styles.confidenceTag}>{field.confidence}%</Tag>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected.has('plateNumber') ? (
            <Checkbox
              checked={applyPlateToVehicle}
              onChange={(event) => setApplyPlateToVehicle(event.target.checked)}
            >
              Cập nhật biển số vào hồ sơ xe (xe đang công khai sẽ về chờ duyệt lại)
            </Checkbox>
          ) : null}
          <Button block onClick={() => void apply([])} disabled={saving}>
            Bỏ qua — đã đối soát, không cập nhật gì
          </Button>
        </div>
      ) : null}
    </ResponsiveDialog>
  );
}
