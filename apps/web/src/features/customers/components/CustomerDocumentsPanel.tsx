'use client';

import {
  DeleteOutlined,
  EyeOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  DatePicker,
  Empty,
  Image,
  Input,
  Popconfirm,
  Result,
  Select,
  Skeleton,
  Tag,
  Upload,
} from 'antd';
import { useState } from 'react';
import {
  API_ERROR_CODE,
  CUSTOMER_DOCUMENT_EXPIRY_META,
  CUSTOMER_DOCUMENT_TYPE,
  CUSTOMER_DOCUMENT_TYPE_LABEL,
  DOCUMENT_UPLOAD_MIME_TYPES,
  IMAGE_UPLOAD_MIME_TYPES,
  type CustomerDocumentExpiry,
  type CustomerDocumentType,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DAY_PARAM_FORMAT, DATE_FORMAT, dayjs, formatDate } from '@/lib/datetime';
import { fetchCustomerDocumentDownload } from '../api';
import { CUSTOMER_HINTS, DOCUMENT_TYPE_OPTIONS } from '../constants';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import {
  useCustomerDocuments,
  useDeleteCustomerDocument,
  useUploadCustomerDocument,
} from '../hooks/use-customers';
import type { CustomerDocument } from '../types';
import styles from './CustomerDocumentsPanel.module.css';

const ACCEPT = DOCUMENT_UPLOAD_MIME_TYPES.join(',');

