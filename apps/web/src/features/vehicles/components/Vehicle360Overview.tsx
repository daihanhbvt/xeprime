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
import { useState } from 'react';
import {
  BOOKING_STATUS,
  BOOKING_STATUS_META,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  type BookingStatus,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { decorativeIcon } from '@/lib/decorative-icon';
import { formatDateTime, toAppTz } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { serviceTypeLabel, vehicleTypeLabel } from '../constants';
import { discountedPriceVnd } from '../pricing';
import { missingPublishRequirements, publicStatusPresentation } from '../publication';
import type { Vehicle360Summary, VehicleBookingBrief, VehicleDetail } from '../types';
import { VehiclePublicReviewPanel } from './VehiclePublicReviewPanel';
import styles from './Vehicle360Overview.module.css';

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
 *  - Header KHÔNG có "Nguồn xe"/"Odo" (schema chưa có cột — Wave 4/7).
 *  - Ba thẻ "Giấy tờ pháp lý" / "Nguồn xe & Tài chính" / "Bảo dưỡng & Số KM" là trạng thái
 *    "Chưa có dữ liệu" — giữ đúng vị trí thiết kế nhưng không có số liệu mẫu, không lối vào
 *    form của wave sau.
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
        canEdit={canEdit}
        canDelete={canDelete}
        deletePending={deletePending}
        onEdit={onEdit}
        onSchedule={onSchedule}
        onDelete={onDelete}
      />

      <div className={styles.quickRow}>
        <TodoCard vehicle={vehicle} />
        {summary?.upcomingBookings !== undefined || summaryLoading || summaryFailed ? (
          <ScheduleCard
            bookings={summary?.upcomingBookings}
            loading={summaryLoading}
            failed={summaryFailed}
          />
        ) : null}
        <PerformanceCard summary={summary} loading={summaryLoading} failed={summaryFailed} />
      </div>

      <div className={styles.columns}>
        <div className={styles.column}>
          <PricingCard vehicle={vehicle} canEdit={canEdit} onEdit={onEdit} />
          <PlaceholderCard
            title="Hồ sơ & Giấy tờ pháp lý"
            body="Chưa có dữ liệu giấy tờ cho xe này. Quản lý đăng ký, đăng kiểm và bảo hiểm sẽ được bổ sung ở giai đoạn sau."
          />
          <SpecsCard vehicle={vehicle} />
          <MediaCard vehicle={vehicle} />
        </div>
        <div className={styles.column}>
          <PlaceholderCard
            title="Nguồn xe & Tài chính"
            body="Chưa có thông tin nguồn xe (sở hữu / trả góp / thuê lại / hợp tác). Hồ sơ nguồn xe sẽ được bổ sung ở giai đoạn sau."
          />
          <PlaceholderCard
            title="Bảo dưỡng & Số KM"
            body="Chưa có dữ liệu KM và lịch bảo dưỡng. Theo dõi odo và nhắc bảo dưỡng sẽ được bổ sung ở giai đoạn sau."
          />
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
  canEdit,
  canDelete,
  deletePending,
  onEdit,
  onSchedule,
  onDelete,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
  canDelete: boolean;
  deletePending: boolean;
  onEdit: () => void;
  onSchedule: () => void;
  onDelete: () => void;
}) {
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
            // eslint-disable-next-line @next/next/no-img-element -- ảnh ngoài từ URL người dùng nhập
            <img className={styles.profileImage} src={vehicle.mainImageUrl} alt={vehicle.name} />
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
            {vehicleTypeLabel(vehicle.vehicleType)} / {serviceTypeLabel(vehicle.serviceType)}
          </p>
          <div className={styles.statusRow}>
            <span className={styles.axis}>
              <span className={styles.axisLabel}>Vận hành</span>
              <StatusTag
                value={vehicle.operationStatus as VehicleOperationStatus}
                meta={VEHICLE_OPERATION_STATUS_META}
              />
            </span>
            <span className={styles.axis}>
              <span className={styles.axisLabel}>Public</span>
              <StatusTag value={status} meta={VEHICLE_PUBLIC_STATUS_META} />
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

interface VehicleTodo {
  tone: 'error' | 'warning' | 'info';
  label: string;
}

/** Việc cần làm suy ra từ DỮ LIỆU THẬT: điều kiện public còn thiếu + trạng thái duyệt. */
function buildTodos(vehicle: VehicleDetail): VehicleTodo[] {
  const todos: VehicleTodo[] = [];
  const status = vehicle.publicStatus as VehiclePublicStatus;
  const missing = missingPublishRequirements(vehicle);

  if (status === VEHICLE_PUBLIC_STATUS.REJECTED) {
    todos.push({ tone: 'error', label: 'Xử lý lý do từ chối rồi gửi duyệt lại' });
  }
  if (status === VEHICLE_PUBLIC_STATUS.NEEDS_REVISION) {
    todos.push({ tone: 'warning', label: 'Bổ sung theo yêu cầu của nền tảng rồi gửi duyệt lại' });
  }
  if (status === VEHICLE_PUBLIC_STATUS.HIDDEN) {
    todos.push({ tone: 'warning', label: 'Gửi duyệt lại để xe hiển thị trở lại trên sàn' });
  }
  for (const label of missing) {
    todos.push({ tone: 'warning', label: `Bổ sung ${label.toLowerCase()} để đủ điều kiện public` });
  }
  if (status === VEHICLE_PUBLIC_STATUS.DRAFT && missing.length === 0) {
    todos.push({ tone: 'info', label: 'Xe đủ điều kiện — gửi duyệt công khai để lên sàn' });
  }
  return todos;
}

function TodoCard({ vehicle }: { vehicle: VehicleDetail }) {
  const todos = buildTodos(vehicle);

  return (
    <Card
      title="Việc cần làm"
      extra={todos.length > 0 ? <Badge count={todos.length} /> : null}
      className={styles.quickCard}
    >
      {todos.length === 0 ? (
        <p className={styles.muted}>Không có việc cần làm.</p>
      ) : (
        <ul className={styles.todoList}>
          {todos.map((todo) => (
            <li key={todo.label} className={styles.todoItem}>
              <span className={`${styles.todoDot} ${styles[todo.tone]}`} aria-hidden="true">
                ●
              </span>
              <span>{todo.label}</span>
            </li>
          ))}
        </ul>
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
                {formatMoneyVnd(booking.totalAmount)} • {bookingStatusLabel(booking.status)}
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
                <dd className={styles.income}>{formatMoneyVnd(stats.totalIncome)}</dd>
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

function PricingCard({
  vehicle,
  canEdit,
  onEdit,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const discounted = discountedPriceVnd(vehicle.weekdayPrice, vehicle.discountPercent);

  return (
    <Card
      title="Giá thuê & Chính sách"
      extra={
        canEdit ? (
          <Button type="link" size="small" className={styles.cardLink} onClick={onEdit}>
            Chỉnh sửa giá
          </Button>
        ) : null
      }
      className={styles.sectionCard}
    >
      <dl className={styles.kvList}>
        <div className={styles.kvRow}>
          <dt>Ngày thường</dt>
          <dd>{vehicle.weekdayPrice ? `${formatMoneyVnd(vehicle.weekdayPrice)} / ngày` : EMPTY}</dd>
        </div>
        <div className={styles.kvRow}>
          <dt>Cuối tuần</dt>
          <dd>{vehicle.weekendPrice ? `${formatMoneyVnd(vehicle.weekendPrice)} / ngày` : EMPTY}</dd>
        </div>
        {vehicle.hourlyPrice ? (
          <div className={styles.kvRow}>
            <dt>Theo giờ</dt>
            <dd>{formatMoneyVnd(vehicle.hourlyPrice)} / giờ</dd>
          </div>
        ) : null}
        {vehicle.discountPercent ? (
          <div className={styles.kvRow}>
            <dt>Giảm giá</dt>
            <dd>
              <Tag color="red">-{vehicle.discountPercent}%</Tag>
            </dd>
          </div>
        ) : null}
        {discounted != null ? (
          <div className={styles.kvRow}>
            <dt>Giá hiển thị sàn</dt>
            <dd>{formatMoneyVnd(discounted)}</dd>
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
 * Thẻ khu vực CHƯA có dữ liệu (giấy tờ / nguồn xe / bảo dưỡng — Wave 4/6/7).
 *
 * Giữ đúng vị trí trong bố cục Figma nhưng nói thẳng "Chưa có dữ liệu" thay vì số liệu mẫu,
 * và KHÔNG có lối vào form (tính năng chưa tồn tại — thà thiếu nút còn hơn nút chết).
 */
function PlaceholderCard({ title, body }: { title: string; body: string }) {
  return (
    <Card title={title} className={styles.sectionCard}>
      <p className={styles.muted}>{body}</p>
    </Card>
  );
}

function SpecsCard({ vehicle }: { vehicle: VehicleDetail }) {
  // Xe lưu KEY của danh mục, không lưu nhãn — nhãn tra từ `catalog_items` do admin cấu hình.
  const { brandLabel, bodyTypeLabel, fuelTypeLabel, featureLabel } = useCatalogLabels();

  const specs: DescriptionsProps['items'] = [
    { key: 'brand', label: 'Hãng xe', children: brandLabel(vehicle.brand) || EMPTY },
    { key: 'model', label: 'Mẫu xe', children: vehicle.model || EMPTY },
    { key: 'body', label: 'Kiểu dáng thân xe', children: bodyTypeLabel(vehicle.bodyType) ?? EMPTY },
    { key: 'year', label: 'Năm sản xuất', children: vehicle.manufactureYear ?? EMPTY },
    { key: 'seats', label: 'Số chỗ ngồi', children: vehicle.seatCount ?? EMPTY },
    { key: 'fuel', label: 'Nhiên liệu', children: fuelTypeLabel(vehicle.fuelType) ?? EMPTY },
    { key: 'color', label: 'Màu sắc', children: vehicle.color || EMPTY },
    { key: 'created', label: 'Tạo lúc', children: formatDateTime(vehicle.createdAt) },
    { key: 'updated', label: 'Cập nhật', children: formatDateTime(vehicle.updatedAt) },
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

function MediaCard({ vehicle }: { vehicle: VehicleDetail }) {
  if (vehicle.images.length === 0) return null;

  return (
    <Card title="Thư viện ảnh" className={styles.sectionCard}>
      <ul className={styles.gallery} aria-label="Thư viện ảnh">
        {vehicle.images.map((url) => (
          <li key={url}>
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh ngoài từ URL người dùng nhập */}
            <img src={url} alt="" className={styles.galleryThumb} loading="lazy" />
          </li>
        ))}
      </ul>
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
                  <span className={styles.activityTime}>{formatDateTime(booking.updatedAt)}</span>
                </div>
                <p className={styles.activitySub}>
                  {booking.customerName} • {shortRange(booking.pickupAt, booking.returnAt)} •{' '}
                  {formatMoneyVnd(booking.totalAmount)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
