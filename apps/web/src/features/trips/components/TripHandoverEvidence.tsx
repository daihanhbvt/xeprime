'use client';

import { CameraOutlined, InfoCircleOutlined, PictureOutlined } from '@ant-design/icons';
import { Skeleton, Spin } from 'antd';
import { useState } from 'react';
import {
  handoverPhotoSlotsFor,
  HANDOVER_TYPE,
  type HandoverPhotoSlot,
  type HandoverType,
} from '@xeprime/types';
import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { dayjs } from '@/lib/datetime';
import { useTranslations } from 'next-intl';
import { photoKey, useTripHandoverEvidence, useTripHandoverPhotos } from '../hooks';
import type { CustomerTripHandoverEvidence } from '../types';
import styles from './TripHandoverEvidence.module.css';

/** Hai chiều theo thứ tự tab của bản vẽ: trước khi giao xe → sau khi nhận lại xe. */
const TABS: readonly HandoverType[] = [HANDOVER_TYPE.PICKUP, HANDOVER_TYPE.RETURN];

/**
 * "Thông tin bàn giao" của CHÍNH chuyến này — chỉ đọc (Figma `22036:80113`).
 *
 * Hai tab "Trước khi giao xe" (biên bản giao xe) · "Sau khi nhận xe" (biên bản nhận lại xe); tab
 * chưa có biên bản đã xác nhận thì khoá. Mỗi tab một hàng 5 ô cố định — trước · sau · trái · phải ·
 * Odo cho ô tô, xe máy chỉ trước · sau · Odo (`handoverPhotoSlotsFor`) — góc gian hàng không chụp
 * hiện ô giữ chỗ chứ không biến mất, để hai thời điểm luôn so được đúng từng góc. Ảnh hư hỏng chụp
 * thêm (nếu có) nằm sau năm ô đó.
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
 * ~2 phút, xin theo lô và tự làm mới trước khi hết hạn (`useTripHandoverPhotos`).
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
  const { data, isLoading, isError, error } = useTripHandoverEvidence(tripId, enabled);
  const records = data ?? [];
  const photos = useTripHandoverPhotos(tripId, records, enabled);
  const byType = new Map(records.map((r) => [r.type as HandoverType, r]));
  const [picked, setPicked] = useState<HandoverType | null>(null);
  // Tab mặc định: chiều MỚI NHẤT đã có biên bản (đã trả xe ⇒ "Sau khi nhận xe").
  const active =
    picked && byType.has(picked)
      ? picked
      : byType.has(HANDOVER_TYPE.RETURN)
        ? HANDOVER_TYPE.RETURN
        : HANDOVER_TYPE.PICKUP;

  if (!enabled) return null;

  return (
    <section className={styles.block} aria-labelledby="trip-handover-title">
      <h2 id="trip-handover-title" className={styles.title}>
        {t('title')}
      </h2>

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : isError ? (
        /*
          Lỗi tải KHÁC "không có biên bản". Nếu hai trường hợp cùng ra một khoảng trắng, khách đọc
          sự cố mạng thành "gian hàng không lưu bằng chứng nào" — sai hẳn nghĩa.
        */
        <EmptyState variant="error" title={t('errorTitle')} description={errorMessage(error)} />
      ) : records.length === 0 ? (
        <p className={styles.empty}>{t('empty')}</p>
      ) : (
        <>
          <div className={styles.tabs} role="tablist" aria-label={t('title')}>
            {TABS.map((type) => {
              const available = byType.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  role="tab"
                  aria-selected={active === type}
                  disabled={!available}
                  className={cx(styles.tab, active === type && styles.tabActive)}
                  onClick={() => setPicked(type)}
                >
                  {t(`tabs.${type}`)}
                </button>
              );
            })}
          </div>
          <HandoverRecord
            key={active}
            record={byType.get(active)!}
            photoUrls={photos.data ?? {}}
            photosLoading={photos.isFetching}
          />
          <p className={styles.disclaimer}>
            <InfoCircleOutlined aria-hidden="true" />
            <span>{t('disclaimer')}</span>
          </p>
        </>
      )}
    </section>
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
  const bySlot = new Map(record.photos.map((p) => [p.slot, p]));
  // Năm góc cố định trước, ảnh chụp thêm (slot lạ) sau — không làm mất tấm nào.
  // Bộ góc theo LOẠI XE: ô tô 5 góc, xe máy 3 góc (trước · sau · Odo).
  const baseSlots = handoverPhotoSlotsFor(record.vehicleType);
  const extraSlots = record.photos
    .map((p) => p.slot)
    .filter((slot) => !(baseSlots as readonly string[]).includes(slot));
  const slots: string[] = [...baseSlots, ...extraSlots];

  /*
   * Mốc GHI NHẬN chỉ hiện khi nó khác mốc THỰC TẾ — so ở mức PHÚT, đúng độ chính xác đang
   * hiển thị; so chuỗi ISO sẽ đẻ ra hai dòng in y hệt nhau khi xác nhận ngay tại quầy.
   */
  const recordedApart =
    Boolean(record.confirmedAt) &&
    Boolean(record.occurredAt) &&
    !dayjs(record.confirmedAt).isSame(dayjs(record.occurredAt), 'minute');

  return (
    <div className={styles.record}>
      <p className={styles.lead}>{t(`leads.${record.type}`)}</p>

      {/*
        Một trình xem cho MỖI biên bản: mũi tên chuyển ảnh chỉ chạy trong cùng một chiều bàn giao,
        không trộn ảnh lúc giao với ảnh lúc nhận.
      */}
      <PreviewImageGroup>
        <ul className={styles.photoGrid}>
          {slots.map((slot) => {
            const photo = bySlot.get(slot as HandoverPhotoSlot);
            const label = dl('handoverPhotoSlot', slot as HandoverPhotoSlot);
            const url = photo ? photoUrls[photoKey(record.type, slot)] : null;
            return (
              <li key={slot} className={styles.photo}>
                <span className={styles.thumb}>
                  {!photo ? (
                    // Góc gian hàng không chụp — ô giữ chỗ, không biến mất khỏi hàng.
                    <span className={styles.thumbEmpty} title={t('slotMissing')}>
                      <PictureOutlined aria-hidden="true" />
                    </span>
                  ) : url ? (
                    <PreviewImage
                      src={url}
                      alt={t('photoAlt', { slot: label })}
                      className={styles.thumbImage}
                      loading="lazy"
                    />
                  ) : photosLoading ? (
                    <Spin size="small" />
                  ) : (
                    <span className={styles.thumbFallback}>
                      <CameraOutlined aria-hidden="true" />
                      <span className={styles.thumbFallbackText}>{t('photoUnavailable')}</span>
                    </span>
                  )}
                </span>
                <span className={styles.photoLabel}>{label}</span>
                {/* Nhãn "bổ sung sau" đổi ý nghĩa của tấm ảnh — một dòng thật, không giấu. */}
                {photo?.addedAfterConfirmation ? (
                  <span className={styles.lateBadge} title={t('addedLateHint')}>
                    {t('addedLate')}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </PreviewImageGroup>

      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt>{t('occurredAt')}</dt>
          <dd>{fmt.dateTime(record.occurredAt)}</dd>
        </div>
        {recordedApart ? (
          <div className={styles.row}>
            <dt>{t('recordedAt')}</dt>
            <dd>{fmt.dateTime(record.confirmedAt)}</dd>
          </div>
        ) : null}
        <div className={styles.row}>
          <dt>{t('odometer')}</dt>
          {/* `null` là "chưa ghi nhận", KHÔNG phải 0. */}
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
    </div>
  );
}