/**
 * Giấy tờ tuỳ thân của khách (CCCD / GPLX).
 *
 * Ba nguyên tắc nhìn thấy được trên bề mặt này:
 *  - **Không có URL nào sống lâu.** Bấm "Mở tệp" mới xin một link ký ngắn hạn; link đó không
 *    vào state, không vào cache, và chỉ mở được nếu người dùng có quyền xem tệp.
 *  - **Thấy trạng thái ≠ mở được tệp.** Nhân viên quầy biết khách đã có CCCD hay chưa mà không
 *    đương nhiên mở được kho ảnh giấy tờ của mọi khách cũ.
 *  - **Hỏng thì thử lại được.** Upload đứt giữa chừng không để lại gì trong danh sách; chọn lại
 *    tệp là xong (server chỉ nhận file đã xác minh nội dung).
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
  const { message } = App.useApp();
  const { data, isLoading, isError, refetch, isFetching } = useCustomerDocuments(customerId);
  const upload = useUploadCustomerDocument();
  const remove = useDeleteCustomerDocument();

  const [documentType, setDocumentType] = useState<string>(CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID);
  const [customTypeName, setCustomTypeName] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  /** URL ký đang xem toàn màn hình — đóng trình xem là quên luôn, không cache ở đâu. */
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const isOtherType = documentType === CUSTOMER_DOCUMENT_TYPE.OTHER;

  async function handleUpload(file: File) {
    try {
      await upload.mutateAsync({
        id: customerId,
        input: {
          documentType,
          // Nhãn tự đặt chỉ có nghĩa với loại "khác" — gửi kèm loại khác sẽ bị CHECK của DB từ chối.
          customTypeName: isOtherType ? customTypeName.trim() || null : null,
          expiresAt,
          file,
        },
      });
      message.success('Đã tải giấy tờ lên kho riêng tư');
      setExpiresAt(null);
      setCustomTypeName('');
    } catch (err) {
      message.error(
        getErrorCode(err) === API_ERROR_CODE.UPLOADS_NOT_CONFIGURED
          ? 'Kho tài liệu riêng tư chưa được cấu hình — liên hệ quản trị hệ thống'
          : getErrorMessage(err),
      );
    }
  }

  /**
   * Mở giấy tờ: xin signed URL NGAY LÚC BẤM, không giữ URL nào trong state ngoài phiên xem
   * đang mở (cùng kỷ luật `HandoverPhotoGrid`/`FileListField` — URL ký sống ~2 phút và chính
   * nó là quyền truy cập file).
   *
   * Ảnh xem NGAY TRONG APP bằng trình xem toàn màn hình (zoom/xoay) thay vì bật tab mới — đúng
   * việc nhân viên đang làm: liếc CCCD để đối chiếu với người đang đứng trước mặt, rồi quay lại
   * hồ sơ. PDF thì trình duyệt vẫn xử lý tốt hơn, nên vẫn mở tab.
   */
  async function openDocument(document: CustomerDocument) {
    setOpening(document.id);
    try {
      const ticket = await fetchCustomerDocumentDownload(customerId, document.id);
      if (isImage(document.mimeType)) setViewerUrl(ticket.downloadUrl);
      else window.open(ticket.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setOpening(null);
    }
  }

  const items = data ?? [];

  return (
    <section className={styles.panel}>
      <p className={styles.hint}>{CUSTOMER_HINTS.documents}</p>

      {canManage && !disabled ? (
        <div className={styles.uploader}>
          <Select
            className={styles.typeSelect}
            value={documentType}
            options={DOCUMENT_TYPE_OPTIONS}
            onChange={setDocumentType}
            aria-label="Loại giấy tờ"
          />
          {isOtherType ? (
            <Input
              className={styles.customName}
              value={customTypeName}
              onChange={(event) => setCustomTypeName(event.target.value)}
              maxLength={160}
              placeholder="Tên giấy tờ (ví dụ: Hộ chiếu)"
              aria-label="Tên giấy tờ khác"
            />
          ) : null}
          <DatePicker
            className={styles.expiry}
            format={DATE_FORMAT}
            placeholder="Hạn giấy tờ (không bắt buộc)"
            value={expiresAt ? dayjs(expiresAt, DAY_PARAM_FORMAT) : null}
            onChange={(value) => setExpiresAt(value ? value.format(DAY_PARAM_FORMAT) : null)}
          />
          <Upload
            accept={ACCEPT}
            showUploadList={false}
            beforeUpload={(file) => {
              void handleUpload(file as unknown as File);
              return false; // flow presign → PUT → complete tự lo, không dùng upload mặc định
            }}
          >
            <Button icon={<UploadOutlined />} loading={upload.isPending}>
              Tải giấy tờ lên
            </Button>
          </Upload>
        </div>
      ) : null}

      {isLoading ? <Skeleton active paragraph={{ rows: 2 }} /> : null}

      {isError && !data ? (
        <Result
          status="warning"
          title="Không tải được danh sách giấy tờ"
          extra={
            <Button onClick={() => void refetch()} loading={isFetching}>
              Thử lại
            </Button>
          }
        />
      ) : null}

      {!isLoading && !isError && items.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Chưa có giấy tờ nào của khách này"
        />
      ) : null}

      {items.length > 0 ? (
        <ul className={styles.list}>
          {items.map((document) => (
            <li key={document.id} className={styles.item}>
              {/*
               * Ô xem nhanh: nhận ra ngay đây là CCCD hay GPLX mà không phải đọc tên tệp, và
               * bấm một cái là mở ảnh lớn. Ô CHƯA nạp ảnh sẵn — ảnh chỉ tải khi người dùng bấm,
               * vì signed URL là quyền truy cập file và mỗi lần phát đều ghi nhật ký; nạp ngầm
               * cho mọi khách vừa làm nhoè nhật ký "ai đã xem giấy tờ của ai", vừa phát URL cho
               * cả những hồ sơ không ai định mở.
               */}
              <button
                type="button"
                className={styles.thumb}
                disabled={!canViewFiles || opening === document.id}
                aria-label={
                  canViewFiles ? `Xem ${document.originalName}` : 'Bạn chưa có quyền mở tệp giấy tờ'
                }
                onClick={() => void openDocument(document)}
              >
                {isImage(document.mimeType) ? <FileImageOutlined /> : <FilePdfOutlined />}
                <span className={styles.thumbHint}>{canViewFiles ? 'Xem' : 'Khoá'}</span>
              </button>

              <div className={styles.itemMain}>
                <div className={styles.itemTitle}>
                  {document.documentType === CUSTOMER_DOCUMENT_TYPE.OTHER && document.customTypeName
                    ? document.customTypeName
                    : (CUSTOMER_DOCUMENT_TYPE_LABEL[
                        document.documentType as CustomerDocumentType
                      ] ?? document.documentType)}
                </div>
                <div className={styles.itemMeta}>
                  {document.originalName} · {document.uploadedByName ?? 'Không rõ người tải'} ·{' '}
                  {formatDate(document.createdAt)}
                </div>
              </div>
              <div className={styles.itemTags}>
                <StatusTag
                  value={document.expiryStatus as CustomerDocumentExpiry}
                  meta={CUSTOMER_DOCUMENT_EXPIRY_META}
                />
                {document.expiresAt ? <Tag>Hạn {formatDate(document.expiresAt)}</Tag> : null}
              </div>
              <div className={styles.itemActions}>
                {canViewFiles ? (
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    loading={opening === document.id}
                    onClick={() => void openDocument(document)}
                  >
                    {isImage(document.mimeType) ? 'Xem ảnh' : 'Mở tệp'}
                  </Button>
                ) : null}
                {canManage && !disabled ? (
                  <Popconfirm
                    title="Gỡ giấy tờ này khỏi hồ sơ khách?"
                    okText="Gỡ"
                    cancelText="Đóng"
                    onConfirm={() =>
                      remove.mutate(
                        { id: customerId, documentId: document.id },
                        {
                          onSuccess: () => message.success('Đã gỡ giấy tờ'),
                          onError: (err) => message.error(getErrorMessage(err)),
                        },
                      )
                    }
                  >
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`Gỡ ${document.originalName}`}
                    />
                  </Popconfirm>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {/*
       * Ảnh neo ẨN cho trình xem điều khiển bằng state — cùng cách với `HandoverPhotoGrid`:
       * nút "Xem" chỉ việc đặt URL ký, đóng trình xem là quên luôn URL đó.
       */}
      {viewerUrl ? (
        <Image
          src={viewerUrl}
          alt=""
          rootClassName={styles.hiddenViewerAnchor}
          preview={{
            visible: true,
            onVisibleChange: (open) => {
              if (!open) setViewerUrl(null);
            },
          }}
        />
      ) : null}
    </section>
  );
}

/** Chỉ ảnh mới xem được bằng trình xem trong app; PDF để trình duyệt lo. */
function isImage(mimeType: string): boolean {
  return (IMAGE_UPLOAD_MIME_TYPES as readonly string[]).includes(mimeType);
}
