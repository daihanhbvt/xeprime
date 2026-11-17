'use client';

import { vehicleGalleryItems } from '../media';
import { useImageSlotLabel } from '../hooks/use-image-slot-label';
import { useIsMobile } from '@/hooks/use-media-query';
import { ListingGallery } from '@/features/marketplace/components/ListingGallery';
import { CarOutlined, StarFilled } from '@ant-design/icons';
import { Skeleton, Tabs } from 'antd';
import { Fragment, useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_SOURCE_TYPE,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
  type VehicleSourceType,
} from '@xeprime/types';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import { ToneDotBadge } from '@/components/data-display/StatusBadge';
import { FinanceEntityPanel } from '@/features/finance/components/FinanceEntityPanel';
import { VehicleMaintenanceWorkspace } from '@/features/vehicle-maintenance/components/VehicleMaintenanceWorkspace';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { decorativeIcon } from '@/lib/decorative-icon';
import { useVehicleCapabilities } from '../hooks/use-vehicle-capabilities';
import type { Vehicle360Summary, VehicleDetail } from '../types';
import { MarketplaceVisibilitySwitch } from './MarketplaceVisibilitySwitch';
import { Vehicle360Aside } from './Vehicle360Aside';
import {
  AutomationCard,
  FeaturesCard,
  KeySpecsCard,
  MediaCard,
  SourceCard,
  SpecsCard,
  TodoCard,
} from './Vehicle360Cards';
import { NEEDS_OWNER_ACTION, VehicleStatusBadges } from './VehicleCardParts';
import styles from './Vehicle360Overview.module.css';

/** Tab của Hồ sơ xe (Figma `23672:4701`) — Tài chính và Bảo dưỡng có mặt theo năng lực. */
const OVERVIEW_VIEW = {
  OVERVIEW: 'overview',
  SPECS: 'specs',
  FINANCE: 'finance',
  FEATURES: 'features',
  MAINTENANCE: 'maintenance',
} as const;
type OverviewView = (typeof OVERVIEW_VIEW)[keyof typeof OVERVIEW_VIEW];

/**
 * Trạng thái mà người duyệt để lại LÝ DO cho chủ xe đọc — trả về, từ chối, hoặc nền tảng ẩn xe.
 * Chip trạng thái nói "bị từ chối" nhưng không nói vì sao; vì sao mới là thứ cần để đi tiếp.
 */
const SHOWS_REVIEW_REASON: readonly VehiclePublicStatus[] = [
  ...NEEDS_OWNER_ACTION,
  VEHICLE_PUBLIC_STATUS.HIDDEN,
];

export interface Vehicle360OverviewProps {
  vehicle: VehicleDetail;
  /** Tổng hợp chỉ số + đơn thuê; `undefined` khi đang tải hoặc tải hỏng. */
  summary?: Vehicle360Summary;
  summaryLoading: boolean;
  /** Tổng hợp hỏng KHÔNG kéo sập trang — từng khối tự báo "không tải được". */
  summaryFailed: boolean;
  canEdit: boolean;
  /**
   * Hàng nút (Xoá · Chỉnh sửa · Xem lịch xe) khi KHÔNG có tiêu đề trang để đặt nó — modal hồ sơ
   * xe. Trang đặt hàng nút ở tiêu đề và không truyền gì.
   */
  inlineActions?: ReactNode;
}

/**
 * Hồ sơ xe — Figma Partner-XePrime section `23672:25621` (03/11/2026).
 *
 *  - **Thẻ xe** trọn bề ngang: ảnh · tên · nguồn · vận hành · mã · biển số · KM · dịch vụ · kiểm
 *    duyệt · công tắc "Trên chợ" (ADR 0048) · Hiệu suất lũy kế (chỉ tuyến gói).
 *  - **Cột chính**: năm tab — Tổng quan · Thông số kỹ thuật · Tài chính · Tiện ích xe · Bảo dưỡng &
 *    số KM.
 *  - **Cột phụ** đứng cạnh suốt mọi tab: giá & chính sách · lịch sắp tới · hoạt động gần đây · lối
 *    tắt — xem `Vehicle360Aside`.
 *
 * Một component cho trang, modal hồ sơ xe và cả hai tuyến; bố cục đo BỀ RỘNG THẬT của vùng nội
 * dung (`@container`), không đo viewport — modal hẹp hơn trang.
 *
 * Không bịa dữ liệu chưa có (`docs/design/12` §12): KM chưa có là "Chưa có", không phải "0 km";
 * chưa ai chấm thì không có ô sao.
 */
