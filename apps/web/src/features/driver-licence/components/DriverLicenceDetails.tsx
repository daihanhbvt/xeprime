'use client';

import { CarOutlined, EyeOutlined } from '@ant-design/icons';
import { App, Button, Image } from 'antd';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { DRIVER_LICENCE_KIND } from '@xeprime/types';
import { useState } from 'react';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { fetchDriverLicenceImage } from '../api';
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

  const rows: Array<{ key: string; label: string; value: string | null }> = [
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
    },
  ];

  return (
    <div className={styles.details}>
      <dl className={styles.facts}>
        {rows
          .filter((row) => row.value)
          .map((row) => (
            <div key={row.key} className={styles.fact}>
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
      <LicenceImageButton licenceId={licence.id} />
    </div>
  );
}

/**
 * Mở ảnh đã nộp. URL ký sống 120 giây nên chỉ xin LÚC BẤM, không xin sẵn khi trang mở — phần
 * lớn người dùng không bao giờ bấm, và một URL xin sẵn sẽ hết hạn trước khi họ kịp bấm.
 */
function LicenceImageButton({ licenceId }: { licenceId: string }) {
  const t = useTranslations('DriverLicence.image');
  const { message } = App.useApp();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function open() {
    if (loading) return;
    setLoading(true);
    try {
      setUrl((await fetchDriverLicenceImage(licenceId)).url);
    } catch {
      void message.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="link"
        size="small"
        icon={<EyeOutlined aria-hidden="true" />}
        loading={loading}
        onClick={() => void open()}
        className={styles.imageButton}
      >
        {t('view')}
      </Button>
      {url ? (
        <Image
          src={url}
          alt={t('alt')}
          classNames={{ root: styles.hiddenPreviewAnchor }}
          preview={{
            open: true,
            onOpenChange: (next) => {
              if (!next) setUrl(null);
            },
          }}
        />
      ) : null}
    </>
  );
}
