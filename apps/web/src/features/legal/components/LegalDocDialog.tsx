'use client';

import { ExportOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { CUSTOMER_APP_WEBVIEW_UA_TOKEN } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { LEGAL_EFFECTIVE_FROM, legalPath, type LegalDoc } from '@/constants/legal';
import { useAppFormat } from '@/i18n/use-app-format';
import { buildLegalDocView, legalSectionId } from '../legal-doc-model';
import { LegalDocBody } from './LegalDocBody';
import styles from './LegalDocDialog.module.css';

interface LegalDocDialogProps {
  readonly doc: LegalDoc;
  readonly open: boolean;
  readonly onClose: () => void;
}

/** Tiền tố neo của hộp xem nhanh — không trùng `id` với nội dung của trang đang đặt xe. */
const DIALOG_ID_PREFIX = 'legal-dialog-';

/**
 * Hộp XEM NHANH một văn bản pháp lý, mở ngay trong luồng đang dở (xem lại yêu cầu thuê, thanh
 * toán giữ chỗ, đăng ký, mua gói).
 *
 * Vì sao là popup chứ không chỉ là liên kết sang trang:
 *  - Người dùng đang giữa một biểu mẫu; trên điện thoại một tab mới làm họ lạc khỏi luồng, còn
 *    trong WebView của app thì tab mới mở ra trình duyệt ngoài.
 *  - Đây là lúc PHÁP LÝ cần nhất: người dùng được đọc trọn văn bản trước khi tick đồng ý
 *    (thông báo trước khi giao kết hợp đồng theo mẫu) mà không phải rời màn hình.
 *
 * Nội dung là TOÀN VĂN, cùng nguồn với trang `/legal/<doc>` (`buildLegalDocView` +
 * `LegalDocBody`) — không phải bản tóm tắt viết tay riêng, để popup không bao giờ hứa khác trang.
 * Chân hộp có lối "Mở trang đầy đủ" (tab mới) cho người muốn lưu, in hoặc gửi đường dẫn.
 *
 * Desktop: modal `lg`; mobile: toàn màn hình (quy tắc overlay của `ResponsiveDialog`).
 */
export function LegalDocDialog({ doc, open, onClose }: LegalDocDialogProps) {
  const t = useTranslations('Legal');
  const fmt = useAppFormat();

  /*
   * WebView của app khách dùng biến thể câu không nhắc gói. Hộp chỉ render sau một cú bấm (không
   * có trong HTML server), nên đọc User-Agent ở client không gây lệch hydrate.
   */
  const inApp =
    typeof navigator !== 'undefined' && navigator.userAgent.includes(CUSTOMER_APP_WEBVIEW_UA_TOKEN);

  const view = useMemo(
    () =>
      buildLegalDocView(
        { text: (key) => t(key as never) as string, has: (key) => t.has(key as never) },
        doc,
        { inApp, idPrefix: DIALOG_ID_PREFIX },
      ),
    [t, doc, inApp],
  );

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      size="lg"
      title={view.title}
      footer={
        <div className={styles.footer}>
          <a href={legalPath.doc(doc)} target="_blank" rel="noreferrer" className={styles.fullPage}>
            <ExportOutlined aria-hidden="true" />
            {t('meta.openFullPage')}
          </a>
          <Button onClick={onClose}>{t('meta.close')}</Button>
        </div>
      }
    >
      <div className={styles.content}>
        <p className={styles.lead}>{view.summary}</p>
        <p className={styles.meta}>
          {t('meta.effectiveFrom', { date: fmt.dateKey(LEGAL_EFFECTIVE_FROM) })}
        </p>
        <LegalDocBody
          view={view}
          entity={{
            id: legalSectionId(doc, 'entity', DIALOG_ID_PREFIX),
            heading: t('entity.heading'),
            body: t('entity.body'),
          }}
          headingLevel={3}
          variant="compact"
        />
      </div>
    </ResponsiveDialog>
  );
}
