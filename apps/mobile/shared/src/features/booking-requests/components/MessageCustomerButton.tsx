import { useTranslations } from 'use-intl';
import { PERMISSION } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { IconButton } from '@/components/ui/IconButton';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { useStartBookingRequestConversation } from '../hooks/use-booking-requests';

/**
 * Nút "Nhắn tin" cho khách của MỘT đơn — bản native của nút nhắn trong `ContactButtons` (chi tiết
 * đơn) và `openConversation` (màn Đơn thuê) bên web: mở hội thoại của YÊU CẦU gốc rồi vào thread
 * kèm thẻ CHUYẾN (`t=<requestId>`), để câu đầu tiên mang ngữ cảnh chuyến (PR #280).
 *
 * Ẩn khi thiếu `booking_requests.view` hoặc đơn không có yêu cầu gốc (đơn tạo tại quầy). Khách chưa
 * có tài khoản (`canMessageOnPlatform = false`) thì nút vẫn hiện nhưng nói lý do, như web.
 */
export function MessageCustomerButton({
  requestId,
  canMessageOnPlatform,
}: {
  requestId: string | null | undefined;
  canMessageOnPlatform: boolean;
}) {
  const t = useTranslations('BookingRequests.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();
  const start = useStartBookingRequestConversation();

  if (!requestId || !permissions.has(PERMISSION.BOOKING_REQUEST_VIEW)) return null;

  return (
    <IconButton
      icon="chatbubble-ellipses-outline"
      label={t('message')}
      tone="accent"
      loading={start.isPending}
      onPress={() => {
        if (!canMessageOnPlatform) {
          toast.showInfo(t('messageUnavailable'));
          return;
        }
        start.mutate(requestId, {
          onSuccess: (conversation) =>
            navigateOnce(ROUTES.manage.chatThread(conversation.id, requestId)),
          onError: (err) => toast.showError(errorMessage(err)),
        });
      }}
    />
  );
}
