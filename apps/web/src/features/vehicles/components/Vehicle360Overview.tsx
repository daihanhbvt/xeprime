'use client';

import {
  CarOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Badge,
  Button,
  Card,
  Descriptions,
  Dropdown,
  Popconfirm,
  Skeleton,
  Tag,
} from 'antd';
import type { DescriptionsProps } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BOOKING_STATUS,
  PERMISSION,
  VEHICLE_ALERT_KIND,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  VEHICLE_SOURCE_TYPE,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
  type VehicleSourceType,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FinanceEntityPanel } from '@/features/finance/components/FinanceEntityPanel';
import { VehicleMaintenanceCard } from '@/features/vehicle-maintenance/components/VehicleMaintenanceCard';
import {
  ROUTES,
  VEHICLE_EDIT_TAB,
  receiptsPath,
  vehiclePath,
  vehicleTabPath,
} from '@/constants/routes';
import { decorativeIcon } from '@/lib/decorative-icon';
import { toAppTz } from '@/lib/datetime';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { vehicleSchedulePath } from '../calendar-link';
import { usePublicationLabels } from '../hooks/use-publication-labels';
import { useVehicleSource } from '../hooks/use-vehicle-source';
import { discountedPriceVnd } from '../pricing';
import type { Vehicle360Summary, VehicleBookingBrief, VehicleDetail } from '../types';
import { VehicleAlertList } from './VehicleAlerts';
import { VehiclePublicReviewPanel } from './VehiclePublicReviewPanel';
import styles from './Vehicle360Overview.module.css';
import { useAppFormat, useDatePickerPattern } from '@/i18n/use-app-format';

/**
 * Khoảng ngày RÚT GỌN của thẻ lịch/hoạt động: "25/10 – 27/10" (vi) · "10/25 – 10/27" (en).
 *
 * Bỏ năm là cố ý (Figma `236:2374`) — lịch thuê nhìn gần. Mẫu ngày lấy theo NGÔN NGỮ đang xem,
 * không cứng `DD/MM`: người đọc tiếng Anh đọc `10/25` là 25 tháng 10, còn `25/10` thì không.
 *
 * Có khoá riêng chứ KHÔNG dùng `Common.units.range`: khoá chung nối bằng mũi tên (`→`, cho một
 * chuyển tiếp trạng thái), còn khoảng ngày ở đây thiết kế vẽ gạch ngang (`–`).
 */
function useShortRange(): (from: string, to: string) => string {
  const pattern = useDatePickerPattern();
  const t = useTranslations('Vehicles.overview');
  return (from, to) =>
    t('dateRange', {
      from: toAppTz(from).format(pattern.dayMonth),
      to: toAppTz(to).format(pattern.dayMonth),
    });
}

export interface Vehicle360OverviewProps {
  vehicle: VehicleDetail;
  /** Tổng hợp chỉ số + đơn thuê; `undefined` khi đang tải hoặc tải hỏng. */
  summary?: Vehicle360Summary;
  summaryLoading: boolean;
  /** Tổng hợp hỏng KHÔNG kéo sập trang — từng khối tự báo "không tải được". */
  summaryFailed: boolean;
  canEdit: boolean;
  canDelete: boolean;
  deletePending: boolean;
  onEdit: () => void;
  onSchedule: () => void;
  onDelete: () => void;
}

/**
 * Hồ sơ 360 của một xe — Figma `236:2222` (desktop) · `236:4783` (mobile).
 *
 * Bố cục khớp frame: **thẻ hồ sơ đầu trang (ảnh + định danh + hai trục trạng thái + hành động
 * + banner cảnh báo) → ba thẻ nhanh (việc cần làm · lịch thuê sắp tới · hiệu suất) → lưới hai
 * cột (giá & chính sách, giấy tờ / nguồn xe, bảo dưỡng) → hoạt động gần đây.**
 *
 * Khác frame có chủ đích — không bịa dữ liệu chưa tồn tại (nguyên tắc "Chưa có" của
 * `docs/design/12` §12):
 *  - Header hiển thị loại nguồn xe đã chọn; chi tiết tài chính của nguồn xe vẫn thuộc Wave 4.
 *  - Giấy tờ và bảo dưỡng giữ trạng thái chưa có dữ liệu cho tới wave tương ứng, không bịa dữ liệu mẫu.
 *  - "Hiệu suất" giữ số chuyến LUỸ KẾ; TIỀN đã tách hẳn sang khối `FinanceEntityPanel` theo kỳ,
 *    để một màn hình không mang hai con số tiền với hai ý nghĩa thời gian khác nhau.
 *  - Banner cảnh báo lấy từ trạng thái duyệt công khai (dữ liệu thật) thay vì hạn đăng kiểm.
 */
