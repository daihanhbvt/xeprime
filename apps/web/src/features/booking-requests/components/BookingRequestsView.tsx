'use client';

import { App, Button, Pagination, Tabs } from 'antd';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  PERMISSION,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
} from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useIsMobile } from '@/hooks/use-media-query';
import { usePermissions } from '@/hooks/use-permissions';
import { currentPathWithQuery } from '@/features/auth/safe-next';
import { getErrorCode } from '@/services/api-client';
import { BOOKING_REQUEST_TABS } from '../constants';
import { useBookingRequestFilters } from '../hooks/use-booking-request-filters';
import {
  useApproveBookingRequest,
  useRejectBookingRequest,
  useStartBookingRequestConversation,
} from '../hooks/use-booking-request-mutations';
import { BookingDetailDialog } from '@/features/bookings/components/BookingDetailDialog';
import { CustomerDetailDialog } from '@/features/customers/components/CustomerDetailDialog';
import { VehicleDetailDialog } from '@/features/vehicles/components/VehicleDetailDialog';
import { useBookingRequests } from '../hooks/use-booking-requests';
import type {
  ApproveBookingRequestInput,
  BookingRequestItem,
  BookingRequestStatusCount,
} from '../types';
import { ApproveBookingRequestDialog } from './ApproveBookingRequestDialog';
import { ApproveLongTermDialog } from './ApproveLongTermDialog';
import { BookingRequestCard, type BookingRequestAction } from './BookingRequestCard';
import { BookingRequestDetailDialog } from './BookingRequestDetailDialog';
import { RejectBookingRequestDialog } from './RejectBookingRequestDialog';
import styles from './BookingRequestsView.module.css';

/**
 * Hộp thư yêu cầu thuê của gian hàng.
 *
 * Đây là Client Component DUY NHẤT của màn: `page.tsx` vẫn là Server Component và chỉ dựng nó
 * bên trong `<Suspense>`. Mọi thứ cần client — filter đọc URL, TanStack Query, ba hộp thoại,
 * ba mutation — nằm gọn ở đây thay vì kéo cả route sang client.
 *
 * Phân trang, lọc trạng thái và scope chi nhánh đều SERVER-SIDE: hộp thư của một gian hàng bận
 * có hàng nghìn yêu cầu, nên không có đường nào tải hết rồi cắt ở client.
 */
