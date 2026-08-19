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
import {
  BOOKING_STATUS,
  BOOKING_STATUS_META,
  ODOMETER_SOURCE_LABEL,
  PERMISSION,
  VEHICLE_ALERT_KIND,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  VEHICLE_SOURCE_TYPE,
  VEHICLE_SOURCE_TYPE_LABEL,
  TRANSMISSION_TYPE_LABEL,
  type BookingStatus,
  type OdometerSource,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
  type VehicleSourceType,
} from '@xeprime/types';
import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import { StatusTag } from '@/components/data-display/StatusTag';
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
import { serviceTypesLabel } from '@xeprime/types';
import { vehicleTypeLabel } from '../constants';
import { vehicleSchedulePath } from '../calendar-link';
import { useVehicleSource } from '../hooks/use-vehicle-source';
import { discountedPriceVnd } from '../pricing';
import { publicStatusPresentation } from '../publication';
import type { Vehicle360Summary, VehicleBookingBrief, VehicleDetail } from '../types';
import { VehicleAlertList } from './VehicleAlerts';
import { VehiclePublicReviewPanel } from './VehiclePublicReviewPanel';
import styles from './Vehicle360Overview.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

const EMPTY = '—';

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
 *  - "Hiệu suất" là số LUỸ KẾ (backend không có chỉ số theo tháng) — tiêu đề nói thẳng điều đó.
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
            Chỉnh sửa xe
          </Button>
          <Button size="large" block onClick={onSchedule}>
            Xem lịch biểu
          </Button>
        </div>
      ) : (
        <div className={styles.mobileActions}>
          <Button size="large" block onClick={onSchedule}>
            Xem lịch biểu
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
  const fmt = useAppFormat();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const status = vehicle.publicStatus as VehiclePublicStatus;

  // Banner một-dòng cho trạng thái cần chú ý; `approved_public`/`draft` không cần banner —
  // draft đã có mục "Việc cần làm" và panel gửi duyệt nói chi tiết hơn.
  const needsBanner =
    status === VEHICLE_PUBLIC_STATUS.REJECTED ||
    status === VEHICLE_PUBLIC_STATUS.NEEDS_REVISION ||
    status === VEHICLE_PUBLIC_STATUS.HIDDEN ||
    status === VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW;
  const banner = needsBanner
    ? publicStatusPresentation(status, vehicle.latestPublicReview?.reason)
    : null;

  const menuItems = canDelete ? [{ key: 'delete', danger: true, label: 'Xoá xe' }] : [];

  return (
    <section className={styles.profile} aria-label="Hồ sơ xe">
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
            Biển số: <b>{vehicle.plateNumber || 'Chưa có'}</b>
            <span className={styles.dot} aria-hidden="true">
              •
            </span>
            {vehicleTypeLabel(vehicle.vehicleType)} / {serviceTypesLabel(vehicle.serviceTypes)}
          </p>
          {/*
           * KM có thẩm quyền + NGUỒN của nó (Wave 8). Chưa có số thì nói "Chưa có" —
           * không dựng "0 km" (docs §9). Nguồn cho biết số đến từ bàn giao, bảo dưỡng hay
           * chỉnh tay, để người đọc biết tin nó tới đâu.
           */}
          <p className={styles.odometerRow}>
            Số KM: <b>{fmt.km(summary?.currentOdometerKm ?? null)}</b>
            {summary?.currentOdometerSource ? (
              <span className={styles.odometerSource}>
                {' '}
                ·{' '}
                {ODOMETER_SOURCE_LABEL[summary.currentOdometerSource as OdometerSource] ??
                  summary.currentOdometerSource}
              </span>
            ) : null}
          </p>
          <div className={styles.statusRow}>
            <span className={styles.axis}>
              <span className={styles.axisLabel}>Vận hành</span>
              <StatusTag
                value={vehicle.operationStatus as VehicleOperationStatus}
                meta={VEHICLE_OPERATION_STATUS_META}
                group="vehicleOperationStatus"
              />
            </span>
            <span className={styles.axis}>
              <span className={styles.axisLabel}>Public</span>
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
              Chỉnh sửa
            </Button>
          ) : null}
          <Button block onClick={onSchedule}>
            Xem lịch
          </Button>
          {menuItems.length > 0 ? (
            // Xác nhận điều khiển bằng state và neo vào nút ⋮ — mục menu đã biến mất khi menu
            // đóng, không còn chỗ khác để neo (cùng pattern với `RowActions`).
            <Popconfirm
              open={confirmingDelete}
              trigger={[]}
              title={`Xoá xe "${vehicle.name}"?`}
              description="Xe sẽ bị ẩn khỏi danh sách và gỡ khỏi sàn. Đơn thuê, phiếu thu/chi đã có vẫn được giữ để đối soát. Không xoá được nếu xe còn lịch thuê hiện tại hoặc tương lai."
              okText="Xoá"
              okButtonProps={{ danger: true, loading: deletePending }}
              cancelText="Huỷ"
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
                  aria-label={`Thao tác khác cho ${vehicle.name}`}
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
  const alerts = summary?.alerts ?? [];

  return (
    <Card
      title="Việc cần làm"
      extra={alerts.length > 0 ? <Badge count={alerts.length} /> : null}
      className={styles.quickCard}
    >
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      ) : failed || !summary ? (
        <p className={styles.muted}>Không tải được dữ liệu.</p>
      ) : (
        <VehicleAlertList alerts={alerts} />
      )}
    </Card>
  );
}

