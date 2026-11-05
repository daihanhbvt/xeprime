'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES } from '@/constants/routes';
import { useBranchReturnHref } from '@/features/branches/hooks/use-branch-return';
import { BookingDetailContent } from '@/features/bookings/components/BookingDetailContent';
import { BookingStageChip } from '@/features/bookings/components/detail/BookingDetailSections';
import { useAppFormat } from '@/i18n/use-app-format';
import styles from './BookingDetailPage.module.css';

/**
 * Chi tiết một đơn thuê — route THẬT (Wave 10). Vì sao là trang chứ không phải drawer: vận hành
 * một chuyến kéo dài nhiều ngày, nhiều người cùng nhìn, và người ta gửi link cho nhau.
 *
 * Nội dung nằm ở `BookingDetailContent` — dùng CHUNG với modal chi tiết trên lịch. Trang chỉ thêm
 * đầu trang theo design (Figma `23768:29928`): "Chi tiết đơn · #mã" + chip chặng + "Tạo lúc", cụm
 * nút hành động bên phải.
 */
export function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const bookingId = params?.id ?? '';
  const router = useRouter();
  const t = useTranslations('Bookings');
  const fmt = useAppFormat();
  // Quay lại danh sách với đúng chi nhánh đang lọc lúc mở đơn (ADR 0052).
  const listHref = useBranchReturnHref(ROUTES.MANAGE.BOOKINGS);
  const back = () => router.push(listHref);

  return (
    <div className={styles.page}>
      <BookingDetailContent
        bookingId={bookingId}
        onNotFoundAction={{ label: t('detail.backToList'), onClick: back }}
        renderHeader={(booking, actions) => (
          <ManagePageHeader
            title={
              <span className={styles.title}>
                {t('detailPage.title', { code: booking.code })}
                <BookingStageChip
                  status={booking.status}
                  cancellationParty={booking.cancellationParty}
                />
              </span>
            }
            subtitle={t('detailPage.createdAt', { date: fmt.date(booking.createdAt) })}
            onBack={back}
            extra={actions}
          />
        )}
      />
    </div>
  );
}
