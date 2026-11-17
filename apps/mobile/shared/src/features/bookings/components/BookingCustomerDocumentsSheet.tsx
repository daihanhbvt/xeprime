import { PERMISSION } from '@xeprime/types';
import { useTranslations } from 'use-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { InlineAction } from '@/components/ui/InlineAction';
import { useCustomerProfileAccess } from '@/features/booking-requests/hooks/use-customer-profile-access';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { CustomerDocumentsPanel } from '@/features/customers/components/CustomerDocumentsPanel';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';

/**
 * Giấy tờ của khách mở NGAY trên đơn - bản native của `BookingCustomerDocumentsDialog` web.
 *
 * Không điều hướng sang hồ sơ khách: màn hồ sơ gọi `GET /customers/:id` (`@SubscriptionTrackOnly`)
 * nên chủ xe tuyến hoa hồng nhận 403, còn panel giấy tờ gọi `/customers/:id/documents` - không gác
 * tuyến. Lối "Mở hồ sơ khách" chỉ hiện khi tài khoản thật sự mở được hồ sơ.
 */
export function BookingCustomerDocumentsSheet({
  customerId,
  customerName,
  open,
  onClose,
}: {
  customerId: string;
  customerName: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Bookings.documentsDialog');
  const { has } = usePermissions();
  const profileAccess = useCustomerProfileAccess();
  const navigateOnce = useNavigateOnce();

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('title', { name: customerName })}
      footer={
        profileAccess ? (
          <InlineAction
            label={t('openProfile')}
            onPress={() => {
              onClose();
              navigateOnce(ROUTES.manage.customerDetail(customerId));
            }}
          />
        ) : undefined
      }
    >
      {open ? (
        <CustomerDocumentsPanel
          customerId={customerId}
          canManage={has(PERMISSION.CUSTOMER_DOCUMENT_MANAGE)}
          canViewFiles={has(PERMISSION.CUSTOMER_DOCUMENT_FILE_VIEW)}
        />
      ) : null}
    </BottomSheet>
  );
}
