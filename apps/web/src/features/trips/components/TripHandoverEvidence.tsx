'use client';

import { CameraOutlined, ClockCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Collapse, Skeleton, Spin } from 'antd';
import { useState } from 'react';
import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { dayjs } from '@/lib/datetime';
import { useTranslations } from 'next-intl';
import { photoKey, useTripHandoverEvidence, useTripHandoverPhotos } from '../hooks';
import type { CustomerTripHandoverEvidence } from '../types';
import styles from './TripHandoverEvidence.module.css';

/**
 * Bằng chứng bàn giao của CHÍNH chuyến này — chỉ đọc.
 *
 * **Thu gọn sẵn.** Đây là hồ sơ để ĐỐI CHIẾU khi có chuyện, không phải thứ khách mở trang ra để
 * xem; bung sẵn thì nó đẩy phần tiền và các nút hỗ trợ xuống dưới màn hình ở mọi chuyến đã xong.
 * Đóng lại cũng là thứ khiến việc nạp ảnh trở nên rẻ: chưa mở thì không request nào phát ra.
 *
 * Ba điều khối này phải trung thực:
 *
 *  - **Không bịa số.** Thiếu chỉ số Odo thì nói thẳng là chưa ghi nhận; hiển thị `0 km` ở đó là
 *    dựng ra một con số đồng hồ chưa ai từng đọc (design 14 §7).
 *  - **Không bịa thời điểm.** Ảnh đính sau lúc gian hàng xác nhận mang nhãn riêng, vì một tấm
 *    chụp ba ngày sau không phải bằng chứng hiện trạng lúc bàn giao. Mốc ghi nhận chỉ hiện khi
 *    nó KHÁC mốc thực tế — trùng phút thì thêm một dòng nữa chỉ là nhiễu.
 *  - **Không đứng giữa.** Câu ghi chú cuối khối nói rõ đây là bản ghi của gian hàng và lối đi
 *    khi có khác biệt là liên hệ trực tiếp gian hàng (ADR 0014 — nền tảng không phân xử).
 *
 * Ảnh nằm trong kho RIÊNG TƯ nên không có URL công khai: mỗi ô thu nhỏ chạy bằng một vé ký sống
 * ~2 phút, xin theo lô lúc mở khối và tự làm mới trước khi hết hạn (`useTripHandoverPhotos`).
 * Bấm vào là phóng to bằng đúng trình xem ảnh dùng chung của app.
 */
export function TripHandoverEvidence({
  tripId,
  enabled,
}: {
  tripId: string;
  /** Chuyến đã thật sự có mốc bàn giao chưa — chưa thì không dựng gì cả. */
  enabled: boolean;
}) {
  const t = useTranslations('Trips.evidence');
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);

  // Mở khối mới là lúc dữ liệu đáng nạp: đóng thì `enabled` false và query đứng yên.
  const active = enabled && open;
  const { data, isLoading, isError, error } = useTripHandoverEvidence(tripId, active);
  const records = data ?? [];
  const photos = useTripHandoverPhotos(tripId, records, active);

  if (!enabled) return null;

  return (
    <Collapse
      ghost
      className={styles.block}
      activeKey={open ? [PANEL_KEY] : []}
      onChange={(keys) => setOpen(keys.length > 0)}
      items={[
        {
          key: PANEL_KEY,
          label: (
            <span className={styles.header}>
              <span className={styles.title}>{t('title')}</span>
              {/* Phụ đề nằm ở HEADER: khách biết bên trong có gì mà không phải mở ra xem. */}
              <span className={styles.lead}>{t('lead')}</span>
            </span>
          ),
          children: (
            <div className={styles.body}>
              <PanelBody
                records={records}
                isLoading={isLoading}
                isError={isError}
                errorText={isError ? errorMessage(error) : ''}
                photoUrls={photos.data ?? {}}
                photosLoading={photos.isFetching}
              />
            </div>
          ),
        },
      ]}
    />
  );
}

const PANEL_KEY = 'evidence';

function PanelBody({
  records,
  isLoading,
  isError,
  errorText,
  photoUrls,
  photosLoading,
}: {
  records: CustomerTripHandoverEvidence[];
  isLoading: boolean;
  isError: boolean;
  errorText: string;
  photoUrls: Record<string, string | null>;
  photosLoading: boolean;
}) {
  const t = useTranslations('Trips.evidence');

  if (isLoading) return <Skeleton active paragraph={{ rows: 4 }} />;

  /*
   * Lỗi tải KHÁC "không có biên bản". Nếu hai trường hợp cùng ra một khoảng trắng, khách đọc
   * sự cố mạng thành "gian hàng không lưu bằng chứng nào" — sai hẳn nghĩa, đúng lúc họ cần
   * đối chiếu nhất.
   */
  if (isError)
    return <EmptyState variant="error" title={t('errorTitle')} description={errorText} />;

  if (records.length === 0) return <p className={styles.empty}>{t('empty')}</p>;

  return (
    <>
      {records.map((record) => (
        <HandoverRecord
          key={record.type}
          record={record}
          photoUrls={photoUrls}
          photosLoading={photosLoading}
        />
      ))}
      <p className={styles.disclaimer}>
        <InfoCircleOutlined aria-hidden="true" />
        <span>{t('disclaimer')}</span>
      </p>
    </>
  );
}

