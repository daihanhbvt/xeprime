'use client';

import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  DatePicker,
  Dropdown,
  Input,
  Popconfirm,
  Result,
  Skeleton,
  Spin,
  Upload,
} from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import {
  API_ERROR_CODE,
  CUSTOMER_DOCUMENT_EXPIRY_META,
  CUSTOMER_DOCUMENT_TYPE,
  DOCUMENT_UPLOAD_MIME_TYPES,
  IDENTITY_VERIFY_METHOD_LABEL,
  IDENTITY_VERIFY_METHOD_VALUES,
  STATUS_COLOR,
  type CustomerDocumentExpiry,
  type IdentityVerifyMethod,
} from '@xeprime/types';
import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { StatusBadge, ToneDotBadge } from '@/components/data-display/StatusBadge';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { DAY_PARAM_FORMAT, dayjs } from '@/lib/datetime';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { validateDocumentFile } from '@/services/upload';
import { useUploadRejectionMessage } from '@/i18n/use-upload-rejection-message';
import { fetchCustomerDocumentDownload } from '../api';
import { DOCUMENT_TYPE_VALUES, isPreviewableImage } from '../constants';
import {
  useCustomerDocumentPreviews,
  useCustomerDocuments,
  useDeleteCustomerDocument,
  useUpdateCustomerDocument,
  useUploadCustomerDocument,
  useVerifyCustomerDocument,
} from '../hooks/use-customers';
import type { CustomerDocument } from '../types';
import styles from './CustomerDocumentsPanel.module.css';
import { useAppFormat, useDatePickerPattern } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';

const ACCEPT = DOCUMENT_UPLOAD_MIME_TYPES.join(',');

/** Ba loại có ô CỐ ĐỊNH (Figma `23797:62633`); loại "khác" luôn có một ô trống để tải thêm. */
const FIXED_TYPES = [
  CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID,
  CUSTOMER_DOCUMENT_TYPE.DRIVER_LICENCE,
  CUSTOMER_DOCUMENT_TYPE.PASSPORT,
] as const;

