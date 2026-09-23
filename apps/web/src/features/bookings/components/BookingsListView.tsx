'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  BOOKING_LIST_PRESET,
  BOOKING_STATUS_SELECTABLE_VALUES,
  PERMISSION,
  type BookingListPreset,
} from '@xeprime/types';
import { FilterBar, type FilterField, type FilterValues } from '@/components/filter/FilterBar';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { bookingPath, ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { BOOKINGS_DEFAULT_LIMIT } from '@/features/bookings/api';
import { StaffBookingDialog } from '@/features/booking-requests/components/StaffBookingDialog';
import { BookingTable } from '@/features/bookings/components/BookingTable';
import { useBookingFilters } from '@/features/bookings/hooks/use-booking-filters';
import { useBookings } from '@/features/bookings/hooks/use-bookings';
import type { BookingFilters, BookingSort } from '@/features/bookings/types';

/** Cách sắp xếp — khớp `BOOKING_SORT` ở DTO backend; nhãn lấy từ bó message. */
const SORT_VALUES = ['newest', 'pickup_asc', 'pickup_desc', 'return_asc'] as const;

interface BookingsListViewProps {
  /**
   * Nhóm việc dựng sẵn gửi thẳng lên server. Bỏ trống = danh sách đầy đủ.
   *
   * Hai route dùng CHUNG component này, và cả hai gọi cùng một endpoint: nhóm việc chỉ thêm
   * một tham số vào truy vấn, nó không phải một màn hình thứ hai với dữ liệu riêng.
   */
  preset?: BookingListPreset;
}

export function BookingsListView({ preset }: BookingsListViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { has } = usePermissions();
  const t = useTranslations('Bookings');
  const label = useDomainLabel();
  const { filters, setFilters } = useBookingFilters();

  const awaitingPickup = preset === BOOKING_LIST_PRESET.AWAITING_PICKUP;
  /*
   * Nhóm việc quyết cách sắp xếp MẶC ĐỊNH: một ca trực đọc theo giờ hẹn, không theo ngày tạo.
   * Server cũng mặc định đúng như vậy — gửi tường minh ở đây chỉ để ô "Sắp xếp" trên màn hình
   * không nói một đằng còn dữ liệu một nẻo.
   */
  const defaultSort: BookingSort = awaitingPickup ? 'pickup_asc' : 'newest';
  const sort = filters.sort ?? defaultSort;

  const query: BookingFilters = { ...filters, sort, ...(preset ? { preset } : {}) };
  const { data, isError, refetch, isFetching } = useBookings(query);

  // Danh sách chỉ còn TẠO đơn; sửa nằm ở trang chi tiết, nơi có đủ ngữ cảnh của chuyến.
  const [formOpen, setFormOpen] = useState(false);

  /*
   * Ý ĐỊNH đến từ nơi khác: hồ sơ khách (S-01) mở "Tạo đơn thuê" bằng `?create=1` kèm tên + SĐT.
   * Đây là query-param ý định theo quy ước IA §5 (`?auth=login`, `?intent=owner`) — KHÔNG phải
   * một form tạo đơn thứ hai dựng riêng cho sổ khách.
   *
   * Suy TRONG LÚC RENDER thay vì đồng bộ vào state bằng effect: URL đã là nguồn sự thật của ý
   * định này, chép nó sang state chỉ tạo thêm một nguồn có thể lệch. Dọn tham số lúc ĐÓNG hộp
   * thoại — giữ lại thì F5 tự mở lại, và mọi lần đổi bộ lọc vẫn kéo theo tên khách trong URL.
   */
  const createIntent = searchParams.get('create') === '1';
  const intentCustomerName = createIntent ? searchParams.get('customerName') : null;
  const intentCustomerPhone = createIntent ? searchParams.get('customerPhone') : null;

  function closeForm() {
    setFormOpen(false);
    if (!createIntent) return;
    const next = new URLSearchParams(searchParams.toString());
    for (const key of ['create', 'customerName', 'customerPhone']) next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const canCreate = has(PERMISSION.BOOKING_CREATE);
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: BOOKINGS_DEFAULT_LIMIT, total: 0, hasNext: false };
  const hasFilters = Boolean(filters.q || filters.status);

  /*
   * ADR 0047: "Chờ giao xe" đã LÀ một nhóm việc lọc sẵn — ô lọc trạng thái ở đây là thừa, và
   * sau khi `confirmed` bị bỏ khỏi luồng thật, giá trị khả dĩ duy nhất của preset này chỉ còn
   * đúng MỘT (`reserved`). Một ô lọc một lựa chọn không phải một bộ lọc, nó là trang trí — bỏ
   * hẳn field thay vì chỉ thu hẹp danh sách lựa chọn như bản trước.
   *
   * "Tất cả đơn thuê" giữ ô lọc, nhưng chỉ còn 5 trạng thái nghiệp vụ thật
   * (`BOOKING_STATUS_SELECTABLE_VALUES`) — loại `confirmed` (deprecated), thứ chưa từng là một
   * trạng thái nghỉ hợp lệ trong bất kỳ luồng sản phẩm nào.
   */
  const fields: readonly FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('list.searchLabel'),
      placeholder: t('list.searchPlaceholder'),
    },
    ...(awaitingPickup
      ? []
      : [
          {
            kind: 'select' as const,
            key: 'status',
            label: t('list.statusLabel'),
            allowClear: false,
            options: [
              { value: 'all', label: t('list.statusAll') },
              ...BOOKING_STATUS_SELECTABLE_VALUES.map((value) => ({
                value,
                label: label('bookingStatus', value),
              })),
            ],
          },
        ]),
    {
      kind: 'select',
      key: 'sort',
      label: t('list.sortLabel'),
      allowClear: false,
      options: SORT_VALUES.map((value) => ({ value, label: t(`list.sort.${value}`) })),
    },
  ];

  function openCreate() {
    setFormOpen(true);
  }

  function changeFilters(patch: FilterValues) {
    const next: Partial<BookingFilters> = {};
    if ('q' in patch) next.q = patch.q;
    if ('status' in patch) next.status = patch.status === 'all' ? undefined : patch.status;
    if ('sort' in patch) next.sort = patch.sort as BookingSort | undefined;
    setFilters(next);
  }

  return (
    <div>
      <ManagePageHeader
        title={awaitingPickup ? t('awaitingPickup.title') : t('list.title')}
        /*
         * Nhóm việc KHÔNG có nút tạo đơn: đây là hàng đợi của việc đang chạy, không phải chỗ
         * mở một chuyến mới. Lối tạo đơn nằm ở "Tất cả đơn thuê" và ở lịch, cách đúng một cú
         * bấm — và trạng thái rỗng ở dưới dẫn thẳng sang đó.
         */
        extra={
          canCreate && !awaitingPickup ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              {t('list.create')}
            </Button>
          ) : null
        }
      />

      <FilterBar
        fields={fields}
        values={{ q: filters.q, status: filters.status ?? 'all', sort }}
        onChange={changeFilters}
        searchDebounceMs={300}
      />

      <BookingTable
        items={items}
        meta={meta}
        awaitingPickup={awaitingPickup}
        loading={isFetching}
        error={isError && !data ? { onRetry: () => void refetch() } : null}
        filtered={hasFilters}
        onClearFilters={() => setFilters({ q: undefined, status: undefined })}
        emptyAction={
          awaitingPickup ? (
            <Link href={ROUTES.MANAGE.BOOKINGS}>
              <Button>{t('awaitingPickup.goToAll')}</Button>
            </Link>
          ) : canCreate ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              {t('list.createFirst')}
            </Button>
          ) : undefined
        }
        /*
         * Wave 10: bấm xem đi thẳng tới TRANG chi tiết thay vì mở drawer. Vận hành một chuyến
         * kéo dài nhiều ngày, nhiều người cùng nhìn và người ta gửi link cho nhau — một drawer
         * không có URL không phục vụ được việc đó. Chỉ còn MỘT bản chi tiết đơn.
         */
        onView={(id) => router.push(bookingPath.detail(id))}
        onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
      />

      {/*
       * Tạo đơn dùng NGUYÊN luồng "Đặt xe cho khách" của lịch — cùng giao diện khách thuê xe
       * (hồ sơ xe + ba bước, báo giá server). Lối vào này chưa biết xe nên hộp thoại mở ở bước
       * chọn xe trước; lối vào từ lịch đã biết xe thì vào thẳng.
       */}
      <StaffBookingDialog
        open={formOpen || createIntent}
        customerName={intentCustomerName}
        customerPhone={intentCustomerPhone}
        onClose={closeForm}
      />
    </div>
  );
}
