'use client';

import {
  CarOutlined,
  EyeOutlined,
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Image } from 'antd';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { DRIVER_LICENCE_KIND } from '@xeprime/types';
import { useState } from 'react';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { useDriverLicenceImage } from '../hooks/use-driver-licence';
import type { DriverLicence } from '../types';
import styles from './DriverLicenceVerifier.module.css';

/**
 * Thông tin ĐÃ CHỐT trên một bằng lái — họ tên, số, hạng, hạn, lái được gì. Hiện cho chính chủ
 * tài khoản đối chiếu với tấm bằng trong ví: đọc sai chỗ nào thì họ thấy ngay và nộp lại.
 */
export function DriverLicenceDetails({ licence }: { licence: DriverLicence }) {
  const t = useTranslations('DriverLicence');
  const fmt = useAppFormat();
  const dl = useDomainLabel();

  const drives = [
    licence.coversCar ? t('fields.car') : null,
    licence.coversMotorbike ? t('fields.motorbike') : null,
  ].filter(Boolean);

  const rows: Array<{ key: string; label: string; value: string | null; wide?: boolean }> = [
    { key: 'name', label: t('fields.fullName'), value: licence.fullName },
    { key: 'number', label: t('fields.number'), value: licence.licenceNumber },
    { key: 'classes', label: t('fields.classes'), value: licence.classes.join(', ') || null },
    {
      key: 'expires',
      label: t('fields.expiresOn'),
      value: licence.noExpiry
        ? t('fields.noExpiry')
        : licence.expiresOn
          ? fmt.dateKey(licence.expiresOn)
          : null,
    },
    {
      key: 'kind',
      label: t('fields.kind'),
      value: licence.kind ? dl('driverLicenceKind', licence.kind) : null,
      wide: true,
    },
  ];

  return (
    <div className={styles.details}>
      <LicencePhoto licenceId={licence.id} />
      <div className={styles.detailsBody}>
        <dl className={styles.facts}>
          {rows
            .filter((row) => row.value)
            .map((row) => (
              <div key={row.key} className={cx(styles.fact, row.wide && styles.factWide)}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
        </dl>
        {drives.length > 0 ? (
          <p className={styles.drives}>
            <CarOutlined aria-hidden="true" />
            <span>
              {t('fields.drives')}: <strong>{drives.join(LIST_SEPARATOR)}</strong>
            </span>
          </p>
        ) : null}
        {/* Bằng nước ngoài: máy chỉ nhận dạng, không đọc hạng/hạn — nói thẳng ai sẽ kiểm (ADR 0057). */}
        {licence.kind && licence.kind !== DRIVER_LICENCE_KIND.VN ? (
          <p className={styles.drives}>{t('fields.foreignNote')}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Ảnh bằng đã nộp trong một khung dáng tấm thẻ, LÀM MỜ: chủ tài khoản nhận ra đúng tấm bằng của
 * mình mà người đứng cạnh không đọc được số bằng. Bấm vào mới mở trình xem rõ nét.
 *
 * Trình xem là `Image.PreviewGroup` với `items` — chỉ cổng toàn màn hình, không sinh thêm một
 * `<img>` nào trong trang (ảnh "neo" ẩn bằng class trước đây lộ ra dưới nền hộp xem vì CSS-in-JS
 * của AntD nạp sau và thắng `display: none`).
 *
 * URL ký sống 120 giây; cache giữ 90 giây. Ảnh mờ đã nằm trong `<img>` nên không sao, nhưng mở
 * trình xem bằng một URL đã hết hạn sẽ ra ảnh vỡ — nên lúc bấm, URL đã cũ thì xin lại rồi mới mở.
 */
function LicencePhoto({ licenceId }: { licenceId: string }) {
  const t = useTranslations('DriverLicence.image');
  const image = useDriverLicenceImage(licenceId);
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  // URL mà `<img>` báo không tải được — gắn với chính URL đó, nên URL mới tự xoá trạng thái lỗi.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  const url = image.data?.url ?? null;
  const failed = image.isError || (url !== null && url === brokenUrl);
  const busy = image.isPending || opening;

  async function reveal() {
    if (busy) return;
    if (failed) {
      setBrokenUrl(null);
      void image.refetch();
      return;
    }
    if (!image.isStale) {
      setOpen(true);
      return;
    }
    setOpening(true);
    const fresh = await image.refetch();
    setOpening(false);
    // Xin lại hỏng: khung tự chuyển sang trạng thái lỗi, không mở một trình xem trống.
    if (fresh.isSuccess) setOpen(true);
  }

  const pill = busy
    ? { icon: <LoadingOutlined />, label: null }
    : failed
      ? { icon: <ReloadOutlined />, label: t('retry') }
      : { icon: <EyeOutlined />, label: t('view') };

  return (
    <>
      <button
        type="button"
        className={cx(styles.photo, failed && styles.photoFailed)}
        onClick={() => void reveal()}
        aria-busy={busy}
        aria-label={failed ? t('retryLabel') : t('viewLabel')}
      >
        {url && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL ký ngắn hạn của kho riêng tư, không qua next/image
          <img
            src={url}
            alt=""
            className={styles.photoImage}
            onError={() => setBrokenUrl(url)}
          />
        ) : null}
        <span className={styles.photoCover} aria-hidden="true">
          {failed ? <span className={styles.photoNote}>{t('loadFailed')}</span> : null}
          <span className={styles.photoPill}>
            {pill.icon}
            {pill.label ? <span>{pill.label}</span> : null}
          </span>
        </span>
      </button>
      {url ? (
        <Image.PreviewGroup
          items={[{ src: url, alt: t('alt') }]}
          preview={{ open, onOpenChange: setOpen }}
        />
      ) : null}
    </>
  );
}