export function BookingRequestsView() {
  const t = useTranslations('BookingRequests');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { has } = usePermissions();
  const isMobile = useIsMobile();

  /*
   * Chỗ đang đứng, KÈM tab và trang — gắn vào link "Xem lịch xe" để nút quay lại ở màn lịch
   * đưa người dùng về đúng đây, không phải về đầu hộp thư đã mất bộ lọc.
   */
  const backHref = currentPathWithQuery(pathname, searchParams.toString());

  const canApprove = has(PERMISSION.BOOKING_REQUEST_APPROVE);
  const canViewVehicle = has(PERMISSION.VEHICLE_VIEW);
  const canViewCustomer = has(PERMISSION.CUSTOMER_VIEW);
  const canViewBooking = has(PERMISSION.BOOKING_VIEW);

  const { filters, setFilters, activeTab, selectTab, hasFilters, clearFilters } =
    useBookingRequestFilters();
  const { data, isError, isFetching, refetch } = useBookingRequests(filters);

  const approve = useApproveBookingRequest();
  const reject = useRejectBookingRequest();
  const startConversation = useStartBookingRequestConversation();

  /** Yêu cầu đang mở trong từng hộp thoại — cả ba loại trừ nhau. */
  const [approveTarget, setApproveTarget] = useState<BookingRequestItem | null>(null);
  const [longTermTarget, setLongTermTarget] = useState<BookingRequestItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<BookingRequestItem | null>(null);
  /**
   * Bốn overlay chi tiết, mỗi cái một mảnh state riêng.
   *
   * Tách chứ không gộp thành một `{kind, id}`: mở hồ sơ XE từ trong hộp thoại chi tiết YÊU CẦU
   * là chuyện bình thường, nên hai cái phải cùng mở được chồng lên nhau.
   */
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [detailRequest, setDetailRequest] = useState<BookingRequestItem | null>(null);
  const [vehicleDetailId, setVehicleDetailId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<{ id: string; name: string } | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const items = data?.items ?? [];
  const meta = data?.meta;
  const statusCounts = meta?.statusCounts ?? [];

  /**
   * Thao tác đang chạy trên MỘT yêu cầu cụ thể.
   *
   * Khoá theo id chứ không theo cờ toàn màn: hai nhân viên xử lý hai yêu cầu khác nhau trên
   * cùng màn không được chặn nhau, nhưng bấm Duyệt rồi bấm Từ chối trên CÙNG một yêu cầu thì
   * phải bị chặn — đó là hai kết cục loại trừ nhau.
   */
  function pendingActionFor(id: string): BookingRequestAction | null {
    if (approve.isPending && approve.variables?.id === id) return 'approve';
    if (reject.isPending && reject.variables?.id === id) return 'reject';
    if (startConversation.isPending && startConversation.variables === id) return 'message';
    return null;
  }

  /** Chỉ hai QUYẾT ĐỊNH — "đang mở hội thoại" không khoá nút của hộp thoại chi tiết. */
  function decisionActionFor(id: string): 'approve' | 'reject' | null {
    const action = pendingActionFor(id);
    return action === 'approve' || action === 'reject' ? action : null;
  }

  /** Trùng lịch là câu chuyện riêng — nói rõ phải làm gì thay vì một dòng lỗi chung. */
  function approveErrorText(err: unknown): string {
    return getErrorCode(err) === API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT
      ? t('approve.scheduleConflict')
      : errorMessage(err);
  }

  /**
   * Dịch vụ theo ngày: lịch đã có trên yêu cầu → hỏi xác nhận rồi duyệt. THUÊ DÀI HẠN: khách
   * mới nêu nguyện vọng, gian hàng phải chốt ngày giờ nhận trong hộp thoại (ADR 0011).
   */
  function openApprove(row: BookingRequestItem) {
    setApproveError(null);
    if (row.serviceType === SERVICE_TYPE.LONG_TERM) setLongTermTarget(row);
    else setApproveTarget(row);
  }

  function confirmApprove(row: BookingRequestItem, body?: ApproveBookingRequestInput) {
    setApproveError(null);
    approve.mutate(
      { id: row.id, body },
      {
        onSuccess: () => {
          message.success(
            row.serviceType === SERVICE_TYPE.LONG_TERM
              ? t('approve.successLongTerm')
              : t('approve.success'),
          );
          setApproveTarget(null);
          setLongTermTarget(null);
        },
        // Trùng lịch (409): GIỮ hộp thoại mở để chọn giờ khác, không mất dữ liệu đã nhập.
        onError: (err) => setApproveError(approveErrorText(err)),
      },
    );
  }

  function confirmReject(reason: string) {
    if (!rejectTarget) return;
    setRejectError(null);
    reject.mutate(
      { id: rejectTarget.id, reason },
      {
        onSuccess: () => {
          message.success(t('reject.success'));
          setRejectTarget(null);
        },
        // Hộp thoại ở lại: lý do vừa gõ là công sức thật, không được nuốt mất vì một lần lỗi.
        onError: (err) => setRejectError(errorMessage(err)),
      },
    );
  }

  function openConversation(row: BookingRequestItem) {
    startConversation.mutate(row.id, {
      onSuccess: (conversation) => router.push(`${ROUTES.MANAGE.CHAT}?c=${conversation.id}`),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  /**
   * "Xem chi tiết" của một yêu cầu dẫn tới ĐÂU là quyết định của màn này, không phải của thẻ:
   * đã thành đơn thì mở chi tiết ĐƠN (màn đã có, dùng chung với `/manage/bookings/[id]`), chưa
   * có đơn thì mở chi tiết YÊU CẦU.
   */
  function openDetail(row: BookingRequestItem) {
    if (row.bookingId && canViewBooking) setDetailBookingId(row.bookingId);
    else setDetailRequest(row);
  }

  function openVehicleDetail(row: BookingRequestItem) {
    setVehicleDetailId(row.vehicleId);
  }

  function openCustomerDetail(row: BookingRequestItem) {
    if (!row.tenantCustomerId) return;
    setCustomerDetail({ id: row.tenantCustomerId, name: row.customerName });
  }

  /*
   * Thanh lọc nằm DƯỚI hàng tab, không gộp vào nó: tab trả lời "yêu cầu đang ở bước nào", thanh
   * lọc trả lời "yêu cầu nào" — hai câu hỏi khác nhau, và người trực hộp thư dùng chúng cùng lúc
   * (đang ở tab Cần xử lý mà tìm đúng khách vừa gọi điện tới).
   *
   * Nhãn dịch vụ đọc từ namespace `Domain` như mọi nơi khác — mã (`self_drive`…) là dữ liệu đi
   * trên dây, chỉ NHÃN mới dịch (ADR 0012).
   */
  const filterFields = useMemo<readonly FilterField[]>(
    () => [
      {
        kind: 'search',
        key: 'q',
        label: t('filters.searchLabel'),
        placeholder: t('filters.searchPlaceholder'),
      },
      {
        kind: 'select',
        key: 'serviceType',
        label: t('filters.serviceType'),
        options: SERVICE_TYPE_VALUES.map((value) => ({
          value,
          label: domainLabel('serviceType', value),
        })),
      },
    ],
    [t, domainLabel],
  );

  const tabItems = BOOKING_REQUEST_TABS.map((tab) => ({
    key: tab.value,
    label: (
      <span className={styles.tabLabel}>
        {t(`tabs.${tab.labelKey}`)}
        <span className={styles.tabCount}>{fmt.count(countFor(statusCounts, tab.status))}</span>
      </span>
    ),
  }));

  const filterBar = (
    <FilterBar
      fields={filterFields}
      values={{ q: filters.q, serviceType: filters.serviceType } satisfies FilterValues}
      onChange={(patch) => setFilters(patch)}
      onClear={hasFilters ? clearFilters : undefined}
      compactFields
      className={styles.tabFilters}
    />
  );

  const isFirstLoad = isFetching && !data;
  const showEmpty = !isFirstLoad && !isError && items.length === 0;
  const isNeedsActionTab = activeTab === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL;

  /*
   * Hai con số quan trọng nhất của hộp thư, tách khỏi hàng tab: "còn bao nhiêu việc" và "đã
   * chốt được bao nhiêu". Chúng lấy từ CÙNG `statusCounts` mà tab dùng, nên không có đường nào
   * để hai chỗ nói hai con số khác nhau.
   */
  const headerStats = (
    <dl className={styles.stats}>
      <div className={styles.stat}>
        <dt className={styles.statLabel}>{t('stats.pending')}</dt>
        <dd className={styles.statValue}>
          {fmt.count(countFor(statusCounts, BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL))}
        </dd>
      </div>
      <div className={styles.stat}>
        <dt className={styles.statLabel}>{t('stats.converted')}</dt>
        <dd className={styles.statValue}>
          {fmt.count(countFor(statusCounts, BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING))}
        </dd>
      </div>
    </dl>
  );

  return (
    <div className={styles.page}>
      <ManagePageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        extra={data ? headerStats : null}
      />

      <Tabs
        activeKey={activeTab}
        items={tabItems}
        onChange={selectTab}
        className={styles.tabs}
        aria-label={t('tabs.ariaLabel')}
        /*
         * Desktop: thanh lọc đi VÀO khe phải của hàng tab thay vì chiếm thêm một hàng. Hộp thư
         * đã có tiêu đề, hai thẻ số và sáu tab phía trên; một hàng nữa chỉ để chứa một ô tìm
         * kiếm là đẩy thẻ yêu cầu đầu tiên xuống dưới nếp gấp.
         *
         * Mobile thì KHÔNG: hàng tab ở đó tự cuộn ngang, nhét thêm ô tìm kiếm vào cùng hàng là
         * bóp cả hai. Nó xuống hàng riêng ngay dưới (xem bên dưới).
         */
        tabBarExtraContent={isMobile ? undefined : { right: filterBar }}
      />

      {isMobile ? filterBar : null}

      {isFirstLoad ? <LoadingState variant="cards" rows={4} label={t('states.loading')} /> : null}

      {isError && !data ? (
        <EmptyState
          variant="error"
          title={t('states.errorTitle')}
          description={tCommon('states.errorHint')}
          onRetry={() => void refetch()}
        />
      ) : null}

      {/*
        Ba nguyên nhân rỗng, ba câu khác nhau — `EmptyState` tách trạng thái theo NGUYÊN NHÂN,
        nên nói sai nguyên nhân là dẫn người dùng đi sai đường:
          · đang lọc/tìm  → không có kết quả khớp, lối ra là XOÁ bộ lọc;
          · tab Cần xử lý → tin VUI ("không còn việc nào"), không có gì phải làm;
          · tab khác      → tab đó chưa có yêu cầu nào, lối ra là đổi tab.
      */}
      {showEmpty ? (
        hasFilters ? (
          <EmptyState
            variant="no-results"
            title={t('states.emptySearchTitle')}
            description={t('states.emptySearchBody')}
            action={<Button onClick={clearFilters}>{tCommon('actions.clear')}</Button>}
          />
        ) : isNeedsActionTab ? (
          <EmptyState
            variant="empty"
            title={t('states.emptyPendingTitle')}
            description={t('states.emptyPendingBody')}
          />
        ) : (
          <EmptyState
            variant="no-results"
            title={t('states.emptyFilteredTitle')}
            description={t('states.emptyFilteredBody')}
          />
        )
      ) : null}

      {items.length > 0 ? (
        <>
          {/*
            Làm mới NỀN giữ nguyên danh sách đang đọc và chỉ mờ đi (`aria-busy` cho trình đọc
            màn hình) — thay bảng đang đọc dở bằng skeleton là mất chỗ của người dùng.
          */}
          <ul
            className={isFetching ? styles.listBusy : styles.list}
            aria-label={t('page.listLabel')}
            aria-busy={isFetching || undefined}
          >
            {items.map((request) => (
              <li key={request.id}>
                <BookingRequestCard
                  request={request}
                  canApprove={canApprove}
                  canViewVehicle={canViewVehicle}
                  canViewCustomer={canViewCustomer}
                  canViewBooking={canViewBooking}
                  pendingAction={pendingActionFor(request.id)}
                  onApprove={openApprove}
                  onReject={(row) => {
                    setRejectError(null);
                    setRejectTarget(row);
                  }}
                  onMessage={openConversation}
                  onOpenDetail={openDetail}
                  onOpenVehicle={openVehicleDetail}
                  onOpenCustomer={openCustomerDetail}
                  backHref={backHref}
                />
              </li>
            ))}
          </ul>

          {meta ? (
            <div className={styles.pagination}>
              <Pagination
                current={meta.page}
                pageSize={meta.limit}
                total={meta.total}
                showSizeChanger
                onChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
                showTotal={(total) => t('page.totalLabel', { count: total })}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {/*
        Chi tiết đơn dùng CHÍNH modal của feature bookings (cùng nội dung, cùng mutation, cùng
        quyền với trang `/manage/bookings/[id]`) — không dựng màn chi tiết thứ hai cho riêng
        hộp thư này.
      */}
      {detailBookingId ? (
        <BookingDetailDialog
          bookingId={detailBookingId}
          open
          onClose={() => setDetailBookingId(null)}
        />
      ) : null}

      {/*
        Yêu cầu chưa thành đơn có màn chi tiết riêng — và duyệt/từ chối được NGAY trong đó, để
        đọc xong không phải đóng ra tìm lại đúng thẻ trong danh sách.
      */}
      <BookingRequestDetailDialog
        request={detailRequest}
        canApprove={canApprove}
        pendingAction={detailRequest ? decisionActionFor(detailRequest.id) : null}
        onClose={() => setDetailRequest(null)}
        onApprove={(row) => {
          setDetailRequest(null);
          openApprove(row);
        }}
        onReject={(row) => {
          setDetailRequest(null);
          setRejectError(null);
          setRejectTarget(row);
        }}
        onOpenVehicle={openVehicleDetail}
        onOpenCustomer={openCustomerDetail}
        backHref={backHref}
      />

      {/* Hồ sơ xe / hồ sơ khách: CHÍNH màn đã có, chỉ đổi vỏ từ route sang overlay. */}
      {vehicleDetailId ? (
        <VehicleDetailDialog
          vehicleId={vehicleDetailId}
          open
          onClose={() => setVehicleDetailId(null)}
        />
      ) : null}

      {customerDetail ? (
        <CustomerDetailDialog
          customerId={customerDetail.id}
          customerName={customerDetail.name}
          open
          onClose={() => setCustomerDetail(null)}
        />
      ) : null}

      <ApproveBookingRequestDialog
        request={approveTarget}
        submitting={approve.isPending}
        error={approveError}
        onCancel={() => {
          setApproveTarget(null);
          setApproveError(null);
        }}
        onConfirm={() => approveTarget && confirmApprove(approveTarget)}
      />

      <ApproveLongTermDialog
        request={longTermTarget}
        submitting={approve.isPending}
        error={approveError}
        onCancel={() => {
          setLongTermTarget(null);
          setApproveError(null);
        }}
        onConfirm={(body) => longTermTarget && confirmApprove(longTermTarget, body)}
      />

      <RejectBookingRequestDialog
        request={rejectTarget}
        submitting={reject.isPending}
        error={rejectError}
        onCancel={() => {
          setRejectTarget(null);
          setRejectError(null);
        }}
        onConfirm={confirmReject}
      />
    </div>
  );
}

/**
 * Con số của một tab. Tab "Tất cả" (`status === null`) CỘNG mọi trạng thái thay vì có một
 * trường riêng: backend đã trả đủ bộ trạng thái nên phép cộng ở đây là chính xác, và một
 * trường `all` thứ hai chỉ tạo thêm một con số có thể lệch với phần còn lại.
 */
function countFor(counts: BookingRequestStatusCount[], status: string | null): number {
  if (status === null) return counts.reduce((sum, entry) => sum + entry.count, 0);
  return counts.find((entry) => entry.status === status)?.count ?? 0;
}