/**
 * Giấy tờ tuỳ thân của khách — lưới thẻ theo loại (CCCD · GPLX · Hộ chiếu · Khác), Figma
 * Partner-XePrime `23797:62633` (02/11/2026). Dùng chung cho tab "Giấy tờ" của hồ sơ khách và hộp
 * "Giấy tờ khách" mở từ chi tiết đơn.
 *
 * Ba nguyên tắc giữ nguyên từ bản trước:
 *  - **Không có URL nào sống lâu.** Ảnh thu nhỏ / mở PDF đều xin link ký ngắn hạn, mỗi lần là một
 *    dòng audit; chỉ người có quyền xem tệp mới phát ra request.
 *  - **Thấy trạng thái ≠ mở được tệp.**
 *  - **Đối chiếu là thao tác thủ công có ghi nhận** — chọn đã soi bằng đường nào (VNeID / bản gốc…).
 *
 * Tải lên là MỘT cú bấm (03/11/2026): bấm hoặc kéo ảnh vào ô ảnh của thẻ là tải ngay, đúng loại
 * của thẻ — không có hộp nhập thông tin chen giữa. Chủ thẻ / số / thời hạn điền sau bằng "Sửa
 * thông tin". Nút "Tải lên giấy tờ" ở đầu khối chọn loại trước, rồi mở hộp chọn tệp.
 *
 * "Thay giấy tờ" = tải bản mới (mang theo chủ thẻ + số của bản cũ, KHÔNG mang thời hạn — thay
 * thường là vì hết hạn), xong thì gỡ bản cũ (soft-delete + audit) — bản mới cần đối chiếu lại.
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
  disabled?: boolean;
}) {
  const t = useTranslations('Customers.profile.docs');
  const tCustomers = useTranslations('Customers');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();

  const { data, isLoading, isError, refetch, isFetching } = useCustomerDocuments(customerId);
  const remove = useDeleteCustomerDocument();
  const verify = useVerifyCustomerDocument();
  const upload = useUploadCustomerDocument();
  const uploadRejectionMessage = useUploadRejectionMessage();
  const [opening, setOpening] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomerDocument | null>(null);
  /** Thẻ đang tải (khoá ô) — một thẻ một lượt; thẻ khác vẫn tải song song được. */
  const [uploading, setUploading] = useState<ReadonlySet<string>>(new Set());
  const headerInput = useRef<HTMLInputElement>(null);
  const headerType = useRef<string>(CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID);

  const items = useMemo(() => data ?? [], [data]);
  const previewQ = useCustomerDocumentPreviews(customerId, items, canViewFiles);
  const previews = previewQ.data ?? {};
  const editable = canManage && !disabled;

  /** Mỗi loại cố định một ô (dù chưa có giấy); giấy tờ nhiều bản / loại khác nối tiếp sau. */
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

  async function openDocument(document: CustomerDocument) {
    setOpening(document.id);
    try {
      const ticket = await fetchCustomerDocumentDownload(customerId, document.id);
      window.open(ticket.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setOpening(null);
    }
  }

  async function uploadFile(
    slotKey: string,
    documentType: string,
    file: File,
    replaces?: CustomerDocument,
  ) {
    const invalid = validateDocumentFile(file);
    if (invalid) {
      message.error(uploadRejectionMessage(invalid));
      return;
    }
    setUploading((prev) => new Set(prev).add(slotKey));
    try {
      await upload.mutateAsync({
        id: customerId,
        input: {
          documentType,
          customTypeName: replaces?.customTypeName ?? null,
          holderName: replaces?.holderName ?? null,
          documentNumber: replaces?.documentNumber ?? null,
          file,
        },
      });
      if (replaces) {
        await remove.mutateAsync({ id: customerId, documentId: replaces.id });
        message.success(t('replaced'));
      } else {
        message.success(tCustomers('documents.uploaded'));
      }
    } catch (err) {
      // Lỗi PUT lên R2 là `Error` thường (không mã) — câu của nó là thứ duy nhất nói được ngã ở đâu.
      message.error(
        getErrorCode(err) === API_ERROR_CODE.UPLOADS_NOT_CONFIGURED
          ? tCustomers('documents.uploadsNotConfigured')
          : getErrorCode(err)
            ? errorMessage(err)
            : getErrorMessage(err),
      );
    } finally {
      setUploading((prev) => {
        const next = new Set(prev);
        next.delete(slotKey);
        return next;
      });
    }
  }

  /** Bộ chọn tệp của AntD — chặn upload mặc định, tự đi presign → R2 → complete. */
  const picker = (slotKey: string, documentType: string, replaces?: CustomerDocument) => ({
    accept: ACCEPT,
    multiple: false,
    showUploadList: false,
    disabled: uploading.has(slotKey),
    beforeUpload: (file: File) => {
      void uploadFile(slotKey, documentType, file, replaces);
      return false;
    },
  });

  const typeLabel = (type: string, document: CustomerDocument | null) =>
    type === CUSTOMER_DOCUMENT_TYPE.OTHER && document?.customTypeName
      ? document.customTypeName
      : dl('customerDocumentType', type);

  if (isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (isError) {
    return (
      <Result
        status="warning"
        title={tCustomers('documents.errorTitle')}
        extra={
          <Button onClick={() => void refetch()} loading={isFetching}>
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t('title')}</h2>
        {editable ? (
          <>
            <Dropdown
              trigger={['click']}
              disabled={uploading.has('header')}
              menu={{
                items: DOCUMENT_TYPE_VALUES.map((value) => ({
                  key: value,
                  label: dl('customerDocumentType', value),
                })),
                onClick: ({ key }) => {
                  headerType.current = key;
                  headerInput.current?.click();
                },
              }}
            >
              <button type="button" className={styles.headAction}>
                {uploading.has('header') ? (
                  <Spin size="small" />
                ) : (
                  <PlusOutlined aria-hidden="true" />
                )}{' '}
                {t('upload')}
              </button>
            </Dropdown>
            <input
              ref={headerInput}
              type="file"
              accept={ACCEPT}
              hidden
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Xoá giá trị để chọn lại CÙNG tệp (sau một lần lỗi) vẫn phát sự kiện change.
                event.target.value = '';
                if (file) void uploadFile('header', headerType.current, file);
              }}
            />
          </>
        ) : null}
      </div>
      <p className={styles.hint}>{tCustomers('hints.documents')}</p>

      <PreviewImageGroup>
        <ul className={styles.grid}>
          {slots.map(({ key, type, document }) => (
            <li key={key} className={styles.card}>
              {!document && editable ? (
                <Upload.Dragger {...picker(key, type)} className={styles.dropzone}>
                  <span className={styles.dropInner}>
                    {uploading.has(key) ? (
                      <Spin />
                    ) : (
                      <FileImageOutlined className={styles.thumbIcon} aria-hidden="true" />
                    )}
                    <span className={styles.dropHint}>
                      {uploading.has(key) ? t('uploading') : t('dropHint')}
                    </span>
                  </span>
                </Upload.Dragger>
              ) : (
                <span className={styles.thumb}>
                  {document && previews[document.id] ? (
                    <PreviewImage
                      src={previews[document.id] as string}
                      alt={document.originalName}
                      className={styles.thumbImage}
                    />
                  ) : document && !isPreviewableImage(document.mimeType) ? (
                    <FilePdfOutlined className={styles.thumbIcon} />
                  ) : (
                    <FileImageOutlined className={styles.thumbIcon} />
                  )}
                  {document && uploading.has(key) ? (
                    <span className={styles.thumbBusy}>
                      <Spin />
                    </span>
                  ) : null}
                </span>
              )}

              <h3 className={styles.cardTitle}>{typeLabel(type, document)}</h3>
              <dl className={styles.facts}>
                <div>
                  <dt>{t('holder')}</dt>
                  <dd>{document?.holderName ?? '-'}</dd>
                </div>
                <div>
                  <dt>{t(`numberOf.${type}` as 'numberOf.other')}</dt>
                  <dd>{document?.documentNumber ?? '-'}</dd>
                </div>
                <div>
                  <dt>{t('expiry')}</dt>
                  <dd>
                    {!document ? (
                      '-'
                    ) : document.expiresAt ? (
                      <span className={styles.expiry}>
                        {fmt.date(document.expiresAt)}
                        <StatusBadge
                          value={document.expiryStatus as CustomerDocumentExpiry}
                          meta={CUSTOMER_DOCUMENT_EXPIRY_META}
                          group="customerDocumentExpiry"
                        />
                      </span>
                    ) : (
                      t('noExpiry')
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t('status')}</dt>
                  <dd>
                    {!document ? (
                      <ToneDotBadge color={STATUS_COLOR.NEUTRAL}>{t('notUploaded')}</ToneDotBadge>
                    ) : document.verifiedAt ? (
                      <ToneDotBadge color={STATUS_COLOR.SUCCESS}>{t('verified')}</ToneDotBadge>
                    ) : (
                      <ToneDotBadge color={STATUS_COLOR.WARNING}>{t('notVerified')}</ToneDotBadge>
                    )}
                  </dd>
                </div>
              </dl>
              {document ? (
                <p className={styles.meta}>
                  {document.originalName} ·{' '}
                  {document.uploadedByName ?? tCustomers('documents.unknownUploader')} ·{' '}
                  {fmt.date(document.createdAt)}
                </p>
              ) : null}

              <div className={styles.actions}>
                {document ? (
                  <>
                    {canViewFiles && !isPreviewableImage(document.mimeType) ? (
                      <Button
                        icon={<EyeOutlined />}
                        loading={opening === document.id}
                        onClick={() => void openDocument(document)}
                        aria-label={tCustomers('documents.openFile')}
                      />
                    ) : null}
                    {editable ? (
                      <>
                        <Popconfirm
                          title={tCustomers('documents.removeTitle')}
                          okText={tCustomers('documents.removeOk')}
                          cancelText={tCommon('actions.close')}
                          onConfirm={() =>
                            remove.mutate(
                              { id: customerId, documentId: document.id },
                              {
                                onSuccess: () => message.success(tCustomers('documents.removed')),
                                onError: (err) => message.error(errorMessage(err)),
                              },
                            )
                          }
                        >
                          <Button danger icon={<DeleteOutlined />}>
                            {t('remove')}
                          </Button>
                        </Popconfirm>
                        <Button
                          icon={<EditOutlined />}
                          aria-label={t('editInfo')}
                          onClick={() => setEditing(document)}
                        />
                        {document.verifiedAt ? (
                          <Upload {...picker(key, type, document)}>
                            <Button loading={uploading.has(key)}>{t('replace')}</Button>
                          </Upload>
                        ) : (
                          <Dropdown
                            trigger={['click']}
                            disabled={verify.isPending}
                            menu={{
                              items: IDENTITY_VERIFY_METHOD_VALUES.map((method) => ({
                                key: method,
                                label: dl(
                                  'identityVerifyMethod',
                                  method,
                                  IDENTITY_VERIFY_METHOD_LABEL[method],
                                ),
                              })),
                              onClick: ({ key }) =>
                                verify.mutate(
                                  {
                                    id: customerId,
                                    documentId: document.id,
                                    input: { verifyMethod: key as IdentityVerifyMethod },
                                  },
                                  {
                                    onSuccess: () =>
                                      message.success(tCustomers('documents.verifyRecorded')),
                                    onError: (err) => message.error(errorMessage(err)),
                                  },
                                ),
                            }}
                          >
                            <Button type="primary" icon={<SafetyCertificateOutlined />}>
                              {t('verify')}
                            </Button>
                          </Dropdown>
                        )}
                      </>
                    ) : null}
                  </>
                ) : editable ? (
                  <Upload {...picker(key, type)}>
                    <Button icon={<PlusOutlined />} loading={uploading.has(key)}>
                      {t('upload')}
                    </Button>
                  </Upload>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </PreviewImageGroup>

      {editing ? (
        <DocumentInfoDialog
          key={editing.id}
          customerId={customerId}
          document={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}

/**
 * Sửa chủ thẻ / số / thời hạn của MỘT giấy tờ. Dựng có điều kiện (mỗi lần mở là state mới) nên
 * không bao giờ gửi số giấy tờ của bản trước cho bản sau.
 */
function DocumentInfoDialog({
  customerId,
  document,
  onClose,
}: {
  customerId: string;
  document: CustomerDocument;
  onClose: () => void;
}) {
  const t = useTranslations('Customers.profile.docs');
  const datePattern = useDatePickerPattern();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const update = useUpdateCustomerDocument();

  const [holderName, setHolderName] = useState(document.holderName ?? '');
  const [documentNumber, setDocumentNumber] = useState(document.documentNumber ?? '');
  const [expiresAt, setExpiresAt] = useState<string | null>(document.expiresAt ?? null);

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
      message.success(t('saved'));
      onClose();
    } catch (err) {
      message.error(errorMessage(err));
    }
  }

  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      size="sm"
      title={t('dialogEdit')}
      onOk={() => void submit()}
      okText={t('save')}
      confirmLoading={update.isPending}
    >
      <div className={styles.form}>
        <label className={styles.field}>
          <span>{t('holder')}</span>
          <Input
            value={holderName}
            maxLength={160}
            onChange={(e) => setHolderName(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>{t('number')}</span>
          <Input
            value={documentNumber}
            maxLength={60}
            onChange={(e) => setDocumentNumber(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>{t('expiry')}</span>
          <DatePicker
            value={expiresAt ? dayjs(expiresAt) : null}
            format={datePattern.date}
            onChange={(value) => setExpiresAt(value ? value.format(DAY_PARAM_FORMAT) : null)}
          />
        </label>
      </div>
    </ResponsiveDialog>
  );
}