/** "25/10 – 27/10" — dạng ngắn của thẻ lịch (Figma `236:2374`); năm bỏ vì lịch nhìn gần. */
function shortRange(from: string, to: string): string {
  return `${toAppTz(from).format('DD/MM')} – ${toAppTz(to).format('DD/MM')}`;
}

function bookingStatusLabel(status: string): string {
  return BOOKING_STATUS_META[status as BookingStatus]?.label ?? status;
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
  const fmt = useAppFormat();

  return (
    <Card title="Lịch thuê sắp tới" className={styles.quickCard}>
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      ) : failed || bookings === undefined ? (
        <p className={styles.muted}>Không tải được dữ liệu.</p>
      ) : bookings.length === 0 ? (
        <p className={styles.muted}>Không có lịch thuê sắp tới.</p>
      ) : (
        <ul className={styles.scheduleList}>
          {bookings.map((booking) => (
            <li key={booking.id} className={styles.scheduleItem}>
              <p className={styles.scheduleTitle}>
                {booking.customerName} • {shortRange(booking.pickupAt, booking.returnAt)}
              </p>
              <p className={styles.scheduleSub}>
                {fmt.money(booking.totalAmount)} • {bookingStatusLabel(booking.status)}
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
  const fmt = useAppFormat();

  const stats = summary?.stats;
  const hasFinance = stats?.totalIncome != null;

  return (
    // "Luỹ kế" trong tiêu đề là cố ý: backend chưa có chỉ số theo kỳ (xem `VehiclesService.stats`),
    // đặt tên "tháng này" cho một con số từ-trước-tới-nay là nói dối người đọc.
    <Card title="Hiệu suất luỹ kế" className={styles.quickCard}>
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      ) : failed || !stats ? (
        <p className={styles.muted}>Không tải được dữ liệu.</p>
      ) : (
        <div className={styles.perf}>
          <dl className={styles.perfRow}>
            {hasFinance ? (
              <div>
                <dt>Doanh thu</dt>
                <dd className={styles.income}>{fmt.money(stats.totalIncome)}</dd>
              </div>
            ) : null}
            <div className={hasFinance ? styles.alignEnd : undefined}>
              <dt>Lượt thuê</dt>
              <dd>{stats.completedBookings} chuyến</dd>
            </div>
          </dl>
          <div className={styles.perfFoot}>
            <span>Đơn đang chạy:</span>
            <b>{stats.activeBookings} đơn</b>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ─── Lưới hai cột ────────────────────────────────────────────────────────── */

function PricingCard({ vehicle, canEdit }: { vehicle: VehicleDetail; canEdit: boolean }) {
  const fmt = useAppFormat();

  const discounted = discountedPriceVnd(vehicle.weekdayPrice, vehicle.discountPercent);

  return (
    <Card
      title="Giá thuê & Chính sách"
      extra={
        canEdit ? (
          // Wave 2: giá & chính sách có workspace riêng (kế thừa/ghi đè) — không đi qua wizard.
          <Link href={vehiclePath.pricing(vehicle.id)} className={styles.cardLink}>
            Chỉnh sửa giá
          </Link>
        ) : null
      }
      className={styles.sectionCard}
    >
      <dl className={styles.kvList}>
        <div className={styles.kvRow}>
          <dt>Ngày thường</dt>
          <dd>{vehicle.weekdayPrice ? `${fmt.money(vehicle.weekdayPrice)} / ngày` : EMPTY}</dd>
        </div>
        <div className={styles.kvRow}>
          <dt>Cuối tuần</dt>
          <dd>{vehicle.weekendPrice ? `${fmt.money(vehicle.weekendPrice)} / ngày` : EMPTY}</dd>
        </div>
        {vehicle.hourlyPrice ? (
          <div className={styles.kvRow}>
            <dt>Theo giờ</dt>
            <dd>{fmt.money(vehicle.hourlyPrice)} / giờ</dd>
          </div>
        ) : null}
        {vehicle.discountPercent ? (
          <div className={styles.kvRow}>
            <dt>Giảm giá</dt>
            <dd>
              <DiscountTag percent={vehicle.discountPercent} />
            </dd>
          </div>
        ) : null}
        {discounted != null ? (
          <div className={styles.kvRow}>
            <dt>Giá hiển thị sàn</dt>
            <dd>{fmt.money(discounted)}</dd>
          </div>
        ) : null}
        <div className={styles.kvRow}>
          <dt>Thế chấp tài sản</dt>
          <dd>{vehicle.noCollateral ? 'Không yêu cầu' : 'Có yêu cầu'}</dd>
        </div>
        <div className={styles.kvRow}>
          <dt>Giao xe tận nơi</dt>
          <dd>{vehicle.deliveryEnabled ? 'Có hỗ trợ' : 'Không'}</dd>
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
  const { has } = usePermissions();
  const links: { href: string; label: string }[] = [];

  if (canEdit) {
    links.push(
      { href: vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.INFORMATION), label: 'Thông tin xe' },
      { href: vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.MEDIA), label: 'Hình ảnh' },
      { href: vehiclePath.pricing(vehicleId), label: 'Giá & Chính sách' },
    );
    if (has(PERMISSION.FINANCE_VIEW)) {
      links.push({ href: vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.SOURCE), label: 'Nguồn xe' });
    }
  }
  if (has(PERMISSION.VEHICLE_DOCUMENT_VIEW)) {
    links.push({
      href: vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.DOCUMENTS),
      label: 'Giấy tờ xe',
    });
  }
  if (has(PERMISSION.VEHICLE_MAINTENANCE_VIEW)) {
    links.push(
      { href: vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.MAINTENANCE), label: 'Bảo dưỡng & KM' },
      { href: ROUTES.MANAGE.MAINTENANCE, label: 'Trung tâm bảo dưỡng' },
    );
  }
  if (has(PERMISSION.CALENDAR_VIEW)) {
    // Cùng helper với nút "Xem lịch" và thẻ ở danh sách — một đường dẫn lịch duy nhất.
    links.push({ href: vehicleSchedulePath(vehicle), label: 'Lịch xe' });
  }
  if (has(PERMISSION.BOOKING_VIEW)) {
    links.push({ href: `${ROUTES.MANAGE.BOOKINGS}?vehicleId=${vehicleId}`, label: 'Đơn thuê' });
  }
  if (has(PERMISSION.FINANCE_VIEW)) {
    // Doanh thu và chi phí của riêng xe này. Từ epic nối tiền, chi phí bảo dưỡng đã tự lên sổ
    // nên đây mới là chỗ trả lời được "xe này lãi thật bao nhiêu".
    links.push({ href: receiptsPath.filtered({ vehicleId }), label: 'Thu chi của xe' });
  }
  if (links.length === 0) return null;

  return (
    <nav className={styles.moduleLinks} aria-label="Liên kết nhanh tới các mục của xe">
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
  const { has } = usePermissions();
  if (!has(PERMISSION.VEHICLE_DOCUMENT_VIEW)) return null;

  const alerts = summary?.alerts ?? [];
  const expired = alerts.find((a) => a.kind === VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED);
  const expiring = alerts.find((a) => a.kind === VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING);

  return (
    <Card
      title="Hồ sơ & Giấy tờ pháp lý"
      extra={
        <Link
          href={vehicleTabPath(vehicleId, VEHICLE_EDIT_TAB.DOCUMENTS)}
          className={styles.cardLink}
        >
          Quản lý giấy tờ
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
              <span>
                {expired.count ?? 1} giấy tờ đã hết hạn — cần xử lý trước khi xe tiếp tục chạy
              </span>
            </li>
          ) : null}
          {expiring ? (
            <li className={styles.todoItem}>
              <span className={`${styles.todoDot} ${styles.warning}`} aria-hidden="true">
                ●
              </span>
              <span>{expiring.count ?? 1} giấy tờ sắp hết hạn</span>
            </li>
          ) : null}
        </ul>
      ) : summary ? (
        <p className={styles.muted}>Không có giấy tờ nào quá hạn hoặc sắp hết hạn.</p>
      ) : (
        <p className={styles.muted}>Chưa có thông tin.</p>
      )}
    </Card>
  );
}

