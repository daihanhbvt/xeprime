'use client';

import { Empty, Tag, Timeline } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { APPROVAL_ACTION, type ApprovalAction } from '@xeprime/types';
import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { pickupAddress } from '../review-rows';
import type { VehicleApprovalDetail } from '../types';
import styles from './VehicleApprovalDrawer.module.css';

/**
 * Thư viện ảnh — TOÀN BỘ ảnh trong snapshot lúc gửi, ảnh đại diện lớn đứng đầu.
 *
 * Mọi tấm (kể cả thumbnail) nằm trong CÙNG một nhóm xem trước, nên bấm tấm nào cũng mở trình xem
 * đúng tấm đó và lướt được qua cả bộ. Cổng gửi duyệt đòi ≥4 ảnh khác nhau; người duyệt phải thấy
 * được cả bộ để đối chiếu "đúng xe không, đủ góc không, có ảnh mạng không".
 */
export function ReviewGallery({ vehicle }: { vehicle: VehicleApprovalDetail['vehicle'] }) {
  const t = useTranslations('Approvals.gallery');
  const images = vehicle.images;

  if (images.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('empty')} />;
  }

  const [cover, ...rest] = images;
  return (
    <PreviewImageGroup>
      <div className={styles.gallery}>
        <figure className={styles.galleryCover}>
          <PreviewImage
            src={cover!}
            alt={t('imageAlt', { index: 1, name: vehicle.name })}
            className={styles.galleryCoverImage}
          />
          <figcaption className={styles.galleryCaption}>
            {t('main')} · {t('count', { count: images.length })}
          </figcaption>
        </figure>
        {rest.length > 0 ? (
          <ul className={styles.galleryThumbs}>
            {rest.map((src, index) => (
              <li key={src}>
                <PreviewImage
                  src={src}
                  loading="lazy"
                  alt={t('imageAlt', { index: index + 2, name: vehicle.name })}
                  className={styles.galleryThumb}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </PreviewImageGroup>
  );
}

/**
 * Điểm nhận xe + nguồn đăng + con người.
 *
 * BA khái niệm tách bạch, vì chúng khác nhau thật: NGUỒN ĐĂNG là mặt tiền (gian hàng hay cá nhân,
 * chụp lúc gửi), CHỦ XE là tài khoản sở hữu gian hàng, NGƯỜI GỬI là người đã bấm nút — có thể là
 * nhân viên. Gộp chúng lại thì người duyệt gọi nhầm người khi cần xác minh.
 */
export function ReviewPickupSource({ detail }: { detail: VehicleApprovalDetail }) {
  const t = useTranslations('Approvals');
  const domainLabel = useDomainLabel();
  const { pickup, source, owner, submitter } = detail;
  const address = pickupAddress(pickup);
  const submittedByOwner = owner?.id === submitter.id;

  return (
    <div className={styles.split}>
      <dl className={styles.grid}>
        {pickup ? (
          <>
            <Field label={t('pickup.branch')}>{pickup.branchName}</Field>
            {address ? <Field label={t('pickup.address')}>{address}</Field> : null}
          </>
        ) : (
          <Field label={t('pickup.branch')}>
            <span className={styles.muted}>{t('pickup.none')}</span>
          </Field>
        )}
      </dl>

      <dl className={styles.grid}>
        <Field label={t('people.sourceKind')}>
          {domainLabel('storefrontKind', source.storefrontKind)}
        </Field>
        <Field label={t('people.sourceName')}>{source.name}</Field>
        {owner ? (
          <Field label={t('people.owner')}>
            <Person person={owner} />
          </Field>
        ) : null}
        <Field label={t('people.submitter')}>
          {submittedByOwner ? (
            <span className={styles.muted}>{t('people.sameAsOwner')}</span>
          ) : (
            <Person person={submitter} />
          )}
        </Field>
      </dl>
    </div>
  );
}

function Person({ person }: { person: NonNullable<VehicleApprovalDetail['owner']> }) {
  const t = useTranslations('Approvals.people');
  return (
    <span className={styles.person}>
      <span>{person.name}</span>
      {person.phone ? (
        <span className={styles.caption}>
          {t('phone')}: <a href={`tel:${person.phone}`}>{person.phone}</a>
        </span>
      ) : null}
      {person.email ? (
        <span className={styles.caption}>
          {t('email')}: <a href={`mailto:${person.email}`}>{person.email}</a>
        </span>
      ) : null}
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.gridItem}>
      <dt className={styles.gridLabel}>{label}</dt>
      <dd className={styles.gridValue}>{children}</dd>
    </div>
  );
}

/**
 * Tiện nghi theo NHÃN, không bao giờ khoá kỹ thuật: nhãn đã dịch của `Domain.vehicleFeature` trước,
 * rơi về nhãn danh mục do admin đặt cho khoá mới thêm sau.
 */
export function ReviewFeatures({ vehicle }: { vehicle: VehicleApprovalDetail['vehicle'] }) {
  const t = useTranslations('Approvals.features');
  const domainLabel = useDomainLabel();
  const { featureLabel } = useCatalogLabels();

  return (
    <div className={styles.stack}>
      <section aria-label={t('list')}>
        <h4 className={styles.subheading}>{t('list')}</h4>
        {vehicle.features.length > 0 ? (
          <ul className={styles.tagList}>
            {vehicle.features.map((key) => (
              <li key={key}>
                <Tag>{domainLabel('vehicleFeature', key, featureLabel(key))}</Tag>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>{t('none')}</p>
        )}
      </section>
      <section aria-label={t('description')}>
        <h4 className={styles.subheading}>{t('description')}</h4>
        {vehicle.description ? (
          <p className={styles.prose}>{vehicle.description}</p>
        ) : (
          <p className={styles.muted}>{t('noDescription')}</p>
        )}
      </section>
    </div>
  );
}

/** Màu trên trục thời gian — kèm CHỮ hành động, màu không bao giờ là tín hiệu duy nhất. */
const ACTION_COLOR: Record<ApprovalAction, string> = {
  [APPROVAL_ACTION.SUBMIT]: 'blue',
  [APPROVAL_ACTION.RESUBMIT]: 'blue',
  [APPROVAL_ACTION.APPROVE]: 'green',
  [APPROVAL_ACTION.REJECT]: 'red',
  [APPROVAL_ACTION.REQUEST_REVISION]: 'orange',
  [APPROVAL_ACTION.CANCEL]: 'gray',
  /*
   * Chủ xe sửa hồ sơ giữa chừng — `orange` như "yêu cầu bổ sung", không phải `blue` như lượt
   * gửi: cả hai đều là mốc mà thứ người duyệt đã đọc không còn dùng được, và ở mốc này các tick
   * trong danh mục kiểm tra vừa bị đặt lại.
   */
  [APPROVAL_ACTION.PROFILE_UPDATED]: 'orange',
};

export function ReviewHistory({ logs }: { logs: VehicleApprovalDetail['logs'] }) {
  const t = useTranslations('Approvals.history');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  if (logs.length === 0) return <p className={styles.muted}>{t('empty')}</p>;

  return (
    <Timeline
      className={styles.timeline}
      items={logs.map((log, index) => ({
        key: `${log.createdAt}-${index}`,
        color: ACTION_COLOR[log.action as ApprovalAction] ?? 'gray',
        content: (
          <div className={styles.timelineItem}>
            <span className={styles.timelineAction}>
              {domainLabel('approvalAction', log.action)}
            </span>
            <span className={styles.caption}>
              {log.actorName ?? t('system')} · {fmt.dateTime(log.createdAt)}
            </span>
            {log.note ? (
              <span className={styles.timelineNote}>{t('reason', { note: log.note })}</span>
            ) : null}
          </div>
        ),
      }))}
    />
  );
}
