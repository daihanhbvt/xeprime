'use client';

import { AndroidFilled, AppleFilled } from '@ant-design/icons';
import { QRCode } from 'antd';
import { useTranslations } from 'next-intl';
import { cx } from '@/lib/cx';
import { APP_DOWNLOAD_QR } from '../app-download';
import styles from './AppStoreQr.module.css';

/** Biểu tượng nền tảng của từng mã — khoá khớp `APP_DOWNLOAD_QR[].key`. */
const STORE_ICON = { ios: AppleFilled, android: AndroidFilled } as const;

/** Từ cỡ này trở lên mới có chỗ cho dòng "Tải trên" phía trên tên cửa hàng. */
const SIZE_WITH_CAPTION = 100;

export interface AppStoreQrProps {
  /** Cạnh của mã QR, tính bằng px. Dưới ~64px camera điện thoại bắt đầu bắt không ổn định. */
  readonly size?: number;
  /** `dark` cho chân trang nền tối, `light` cho trang nội dung nền sáng. */
  readonly tone?: 'dark' | 'light';
  readonly className?: string;
}

/**
 * Cụm hai mã QR tải ứng dụng — dùng ở CẢ chân trang lẫn trang `/app`.
 *
 * **Vì sao là component dùng chung.** Hai chỗ này hiện cùng hai mã, cùng tên cửa hàng, cùng câu
 * nhãn trợ năng. Để mỗi bên tự dựng nghĩa là khi app lên store thì phải nhớ sửa hai chỗ — và
 * chỗ quên sửa sẽ im lặng phát một mã dẫn về trang chủ.
 *
 * **Chữ lấy từ namespace `AppPromo`, không phải `Marketplace.footer`.** Nhãn trợ năng của một
 * mã QR thuộc về TÍNH NĂNG ứng dụng, không thuộc về cái chân trang tình cờ đang hiện nó — chép
 * nó sang bó message của chân trang là tạo bản dịch thứ hai cho cùng một câu.
 *
 * Nền của ô mã luôn TRẮNG, kể cả trên chân trang tối: mã QR cần module tối trên nền sáng, đảo
 * màu là hỏng mã trên phần lớn camera điện thoại. Chỉ phần chữ đổi theo `tone`.
 */
export function AppStoreQr({ size = 72, tone = 'dark', className }: AppStoreQrProps) {
  const t = useTranslations('AppPromo');
  const withCaption = size >= SIZE_WITH_CAPTION;

  return (
    <ul className={cx(styles.list, tone === 'light' && styles.light, className)}>
      {APP_DOWNLOAD_QR.map(({ key, store, value }) => {
        const Icon = STORE_ICON[key];
        return (
          <li key={key} className={styles.item}>
            {/*
              Nhãn trợ năng đặt ở thẻ BỌC chứ không truyền vào `<QRCode>`: AntD không cam kết
              chuyển tiếp thuộc tính lạ xuống phần tử gốc, và một mã QR không nhãn là một hình
              câm với trình đọc màn hình.
            */}
            <span className={styles.code} role="img" aria-label={t('download.qrAlt', { store })}>
              <QRCode value={value} size={size} type="svg" bordered={false} />
            </span>
            <span className={styles.store}>
              <Icon className={styles.storeIcon} aria-hidden="true" />
              <span className={styles.storeText}>
                {withCaption && <small>{t('download.downloadOn')}</small>}
                {store}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
