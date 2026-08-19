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
  type CustomerDocumentExpiry,
  type CustomerDocumentType,
} from '@xeprime/types';
import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DAY_PARAM_FORMAT, dayjs } from '@/lib/datetime';
import { fetchCustomerDocumentDownload } from '../api';
import { CUSTOMER_HINTS, DOCUMENT_TYPE_OPTIONS, isPreviewableImage } from '../constants';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import {
  useCustomerDocumentPreviews,
  useCustomerDocuments,
  useDeleteCustomerDocument,
  useUploadCustomerDocument,
} from '../hooks/use-customers';
import type { CustomerDocument } from '../types';
import styles from './CustomerDocumentsPanel.module.css';
import { useAppFormat, useDatePickerPattern } from '@/i18n/use-app-format';

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
  const fmt = useAppFormat();
  const datePattern = useDatePickerPattern();

  const { message } = App.useApp();
  const { data, isLoading, isError, refetch, isFetching } = useCustomerDocuments(customerId);
  const upload = useUploadCustomerDocument();
  const remove = useDeleteCustomerDocument();

  const [documentType, setDocumentType] = useState<string>(CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID);
  const [customTypeName, setCustomTypeName] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

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

  /** Mở PDF: xin signed URL NGAY LÚC BẤM rồi để trình duyệt render — không giữ URL ở đâu. */
  async function openDocument(document: CustomerDocument) {
    setOpening(document.id);
    try {
      const ticket = await fetchCustomerDocumentDownload(customerId, document.id);
      window.open(ticket.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setOpening(null);
    }
  }

  const items = data ?? [];
  // Ảnh thu nhỏ chỉ nạp cho người ĐƯỢC PHÉP mở tệp; thiếu quyền thì không request nào phát ra.
  const previewQ = useCustomerDocumentPreviews(customerId, items, canViewFiles);
  const previews = previewQ.data ?? {};

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
            format={datePattern.date}
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
        <PreviewImageGroup>
          <ul className={styles.list}>
            {items.map((document) => (
              <li key={document.id} className={styles.item}>
                {/*
                 * Ảnh thu nhỏ THẬT — bấm là phóng to toàn màn hình bằng đúng trình xem ảnh dùng
                 * chung của app (zoom / xoay / lật / đếm x-y), y như ảnh xe hay ảnh bàn giao.
                 * PDF không có thumbnail nên rơi về icon loại tệp + nút mở tab.
                 */}
                <span className={styles.thumb}>
                  {previews[document.id] ? (
                    <PreviewImage
                      src={previews[document.id] as string}
                      alt={document.originalName}
                      className={styles.thumbImage}
                    />
                  ) : isPreviewableImage(document.mimeType) ? (
                    <FileImageOutlined className={styles.thumbIcon} />
                  ) : (
                    <FilePdfOutlined className={styles.thumbIcon} />
                  )}
                </span>

                <div className={styles.itemMain}>
                  <div className={styles.itemTitle}>
                    {document.documentType === CUSTOMER_DOCUMENT_TYPE.OTHER &&
                    document.customTypeName
                      ? document.customTypeName
                      : (CUSTOMER_DOCUMENT_TYPE_LABEL[
                          document.documentType as CustomerDocumentType
                        ] ?? document.documentType)}
                  </div>
                  <div className={styles.itemMeta}>
                    {document.originalName} · {document.uploadedByName ?? 'Không rõ người tải'} ·{' '}
                    {fmt.date(document.createdAt)}
                  </div>
                </div>
                <div className={styles.itemTags}>
                  <StatusTag
                    value={document.expiryStatus as CustomerDocumentExpiry}
                    meta={CUSTOMER_DOCUMENT_EXPIRY_META}
                    group="customerDocumentExpiry"
                  />
                  {document.expiresAt ? <Tag>Hạn {fmt.date(document.expiresAt)}</Tag> : null}
                </div>
                <div className={styles.itemActions}>
                  {/*
                   * Ảnh đã có ô xem nhanh bấm-là-phóng-to, nên nút này chỉ còn cho PDF — thứ
                   * trình duyệt hiển thị tốt hơn bất cứ gì ta dựng trong modal.
                   */}
                  {canViewFiles && !isPreviewableImage(document.mimeType) ? (
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      loading={opening === document.id}
                      onClick={() => void openDocument(document)}
                    >
                      Mở tệp
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
        </PreviewImageGroup>
      ) : null}
    </section>
  );
}