function HandoverRecord({
  record,
  photoUrls,
  photosLoading,
}: {
  record: CustomerTripHandoverEvidence;
  photoUrls: Record<string, string | null>;
  photosLoading: boolean;
}) {
  const t = useTranslations('Trips.evidence');
  const dl = useDomainLabel();
  const fmt = useAppFormat();

  /*
   * Mốc GHI NHẬN chỉ hiện khi nó khác mốc THỰC TẾ — so ở mức PHÚT, đúng độ chính xác đang
   * hiển thị. So bằng chuỗi ISO sẽ đẻ ra hai dòng in y hệt nhau khi nhân viên bấm xác nhận
   * ngay tại quầy (lệch vài giây), tức là thêm nhiễu chứ không thêm thông tin.
   */
  const recordedApart =
    Boolean(record.confirmedAt) &&
    Boolean(record.occurredAt) &&
    !dayjs(record.confirmedAt).isSame(dayjs(record.occurredAt), 'minute');

  return (
    <article className={styles.record}>
      <header className={styles.recordHead}>
        <span className={styles.recordType}>{dl('handoverType', record.type)}</span>
        <span className={styles.recordTime}>
          <ClockCircleOutlined aria-hidden="true" /> {fmt.dateTime(record.occurredAt)}
        </span>
      </header>

      <dl className={styles.rows}>
        {recordedApart ? (
          <div className={styles.row}>
            <dt>{t('recordedAt')}</dt>
            <dd>{fmt.dateTime(record.confirmedAt)}</dd>
          </div>
        ) : null}
        <div className={styles.row}>
          <dt>{t('odometer')}</dt>
          {/*
            `null` là "chưa ghi nhận", KHÔNG phải 0. Câu riêng ở đây thay vì để `fmt.km(null)`
            rơi về "Chưa có" chung: khách cần biết chính xác là số này chưa được đọc, không
            phải là màn hình đang thiếu dữ liệu.
          */}
          <dd className={record.odometerMissing ? styles.missing : undefined}>
            {record.odometerMissing ? t('odometerMissing') : fmt.km(record.odometerKm)}
          </dd>
        </div>
        {record.condition ? (
          <div className={styles.row}>
            <dt>{t('condition')}</dt>
            <dd>{dl('handoverCondition', record.condition)}</dd>
          </div>
        ) : null}
      </dl>

      {record.photos.length === 0 ? (
        <p className={styles.noPhotos}>{t('noPhotos')}</p>
      ) : (
        /*
          Một trình xem cho MỖI biên bản, không phải một cho cả khối: mũi tên chuyển ảnh khi đó
          chỉ chạy trong cùng một chiều bàn giao. Trộn ảnh lúc giao với ảnh lúc nhận vào chung
          một chùm là cách chắc chắn để khách so nhầm hai thời điểm với nhau.
        */
        <PreviewImageGroup>
          <ul className={styles.photoGrid}>
            {record.photos.map((photo) => {
              const label = dl('handoverPhotoSlot', photo.slot);
              const url = photoUrls[photoKey(record.type, photo.slot)];
              return (
                <li key={photo.slot} className={styles.photo}>
                  <span className={styles.thumb}>
                    {url ? (
                      <PreviewImage
                        src={url}
                        alt={t('photoAlt', { slot: label })}
                        className={styles.thumbImage}
                        loading="lazy"
                      />
                    ) : photosLoading ? (
                      <Spin size="small" />
                    ) : (
                      // Vé ký hỏng riêng ô này — nói thẳng là không mở được, không để ô trống
                      // trông như "gian hàng không chụp góc này".
                      <span className={styles.thumbFallback}>
                        <CameraOutlined aria-hidden="true" />
                        <span className={styles.thumbFallbackText}>{t('photoUnavailable')}</span>
                      </span>
                    )}
                  </span>
                  <span className={styles.photoLabel}>{label}</span>
                  <span className={styles.photoMeta}>
                    {t('uploadedAt', { time: fmt.dateTime(photo.uploadedAt) })}
                  </span>
                  {/*
                    Nhãn "bổ sung sau" thay đổi ý nghĩa của tấm ảnh bên trên, nên nó là một dòng
                    thật dưới ô — không thu vào biểu tượng nhỏ, không giấu sau hover.
                  */}
                  {photo.addedAfterConfirmation ? (
                    <span className={styles.lateBadge} title={t('addedLateHint')}>
                      {t('addedLate')}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </PreviewImageGroup>
      )}
    </article>
  );
}