export function Vehicle360Overview({
  vehicle,
  summary,
  summaryLoading,
  summaryFailed,
  canEdit,
  inlineActions,
}: Vehicle360OverviewProps) {
  const t = useTranslations('Vehicles.overview');
  const can = useVehicleCapabilities();
  const { isManage } = useWorkspace();
  const [view, setView] = useState<OverviewView>(OVERVIEW_VIEW.OVERVIEW);
  const tabsId = useId();

  /*
   * "Xem đầy đủ" / "Nhập dữ liệu" đổi tab TẠI CHỖ — và đưa focus theo: nút vừa bấm nằm trong ô vừa
   * bị ẩn, để nguyên thì người dùng bàn phím lạc mất chỗ. Id của tab do antd dựng từ `id` của `Tabs`.
   */
  function showTab(next: OverviewView) {
    setView(next);
    requestAnimationFrame(() => document.getElementById(`${tabsId}-tab-${next}`)?.focus());
  }

  return (
    <div className={styles.root}>
      {inlineActions ? <div className={styles.inlineActions}>{inlineActions}</div> : null}

      <ProfileCard
        vehicle={vehicle}
        summary={summary}
        summaryLoading={summaryLoading}
        summaryFailed={summaryFailed}
        showPerformance={isManage}
      />

      <div className={styles.layout}>
        <div className={styles.main}>
          <Tabs
            id={tabsId}
            className={styles.viewTabs}
            activeKey={view}
            onChange={(key) => setView(key as OverviewView)}
            items={[
              {
                key: OVERVIEW_VIEW.OVERVIEW,
                label: t('tabs.overview'),
                children: (
                  <div className={styles.stack}>
                    {/*
                      "Việc cần làm" đứng TRÊN cùng và chỉ khi có việc (design không vẽ — chốt
                      03/11): nó là lối DUY NHẤT để gửi duyệt lại một chiếc xe bị trả về.
                    */}
                    <TodoCard
                      vehicle={vehicle}
                      summary={summary}
                      loading={summaryLoading}
                      failed={summaryFailed}
                    />
                    <KeySpecsCard
                      vehicle={vehicle}
                      summary={summary}
                      onViewAll={() => showTab(OVERVIEW_VIEW.SPECS)}
                      onOdometer={
                        can.maintenance ? () => showTab(OVERVIEW_VIEW.MAINTENANCE) : undefined
                      }
                    />
                    <MediaCard vehicle={vehicle} canEdit={canEdit} />
                    <div className={styles.pair}>
                      {/* Nguồn xe & tài chính là sổ của gian hàng — chủ xe tuyến hoa hồng không có. */}
                      {isManage ? <SourceCard vehicle={vehicle} /> : null}
                      <AutomationCard vehicle={vehicle} canEdit={canEdit} />
                    </div>
                  </div>
                ),
              },
              {
                key: OVERVIEW_VIEW.SPECS,
                label: t('tabs.specs'),
                children: <SpecsCard vehicle={vehicle} />,
              },
              ...(can.money
                ? [
                    {
                      key: OVERVIEW_VIEW.FINANCE,
                      label: t('tabs.finance'),
                      /*
                       * Tiền của riêng chiếc xe này, THEO KỲ. Gác bằng `can.money` (quyền ∧ cờ
                       * gói) — `finance/*` ở backend gác `@SubscriptionTrackOnly` +
                       * `@RequiresFeature`.
                       */
                      children: (
                        <FinanceEntityPanel
                          scope={{ vehicleId: vehicle.id }}
                          kind="vehicle"
                          canCreateReceipt={can.createReceipt}
                        />
                      ),
                    },
                  ]
                : []),
              {
                key: OVERVIEW_VIEW.FEATURES,
                label: t('tabs.features'),
                children: <FeaturesCard vehicle={vehicle} />,
              },
              /*
               * Bảo dưỡng & số KM — tuyến GÓI: `vehicles/:id/maintenance/*` gác
               * `@SubscriptionTrackOnly` + `@RequiresFeature`, nên tab chỉ có khi `can.maintenance`.
               */
              ...(can.maintenance
                ? [
                    {
                      key: OVERVIEW_VIEW.MAINTENANCE,
                      label: t('tabs.maintenance'),
                      children: <VehicleMaintenanceWorkspace vehicle={vehicle} />,
                    },
                  ]
                : []),
            ]}
          />
        </div>

        <Vehicle360Aside
          vehicle={vehicle}
          summary={summary}
          loading={summaryLoading}
          failed={summaryFailed}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}

/* ─── Thẻ xe đầu trang ────────────────────────────────────────────────────── */

/**
 * Figma `23797:53034`: ảnh 212×134 · khối danh tính · "Trên chợ" ở góc phải · khối Hiệu suất
 * lũy kế ngăn bằng vạch đứng. Viên vận hành NGẮN cạnh tên và nhãn kiểm duyệt có biểu tượng + viên
 * vận hành DÀI ở hàng dưới là đúng như design (cùng mảnh `VehicleStatusBadges` của thẻ ít xe).
 */
function ProfileCard({
  vehicle,
  summary,
  summaryLoading,
  summaryFailed,
  showPerformance,
}: {
  vehicle: VehicleDetail;
  summary: Vehicle360Summary | undefined;
  summaryLoading: boolean;
  summaryFailed: boolean;
  showPerformance: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const operation = vehicle.operationStatus as VehicleOperationStatus;
  const review = vehicle.publicStatus as VehiclePublicStatus;
  const sourceType = (vehicle.sourceType ?? VEHICLE_SOURCE_TYPE.OWNED) as VehicleSourceType;
  const reason = SHOWS_REVIEW_REASON.includes(review) ? vehicle.latestPublicReview?.reason : null;
  const specParts = [
    domainLabel('vehicleType', vehicle.vehicleType),
    ...vehicle.serviceTypes.map((service) => domainLabel('serviceType', service)),
  ];
  // KM có thẩm quyền + NGUỒN của nó: người đọc biết số đến từ bàn giao, bảo dưỡng hay chỉnh tay.
  const odometer = summaryLoading ? null : fmt.km(summary?.currentOdometerKm ?? null);
  const isMobile = useIsMobile();
  const slotLabel = useImageSlotLabel();
  const gallery = vehicleGalleryItems(vehicle, slotLabel);

  return (
    <section className={styles.profile} aria-label={t('profileLabel')}>
      <div className={styles.profileMain}>
        {isMobile && gallery.length > 0 ? (
          /* Khổ điện thoại: ảnh lớn + dải ảnh nhỏ như app (người dùng chốt 17/11/2026). */
          <ListingGallery
            name={vehicle.name}
            mainImageUrl={gallery[0]?.url ?? null}
            images={gallery.map((item) => item.url)}
          />
        ) : null}
        <div className={styles.profileMedia} hidden={isMobile && gallery.length > 0}>
          {vehicle.mainImageUrl ? (
            <PreviewImage
              className={styles.profileImage}
              src={vehicle.mainImageUrl}
              alt={vehicle.name}
            />
          ) : (
            <span className={styles.mediaFallback} aria-hidden="true">
              <CarOutlined />
            </span>
          )}
        </div>

        <div className={styles.profileBody}>
          <div className={styles.profileTop}>
            <div className={styles.identity}>
              <div className={styles.nameRow}>
                <h2 className={styles.vehicleName}>{vehicle.name}</h2>
                <span className={styles.sourceBadge}>
                  {domainLabel('vehicleSourceType', sourceType)}
                </span>
                <ToneDotBadge compact color={VEHICLE_OPERATION_STATUS_META[operation]?.color}>
                  {domainLabel('vehicleOperationStatus', operation)}
                </ToneDotBadge>
              </div>
              {/*
                Định danh trên MỘT dải, mỗi mục là một ô riêng: xuống dòng thì xuống nguyên mục,
                không cắt "Biển số:" khỏi giá trị của nó. Chưa có số KM thì nói "Chưa có".
              */}
              <ul className={styles.metaList}>
                <li>
                  {t.rich('idLabel', { value: vehicle.code, b: (chunks) => <b>{chunks}</b> })}
                </li>
                <li>
                  {t.rich('plate', {
                    value: vehicle.plateNumber || tLabels('notAvailable'),
                    b: (chunks) => <b>{chunks}</b>,
                  })}
                </li>
                <li>
                  {odometer === null ? (
                    <Skeleton.Input active size="small" className={styles.metaSkeleton} />
                  ) : (
                    t.rich('odometer', {
                      value: summaryFailed ? tLabels('emptyValue') : odometer,
                      b: (chunks) => <b>{chunks}</b>,
                    })
                  )}
                  {summary?.currentOdometerSource ? (
                    <span className={styles.odometerSource}>
                      {' '}
                      · {domainLabel('odometerSource', summary.currentOdometerSource)}
                    </span>
                  ) : null}
                </li>
              </ul>
              <p className={styles.specLine}>
                {specParts.map((part, index) => (
                  <Fragment key={`${index}-${part}`}>
                    {index > 0 ? <span className={styles.dot} aria-hidden="true" /> : null}
                    <span>{part}</span>
                  </Fragment>
                ))}
              </p>
            </div>
            {/*
              "Trên chợ" ở ĐẦU trang (ADR 0048): thứ chủ xe kiểm tra thường xuyên nhất, và đây là chỗ
              bấm DUY NHẤT để bật/tắt hiển thị — "Việc cần làm" chỉ nhắc, không có nút thứ hai.
            */}
            <div className={styles.marketplace}>
              <MarketplaceVisibilitySwitch vehicle={vehicle} bare />
            </div>
          </div>
          <VehicleStatusBadges vehicle={vehicle} variant="detailed" />
          {reason ? <p className={styles.reviewReason}>{reason}</p> : null}
        </div>
      </div>

      {showPerformance ? (
        <PerformanceBlock summary={summary} loading={summaryLoading} failed={summaryFailed} />
      ) : null}
    </section>
  );
}

/**
 * Hiệu suất lũy kế (Figma `23664:32126`) — CHỈ chuyện vận hành: số chuyến đã đi, đơn đang chạy,
 * điểm khách chấm. Tiền nằm ở tab Tài chính theo kỳ — một màn, một bề mặt tiền.
 */
function PerformanceBlock({
  summary,
  loading,
  failed,
}: {
  summary: Vehicle360Summary | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const stats = summary?.stats;
  const rated = stats && stats.ratingCount > 0 && stats.ratingAvg;

  return (
    <section className={styles.performance} aria-label={t('performance.title')}>
      <h3 className={styles.performanceTitle}>{t('performance.title')}</h3>
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      ) : failed || !stats ? (
        <p className={styles.muted}>{t('loadFailed')}</p>
      ) : (
        <>
          <dl className={styles.metrics}>
            <div className={styles.metric}>
              <dd>{t('performance.tripCount', { count: stats.completedBookings })}</dd>
              <dt>{t('performance.rentals')}</dt>
            </div>
            <div className={styles.metric}>
              <dd>{t('performance.activeCount', { count: stats.activeBookings })}</dd>
              <dt>{t('performance.active')}</dt>
            </div>
            {/* Chưa ai chấm thì KHÔNG dựng ô — "0/5" là một lời chê không có thật. */}
            {rated ? (
              <div className={styles.metric}>
                <dd>
                  <span className={styles.star}>{decorativeIcon(<StarFilled />)}</span>
                  {t('performance.ratingScore', { rating: fmt.rating(Number(stats.ratingAvg)) })}
                </dd>
                <dt>{t('performance.rating')}</dt>
              </div>
            ) : null}
          </dl>
          {rated ? (
            <p className={styles.ratingCount}>
              {t('performance.ratingCount', { count: stats.ratingCount })}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