export function Vehicle360Overview({
  vehicle,
  summary,
  summaryLoading,
  summaryFailed,
  canEdit,
  canDelete,
  deletePending,
  onEdit,
  onSchedule,
  onDelete,
}: Vehicle360OverviewProps) {
  const t = useTranslations('Vehicles.overview');
  const { has } = usePermissions();

  return (
    <div className={styles.stack}>
      <ProfileHeader
        vehicle={vehicle}
        summary={summary}
        canEdit={canEdit}
        canDelete={canDelete}
        deletePending={deletePending}
        onEdit={onEdit}
        onSchedule={onSchedule}
        onDelete={onDelete}
      />

      <div className={styles.quickRow}>
        <TodoCard summary={summary} loading={summaryLoading} failed={summaryFailed} />
        {summary?.upcomingBookings !== undefined || summaryLoading || summaryFailed ? (
          <ScheduleCard
            bookings={summary?.upcomingBookings}
            loading={summaryLoading}
            failed={summaryFailed}
          />
        ) : null}
        <PerformanceCard summary={summary} loading={summaryLoading} failed={summaryFailed} />
      </div>

      <ModuleLinks vehicleId={vehicle.id} vehicle={vehicle} canEdit={canEdit} />

      {/*
        Tiền của riêng chiếc xe này, THEO KỲ. Trước đây hồ sơ xe chỉ có một con số luỹ kế và một
        đường dẫn ra sổ — không trả lời được "tháng này xe có nuôi nổi nó không".

        Gác `finance.view` ở đây là gác HIỂN THỊ; chặn thật vẫn là guard backend, và khi thiếu
        quyền thì truy vấn cũng không được bắn đi (cùng luật với `VehiclesService.stats`).
      */}
      {has(PERMISSION.FINANCE_VIEW) ? (
        <FinanceEntityPanel
          scope={{ vehicleId: vehicle.id }}
          kind="vehicle"
          canCreateReceipt={has(PERMISSION.RECEIPT_CREATE)}
        />
      ) : null}

      <div className={styles.columns}>
        <div className={styles.column}>
          <PricingCard vehicle={vehicle} canEdit={canEdit} />
          <DocumentsCard vehicleId={vehicle.id} summary={summary} />
          <SpecsCard vehicle={vehicle} />
          <MediaCard vehicle={vehicle} />
        </div>
        <div className={styles.column}>
          <SourceCard vehicle={vehicle} />
          <VehicleMaintenanceCard vehicleId={vehicle.id} />
          <VehiclePublicReviewPanel vehicle={vehicle} />
        </div>
      </div>

      {summary?.recentBookings !== undefined || summaryLoading || summaryFailed ? (
        <ActivityCard
          bookings={summary?.recentBookings}
          loading={summaryLoading}
          failed={summaryFailed}
        />
      ) : null}

      {/* CTA cố định đáy màn ở mobile (Figma `236:4890`) — desktop dùng nút trong thẻ hồ sơ. */}
      {canEdit ? (
        <div className={styles.mobileActions}>
          <Button type="primary" size="large" block onClick={onEdit}>
            {t('editMobile')}
          </Button>
          <Button size="large" block onClick={onSchedule}>
            {t('scheduleMobile')}
          </Button>
        </div>
      ) : (
        <div className={styles.mobileActions}>
          <Button size="large" block onClick={onSchedule}>
            {t('scheduleMobile')}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─── Thẻ hồ sơ đầu trang ─────────────────────────────────────────────────── */

function ProfileHeader({
  vehicle,
  summary,
  canEdit,
  canDelete,
  deletePending,
  onEdit,
  onSchedule,
  onDelete,
}: {
  vehicle: VehicleDetail;
  summary: Vehicle360Summary | undefined;
  canEdit: boolean;
  canDelete: boolean;
  deletePending: boolean;
  onEdit: () => void;
  onSchedule: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const tActions = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { statusCopy } = usePublicationLabels();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const status = vehicle.publicStatus as VehiclePublicStatus;

  // Banner một-dòng cho trạng thái cần chú ý; `approved_public`/`draft` không cần banner —
  // draft đã có mục "Việc cần làm" và panel gửi duyệt nói chi tiết hơn.
  const needsBanner =
    status === VEHICLE_PUBLIC_STATUS.REJECTED ||
    status === VEHICLE_PUBLIC_STATUS.NEEDS_REVISION ||
    status === VEHICLE_PUBLIC_STATUS.HIDDEN ||
    status === VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW;
  const banner = needsBanner ? statusCopy(status, vehicle.latestPublicReview?.reason) : null;

  const menuItems = canDelete ? [{ key: 'delete', danger: true, label: t('delete') }] : [];

  return (
    <section className={styles.profile} aria-label={t('profileLabel')}>
      <div className={styles.profileMain}>
        <div className={styles.profileMedia}>
          {vehicle.mainImageUrl ? (
            <PreviewImage
              className={styles.profileImage}
              src={vehicle.mainImageUrl}
              alt={vehicle.name}
            />
          ) : (
            <span className={styles.profileMediaFallback} aria-hidden="true">
              <CarOutlined />
            </span>
          )}
        </div>

        <div className={styles.profileInfo}>
          <div className={styles.nameRow}>
            <p className={styles.vehicleName}>{vehicle.name}</p>
            <span className={styles.codeChip}>{vehicle.code}</span>
          </div>
          <p className={styles.plateRow}>
            {t.rich('plate', {
              value: vehicle.plateNumber || tLabels('notAvailable'),
              b: (chunks) => <b>{chunks}</b>,
            })}
            <span className={styles.dot} aria-hidden="true">
              •
            </span>
            {domainLabel('vehicleType', vehicle.vehicleType)} /{' '}
            {fmt.serviceTypes(vehicle.serviceTypes)}
          </p>
          {/*
           * KM có thẩm quyền + NGUỒN của nó (Wave 8). Chưa có số thì nói "Chưa có" —
           * không dựng "0 km" (docs §9). Nguồn cho biết số đến từ bàn giao, bảo dưỡng hay
           * chỉnh tay, để người đọc biết tin nó tới đâu.
           */}
          <p className={styles.odometerRow}>
            {t.rich('odometer', {
              value: fmt.km(summary?.currentOdometerKm ?? null),
              b: (chunks) => <b>{chunks}</b>,
            })}
            {summary?.currentOdometerSource ? (
              <span className={styles.odometerSource}>
                {' '}
                · {domainLabel('odometerSource', summary.currentOdometerSource)}
              </span>
            ) : null}
          </p>
          <div className={styles.statusRow}>
            <span className={styles.axis}>
              <span className={styles.axisLabel}>{t('axisOperation')}</span>
              <StatusTag
                value={vehicle.operationStatus as VehicleOperationStatus}
                meta={VEHICLE_OPERATION_STATUS_META}
                group="vehicleOperationStatus"
              />
            </span>
            <span className={styles.axis}>
              <span className={styles.axisLabel}>{t('axisPublic')}</span>
              <StatusTag
                value={status}
                meta={VEHICLE_PUBLIC_STATUS_META}
                group="vehiclePublicStatus"
              />
            </span>
          </div>
        </div>

        <div className={styles.profileActions}>
          {canEdit ? (
            <Button type="primary" block onClick={onEdit}>
              {t('edit')}
            </Button>
          ) : null}
          <Button block onClick={onSchedule}>
            {t('schedule')}
          </Button>
          {menuItems.length > 0 ? (
            // Xác nhận điều khiển bằng state và neo vào nút ⋮ — mục menu đã biến mất khi menu
            // đóng, không còn chỗ khác để neo (cùng pattern với `RowActions`).
            <Popconfirm
              open={confirmingDelete}
              trigger={[]}
              title={t('deleteConfirmTitle', { name: vehicle.name })}
              description={t('deleteConfirmBody')}
              okText={tActions('delete')}
              okButtonProps={{ danger: true, loading: deletePending }}
              cancelText={tActions('cancel')}
              onConfirm={() => {
                setConfirmingDelete(false);
                onDelete();
              }}
              onCancel={() => setConfirmingDelete(false)}
            >
              <Dropdown
                menu={{
                  items: menuItems,
                  onClick: ({ key }) => {
                    if (key === 'delete') setConfirmingDelete(true);
                  },
                }}
                trigger={['click']}
              >
                <Button
                  icon={decorativeIcon(<MoreOutlined />)}
                  aria-label={t('moreActions', { name: vehicle.name })}
                  loading={deletePending}
                />
              </Dropdown>
            </Popconfirm>
          ) : null}
        </div>
      </div>

      {banner ? (
        <Alert
          type={banner.type}
          showIcon
          message={banner.message}
          description={banner.description}
        />
      ) : null}
    </section>
  );
}

/* ─── Ba thẻ nhanh ────────────────────────────────────────────────────────── */

/**
 * Việc cần làm — lấy TỪ SERVER (`VehicleAlertsService`), cùng phép tính với thẻ xe ở danh sách.
 *
 * Wave 8 gỡ bản suy diễn tại chỗ trước đây: nó chỉ nhìn thấy điều kiện đăng công khai, nên xe
 * quá hạn bảo dưỡng hay thiếu KM trả vẫn hiện "Không có việc cần làm" — trang chi tiết và thẻ
 * xe kể hai câu chuyện khác nhau về cùng một xe.
 */
function TodoCard({
  summary,
  loading,
  failed,
}: {
  summary: Vehicle360Summary | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const alerts = summary?.alerts ?? [];

  return (
    <Card
      title={t('todo.title')}
      extra={alerts.length > 0 ? <Badge count={alerts.length} /> : null}
      className={styles.quickCard}
    >
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      ) : failed || !summary ? (
        <p className={styles.muted}>{t('loadFailed')}</p>
      ) : (
        <VehicleAlertList alerts={alerts} />
      )}
    </Card>
  );
}

function ScheduleCard({
  bookings,
  loading,
  failed,
}: {
  bookings: VehicleBookingBrief[] | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const shortRange = useShortRange();

  return (
    <Card title={t('schedules.title')} className={styles.quickCard}>
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      ) : failed || bookings === undefined ? (
        <p className={styles.muted}>{t('loadFailed')}</p>
      ) : bookings.length === 0 ? (
        <p className={styles.muted}>{t('schedules.empty')}</p>
      ) : (
        <ul className={styles.scheduleList}>
          {bookings.map((booking) => (
            <li key={booking.id} className={styles.scheduleItem}>
              <p className={styles.scheduleTitle}>
                {t('schedules.item', {
                  customer: booking.customerName,
                  range: shortRange(booking.pickupAt, booking.returnAt),
                })}
              </p>
              <p className={styles.scheduleSub}>
                {t('schedules.sub', {
                  amount: fmt.money(booking.totalAmount),
                  status: domainLabel('bookingStatus', booking.status),
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PerformanceCard({
  summary,
  loading,
  failed,
}: {
  summary: Vehicle360Summary | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const t = useTranslations('Vehicles.overview');

  const stats = summary?.stats;

  return (
    /*
     * Thẻ này CHỈ nói chuyện vận hành: xe đã chạy bao nhiêu chuyến, đang có mấy đơn.
     *
     * Doanh thu từng nằm ở đây dưới dạng một con số LUỸ KẾ. Từ khi `FinanceEntityPanel` có mặt
     * ngay bên dưới với đầy đủ kỳ, giữ lại con số đó nghĩa là đặt hai số tiền cạnh nhau trên
     * cùng một màn hình với hai ý nghĩa thời gian khác nhau — cách chắc chắn để người đọc lấy
     * nhầm số. Một màn, một bề mặt tiền.
     */
    <Card title={t('performance.title')} className={styles.quickCard}>
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      ) : failed || !stats ? (
        <p className={styles.muted}>{t('loadFailed')}</p>
      ) : (
        <div className={styles.perf}>
          <dl className={styles.perfRow}>
            <div>
              <dt>{t('performance.rentals')}</dt>
              <dd>{t('performance.tripCount', { count: stats.completedBookings })}</dd>
            </div>
          </dl>
          <div className={styles.perfFoot}>
            <span>{t('performance.activeLabel')}</span>
            <b>{t('performance.activeCount', { count: stats.activeBookings })}</b>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── Lưới hai cột ────────────────────────────────────────────────────────── */

function PricingCard({ vehicle, canEdit }: { vehicle: VehicleDetail; canEdit: boolean }) {
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();

  const empty = tLabels('emptyValue');
  const discounted = discountedPriceVnd(vehicle.weekdayPrice, vehicle.discountPercent);

  return (
    <Card
      title={t('pricing.title')}
      extra={
        canEdit ? (
          // Wave 2: giá & chính sách có workspace riêng (kế thừa/ghi đè) — không đi qua wizard.
          <Link href={vehiclePath.pricing(vehicle.id)} className={styles.cardLink}>
            {t('pricing.editLink')}
          </Link>
        ) : null
      }
      className={styles.sectionCard}
    >
      <dl className={styles.kvList}>
        <div className={styles.kvRow}>
          <dt>{t('pricing.weekday')}</dt>
          <dd>{vehicle.weekdayPrice ? fmt.pricePerDay(vehicle.weekdayPrice) : empty}</dd>
        </div>
        <div className={styles.kvRow}>
          <dt>{t('pricing.weekend')}</dt>
          <dd>{vehicle.weekendPrice ? fmt.pricePerDay(vehicle.weekendPrice) : empty}</dd>
        </div>
        {vehicle.hourlyPrice ? (
          <div className={styles.kvRow}>
            <dt>{t('pricing.hourly')}</dt>
            <dd>{fmt.pricePerHour(vehicle.hourlyPrice)}</dd>
          </div>
        ) : null}
        {vehicle.discountPercent ? (
          <div className={styles.kvRow}>
            <dt>{t('pricing.discount')}</dt>
            <dd>
              <DiscountTag percent={vehicle.discountPercent} />
            </dd>
          </div>
        ) : null}
        {discounted != null ? (
          <div className={styles.kvRow}>
            <dt>{t('pricing.publicPrice')}</dt>
            <dd>{fmt.money(discounted)}</dd>
          </div>
        ) : null}
        {/*
          Yêu cầu bảo đảm KHÔNG còn là thuộc tính của xe (20/08) — nó thuộc chính sách thuê hiệu
          lực, kế thừa từ gian hàng hoặc ghi đè riêng. Hiện nó ở đây sẽ là số liệu chết đọc từ
          cột không ai ghi nữa; chỗ đúng của nó là tab "Giá & chính sách".
        */}
        <div className={styles.kvRow}>
          <dt>{t('pricing.delivery')}</dt>
          <dd>{vehicle.deliveryEnabled ? t('pricing.deliveryOn') : t('pricing.deliveryOff')}</dd>
        </div>
      </dl>
    </Card>
  );
}

/**
 * Lối đi chuẩn sang các module liên quan (Wave 8).
 *
 * Hồ sơ 360 là trang TỔNG QUAN, không phải form thứ hai — nên nó chỉ dẫn đường sang đúng tab
 * sửa/mô-đun đã có, dùng nguyên giá trị `?tab=` mà `VehicleEditWorkspace` hiểu. Không dựng lại
 * form nào ở đây, và không có nút dẫn tới tính năng chưa tồn tại.
 */
function ModuleLinks({
  vehicleId,
  vehicle,
  canEdit,
}: {
  vehicleId: string;
  vehicle: VehicleDetail;
  canEdit: boolean;
}) {
  const t = useTranslations('Vehicles.overview.links');
  const { has } = usePermissions();
  const links: { href: string; label: string }[] = [];

  if (canEdit) {
    links.push(
      { href: vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.INFORMATION), label: t('information') },
      { href: vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.MEDIA), label: t('media') },
      { href: vehiclePath.pricing(vehicleId), label: t('pricing') },
    );
    if (has(PERMISSION.FINANCE_VIEW)) {
      links.push({ href: vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.SOURCE), label: t('source') });
    }
  }
  if (has(PERMISSION.VEHICLE_DOCUMENT_VIEW)) {
    links.push({
      href: vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.DOCUMENTS),
      label: t('documents'),
    });
  }
  if (has(PERMISSION.VEHICLE_MAINTENANCE_VIEW)) {
    links.push(
      { href: vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.MAINTENANCE), label: t('maintenance') },
      { href: ROUTES.MANAGE.MAINTENANCE, label: t('maintenanceCenter') },
    );
  }
  if (has(PERMISSION.CALENDAR_VIEW)) {
    // Cùng helper với nút "Xem lịch" và thẻ ở danh sách — một đường dẫn lịch duy nhất.
    links.push({ href: vehicleSchedulePath(vehicle), label: t('calendar') });
  }
  if (has(PERMISSION.BOOKING_VIEW)) {
    links.push({ href: `${ROUTES.MANAGE.BOOKINGS}?vehicleId=${vehicleId}`, label: t('bookings') });
  }
  if (has(PERMISSION.FINANCE_VIEW)) {
    // Doanh thu và chi phí của riêng xe này. Từ epic nối tiền, chi phí bảo dưỡng đã tự lên sổ
    // nên đây mới là chỗ trả lời được "xe này lãi thật bao nhiêu".
    links.push({ href: receiptsPath.filtered({ vehicleId }), label: t('receipts') });
  }
  if (links.length === 0) return null;

  return (
    <nav className={styles.moduleLinks} aria-label={t('ariaLabel')}>
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={styles.moduleLink}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Tóm tắt giấy tờ (Wave 5) trên Hồ sơ 360.
 *
 * CỐ Ý chỉ hiện ĐẾM theo cảnh báo do server tính — không loại giấy tờ, không số hiệu, không
 * ngày hết hạn cụ thể. Những thứ đó nằm sau `documents.view_details` và thuộc về tab giấy tờ;
 * lặp lại chúng ở đây là mở một cửa sau vào dữ liệu PII.
 */
function DocumentsCard({
  vehicleId,
  summary,
}: {
  vehicleId: string;
  summary: Vehicle360Summary | undefined;
}) {
  const t = useTranslations('Vehicles.overview');
  const { has } = usePermissions();
  if (!has(PERMISSION.VEHICLE_DOCUMENT_VIEW)) return null;

  const alerts = summary?.alerts ?? [];
  const expired = alerts.find((a) => a.kind === VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED);
  const expiring = alerts.find((a) => a.kind === VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING);

  return (
    <Card
      title={t('documents.title')}
      extra={
        <Link
          href={vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.DOCUMENTS)}
          className={styles.cardLink}
        >
          {t('documents.manageLink')}
        </Link>
      }
      className={styles.sectionCard}
    >
      {expired || expiring ? (
        <ul className={styles.todoList}>
          {expired ? (
            <li className={styles.todoItem}>
              <span className={`${styles.todoDot} ${styles.error}`} aria-hidden="true">
                ●
              </span>
              <span>{t('documents.expired', { count: expired.count ?? 1 })}</span>
            </li>
          ) : null}
          {expiring ? (
            <li className={styles.todoItem}>
              <span className={`${styles.todoDot} ${styles.warning}`} aria-hidden="true">
                ●
              </span>
              <span>{t('documents.expiring', { count: expiring.count ?? 1 })}</span>
            </li>
          ) : null}
        </ul>
      ) : summary ? (
        <p className={styles.muted}>{t('documents.clear')}</p>
      ) : (
        <p className={styles.muted}>{t('documents.unknown')}</p>
      )}
    </Card>
  );
}

function SpecsCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.overview');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  // Xe lưu KEY của danh mục, không lưu nhãn — nhãn tra từ `catalog_items` do admin cấu hình.
  const { brandLabel, bodyTypeLabel, fuelTypeLabel, featureLabel } = useCatalogLabels();

  const empty = tLabels('emptyValue');
  /**
   * Số đo kèm đơn vị. Con số đi qua `fmt.count` để dấu phân tách nhóm theo ngôn ngữ đang xem
   * (`4.630` vi · `4,630` en) — `toLocaleString('vi-VN')` cứng ở đây là bản dịch bị bỏ sót.
   * Đơn vị (mm/kg/cc/HP/L per 100km) là KÝ HIỆU, không dịch.
   */
  const metric = (value: number | string | null | undefined, unit: string): string =>
    value == null || value === ''
      ? empty
      : t('metric', { value: fmt.count(Number(value)), unit });

  const specs: DescriptionsProps['items'] = [
    { key: 'brand', label: t('specs.brand'), children: brandLabel(vehicle.brand) || empty },
    { key: 'model', label: t('specs.model'), children: vehicle.model || empty },
    {
      key: 'body',
      label: t('specs.bodyType'),
      children: bodyTypeLabel(vehicle.bodyType) ?? empty,
    },
    {
      key: 'year',
      label: t('specs.manufactureYear'),
      children: vehicle.manufactureYear ?? empty,
    },
    {
      key: 'seats',
      label: t('specs.seatCount'),
      children: vehicle.seatCount ?? empty,
    },
    {
      key: 'fuel',
      label: t('specs.fuelType'),
      children: fuelTypeLabel(vehicle.fuelType) ?? empty,
    },
    { key: 'color', label: t('specs.color'), children: vehicle.color || empty },
    { key: 'length', label: t('specs.length'), children: metric(vehicle.lengthMm, 'mm') },
    { key: 'width', label: t('specs.width'), children: metric(vehicle.widthMm, 'mm') },
    { key: 'height', label: t('specs.height'), children: metric(vehicle.heightMm, 'mm') },
    {
      key: 'weight',
      label: t('specs.curbWeight'),
      children: metric(vehicle.curbWeightKg, 'kg'),
    },
    {
      key: 'engine',
      label: t('specs.engineDisplacement'),
      children: metric(vehicle.engineDisplacementCc, 'cc'),
    },
    { key: 'power', label: t('specs.horsepower'), children: metric(vehicle.horsepowerHp, 'HP') },
    {
      key: 'transmission',
      label: t('specs.transmission'),
      children: vehicle.transmission
        ? domainLabel('transmissionType', vehicle.transmission)
        : empty,
    },
    {
      key: 'fuel-combined',
      label: t('specs.fuelCombined'),
      children: metric(vehicle.fuelConsumptionCombined, 'L/100km'),
    },
    { key: 'created', label: t('specs.createdAt'), children: fmt.dateTime(vehicle.createdAt) },
    { key: 'updated', label: t('specs.updatedAt'), children: fmt.dateTime(vehicle.updatedAt) },
  ];

  return (
    <Card title={t('specs.title')} className={styles.sectionCard}>
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={specs} />

      {vehicle.features.length > 0 ? (
        <div className={styles.chips}>
          {vehicle.features.map((key) => (
            <Tag key={key}>{featureLabel(key)}</Tag>
          ))}
        </div>
      ) : null}

      {vehicle.description ? <p className={styles.description}>{vehicle.description}</p> : null}
    </Card>
  );
}

/**
 * Tóm tắt nguồn xe (Wave 4). Chi tiết tài chính chỉ tải khi người xem có `finance.view` —
 * người không có quyền chỉ thấy hình thức (đã nằm sẵn trên vehicle), không thấy con số.
 */
function SourceCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const sourceType = (vehicle.sourceType ?? VEHICLE_SOURCE_TYPE.OWNED) as VehicleSourceType;
  const permissions = usePermissions();
  const canViewFinance = permissions.has(PERMISSION.FINANCE_VIEW);
  const source = useVehicleSource(vehicle.id, canViewFinance);
  const detail = source.data?.detail ?? null;

  const summary = detail
    ? [
        detail.bankName,
        detail.ownerName,
        detail.monthlyTotal
          ? t('source.monthlyTotal', { amount: fmt.money(detail.monthlyTotal) })
          : null,
        detail.monthlyRent
          ? t('source.monthlyRent', { amount: fmt.money(detail.monthlyRent) })
          : null,
        detail.commissionPercent
          ? t('source.commission', { percent: detail.commissionPercent })
          : null,
        detail.paymentDay ? t('source.paymentDay', { day: detail.paymentDay }) : null,
      ]
        .filter(Boolean)
        .join(LIST_SEPARATOR)
    : '';

  return (
    <Card title={t('source.title')} className={styles.sectionCard}>
      <dl className={styles.kvList}>
        <div className={styles.kvRow}>
          <dt>{t('source.kind')}</dt>
          <dd>
            <Tag color="gold">{domainLabel('vehicleSourceType', sourceType)}</Tag>
          </dd>
        </div>
        {detail && summary ? (
          <div className={styles.kvRow}>
            <dt>{t('source.summary')}</dt>
            <dd>{summary}</dd>
          </div>
        ) : null}
      </dl>
      {canViewFinance ? (
        source.isLoading ? null : detail ? (
          <Link href={vehicleTabPath(vehicle.id, VEHICLE_EDIT_TAB.SOURCE)} className={styles.muted}>
            {t('source.detailLink')}
          </Link>
        ) : (
          <p className={styles.muted}>
            {t('source.missing')}{' '}
            <Link href={vehicleTabPath(vehicle.id, VEHICLE_EDIT_TAB.SOURCE)}>
              {t('source.missingLink')}
            </Link>
          </p>
        )
      ) : null}
    </Card>
  );
}

function MediaCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.overview');
  if (vehicle.images.length === 0) return null;

  return (
    <Card title={t('media.title')} className={styles.sectionCard}>
      {/* Group: bấm ảnh nào cũng mở trình xem toàn màn hình chung, chuyển ảnh bằng mũi tên. */}
      <PreviewImageGroup>
        <ul className={styles.gallery} aria-label={t('media.title')}>
          {vehicle.images.map((url) => (
            <li key={url}>
              <PreviewImage src={url} alt="" className={styles.galleryThumb} loading="lazy" />
            </li>
          ))}
        </ul>
      </PreviewImageGroup>
    </Card>
  );
}

/* ─── Hoạt động gần đây ───────────────────────────────────────────────────── */

function activityIcon(status: string) {
  switch (status) {
    case BOOKING_STATUS.COMPLETED:
      return <CheckCircleFilled className={styles.iconSuccess} />;
    case BOOKING_STATUS.ACTIVE:
      return <CarOutlined className={styles.iconInfo} />;
    case BOOKING_STATUS.CANCELLED:
    case BOOKING_STATUS.NO_SHOW:
      return <CloseCircleOutlined className={styles.iconError} />;
    default:
      return <ClockCircleOutlined className={styles.iconMuted} />;
  }
}

function ActivityCard({
  bookings,
  loading,
  failed,
}: {
  bookings: VehicleBookingBrief[] | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const shortRange = useShortRange();

  return (
    <Card title={t('activity.title')} className={styles.sectionCard}>
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 3 }} />
      ) : failed || bookings === undefined ? (
        <p className={styles.muted}>{t('loadFailed')}</p>
      ) : bookings.length === 0 ? (
        <p className={styles.muted}>{t('activity.empty')}</p>
      ) : (
        <ul className={styles.activityList}>
          {bookings.map((booking) => (
            <li key={booking.id} className={styles.activityItem}>
              <span className={styles.activityIcon} aria-hidden="true">
                {activityIcon(booking.status)}
              </span>
              <div className={styles.activityBody}>
                <div className={styles.activityHead}>
                  <p className={styles.activityTitle}>
                    {t('activity.item', {
                      code: booking.code,
                      status: domainLabel('bookingStatus', booking.status),
                    })}
                  </p>
                  <span className={styles.activityTime}>{fmt.dateTime(booking.updatedAt)}</span>
                </div>
                <p className={styles.activitySub}>
                  {t('activity.sub', {
                    customer: booking.customerName,
                    range: shortRange(booking.pickupAt, booking.returnAt),
                    amount: fmt.money(booking.totalAmount),
                  })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