function SpecsCard({ vehicle }: { vehicle: VehicleDetail }) {
  const fmt = useAppFormat();

  // Xe lưu KEY của danh mục, không lưu nhãn — nhãn tra từ `catalog_items` do admin cấu hình.
  const { brandLabel, bodyTypeLabel, fuelTypeLabel, featureLabel } = useCatalogLabels();

  const specs: DescriptionsProps['items'] = [
    { key: 'brand', label: 'Hãng xe', children: brandLabel(vehicle.brand) || EMPTY },
    { key: 'model', label: 'Mẫu xe', children: vehicle.model || EMPTY },
    { key: 'body', label: 'Kiểu dáng thân xe', children: bodyTypeLabel(vehicle.bodyType) ?? EMPTY },
    { key: 'year', label: 'Năm sản xuất', children: vehicle.manufactureYear ?? EMPTY },
    { key: 'seats', label: 'Số chỗ ngồi', children: vehicle.seatCount ?? EMPTY },
    {
      key: 'fuel',
      label: 'Nguồn năng lượng',
      children: fuelTypeLabel(vehicle.fuelType) ?? EMPTY,
    },
    { key: 'color', label: 'Màu sắc', children: vehicle.color || EMPTY },
    { key: 'length', label: 'Chiều dài', children: formatMetric(vehicle.lengthMm, 'mm') },
    { key: 'width', label: 'Chiều rộng', children: formatMetric(vehicle.widthMm, 'mm') },
    { key: 'height', label: 'Chiều cao', children: formatMetric(vehicle.heightMm, 'mm') },
    {
      key: 'weight',
      label: 'Trọng lượng bản thân',
      children: formatMetric(vehicle.curbWeightKg, 'kg'),
    },
    {
      key: 'engine',
      label: 'Dung tích động cơ',
      children: formatMetric(vehicle.engineDisplacementCc, 'cc'),
    },
    { key: 'power', label: 'Công suất', children: formatMetric(vehicle.horsepowerHp, 'HP') },
    {
      key: 'transmission',
      label: 'Hộp số',
      children: vehicle.transmission
        ? (TRANSMISSION_TYPE_LABEL[vehicle.transmission] ?? vehicle.transmission)
        : EMPTY,
    },
    {
      key: 'fuel-combined',
      label: 'Tiêu thụ hỗn hợp',
      children: formatMetric(vehicle.fuelConsumptionCombined, 'L/100km'),
    },
    { key: 'created', label: 'Tạo lúc', children: fmt.dateTime(vehicle.createdAt) },
    { key: 'updated', label: 'Cập nhật', children: fmt.dateTime(vehicle.updatedAt) },
  ];

  return (
    <Card title="Thông số kỹ thuật" className={styles.sectionCard}>
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

function formatMetric(value: number | string | null | undefined, unit: string): string {
  if (value == null || value === '') return EMPTY;
  return `${Number(value).toLocaleString('vi-VN')} ${unit}`;
}

/**
 * Tóm tắt nguồn xe (Wave 4). Chi tiết tài chính chỉ tải khi người xem có `finance.view` —
 * người không có quyền chỉ thấy hình thức (đã nằm sẵn trên vehicle), không thấy con số.
 */
function SourceCard({ vehicle }: { vehicle: VehicleDetail }) {
  const fmt = useAppFormat();

  const sourceType = (vehicle.sourceType ?? VEHICLE_SOURCE_TYPE.OWNED) as VehicleSourceType;
  const permissions = usePermissions();
  const canViewFinance = permissions.has(PERMISSION.FINANCE_VIEW);
  const source = useVehicleSource(vehicle.id, canViewFinance);
  const detail = source.data?.detail ?? null;

  const summary = detail
    ? [
        detail.bankName,
        detail.ownerName,
        detail.monthlyTotal ? `${fmt.money(detail.monthlyTotal)}/tháng (gốc + lãi)` : null,
        detail.monthlyRent ? `${fmt.money(detail.monthlyRent)}/tháng` : null,
        detail.commissionPercent ? `chia chủ xe ${detail.commissionPercent}%` : null,
        detail.paymentDay ? `đến hạn ngày ${detail.paymentDay}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <Card title="Nguồn xe & Tài chính" className={styles.sectionCard}>
      <dl className={styles.kvList}>
        <div className={styles.kvRow}>
          <dt>Hình thức nguồn xe</dt>
          <dd>
            <Tag color="gold">{VEHICLE_SOURCE_TYPE_LABEL[sourceType]}</Tag>
          </dd>
        </div>
        {detail && summary ? (
          <div className={styles.kvRow}>
            <dt>Tóm tắt</dt>
            <dd>{summary}</dd>
          </div>
        ) : null}
      </dl>
      {canViewFinance ? (
        source.isLoading ? null : detail ? (
          <Link href={vehicleTabPath(vehicle.id, VEHICLE_EDIT_TAB.SOURCE)} className={styles.muted}>
            Xem hồ sơ nguồn xe & tài chính →
          </Link>
        ) : (
          <p className={styles.muted}>
            Chưa khai báo hồ sơ nguồn chi tiết.{' '}
            <Link href={vehicleTabPath(vehicle.id, VEHICLE_EDIT_TAB.SOURCE)}>Bổ sung ngay →</Link>
          </p>
        )
      ) : null}
    </Card>
  );
}

function MediaCard({ vehicle }: { vehicle: VehicleDetail }) {
  if (vehicle.images.length === 0) return null;

  return (
    <Card title="Thư viện ảnh" className={styles.sectionCard}>
      {/* Group: bấm ảnh nào cũng mở trình xem toàn màn hình chung, chuyển ảnh bằng mũi tên. */}
      <PreviewImageGroup>
        <ul className={styles.gallery} aria-label="Thư viện ảnh">
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
  const fmt = useAppFormat();

  return (
    <Card title="Hoạt động gần đây" className={styles.sectionCard}>
      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 3 }} />
      ) : failed || bookings === undefined ? (
        <p className={styles.muted}>Không tải được dữ liệu.</p>
      ) : bookings.length === 0 ? (
        <p className={styles.muted}>Chưa có hoạt động nào cho xe này.</p>
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
                    Đơn {booking.code} · {bookingStatusLabel(booking.status)}
                  </p>
                  <span className={styles.activityTime}>{fmt.dateTime(booking.updatedAt)}</span>
                </div>
                <p className={styles.activitySub}>
                  {booking.customerName} • {shortRange(booking.pickupAt, booking.returnAt)} •{' '}
                  {fmt.money(booking.totalAmount)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
