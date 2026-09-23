import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { chatApi } from '@/features/chat/api';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { isUnauthenticated } from '@/lib/api-client';
import { ROUTES } from '@/navigation/routes';

/**
 * Nút "Nhắn shop" — mở/lấy hội thoại với gian hàng của một chiếc xe rồi vào thẳng thread.
 *
 * Không cần chống double-tap: endpoint idempotent theo (khách, xe) và bất biến đó là unique ở DB
 * (`conversations_customer_vehicle_key`), nên mười cú chạm vẫn ra đúng một thread. Nút vẫn khoá
 * lúc đang gửi — để tránh mười request thừa, không phải để tránh mười thread.
 *
 * `vehicleId` đi TIẾP sang thread như ngữ cảnh đang chờ (vai của `?v=` bên web): hội thoại thuộc
 * về GIAN HÀNG — một thread cho mọi xe của shop — nên chiếc xe phải đi kèm riêng để ô soạn tin
 * gắn được thẻ vào câu đầu tiên.
 */
export function ChatWithShopButton({
  vehicleId,
  shopSlug,
  label,
  variant = 'secondary',
  size,
  iconOnly = false,
  iconTone = 'primary',
  onNavigate,
}: {
  /** Mở hội thoại VỀ MỘT XE. Loại trừ nhau với `shopSlug` — truyền đúng một trong hai. */
  vehicleId?: string;
  /**
   * Mở hội thoại với GIAN HÀNG, cho màn gian hàng nơi chưa có chiếc xe nào được chọn.
   *
   * Lối này có từ khi trang gian hàng bỏ số điện thoại (ADR 0038): liên hệ đi qua hộp thư trong
   * ứng dụng — có danh tính hai đầu, có lịch sử — thay vì đăng số riêng của chủ xe lên một trang
   * không cần đăng nhập.
   */
  shopSlug?: string;
  /** Nhãn theo ngữ cảnh — trang xe dùng "Nhắn shop", màn chuyến dùng "Liên hệ gian hàng". */
  label?: string;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  /**
   * Chỉ biểu tượng, không chữ — cho hàng TÊN của trang gian hàng.
   *
   * Cùng một hành động nên vẫn là component này, không phải một nút thứ hai dựng riêng:
   * toàn bộ phần khó (idempotent theo khách+xe, nhánh chưa đăng nhập, điều hướng vào thread)
   * nằm ở đây, và một bản sao chỉ để đổi hình dáng là một bản sao sẽ trôi.
   *
   * `label` vẫn BẮT BUỘC có nghĩa: nó thành nhãn cho trình đọc màn hình. Một nút chỉ có hình
   * mà không có nhãn là một nút câm với người không nhìn thấy nó.
   */
  iconOnly?: boolean;
  /**
   * Sắc của dạng chỉ-icon. `primary` (vàng đặc) khi nó đứng trên nền trang; `surface` khi nó
   * NỔI TRÊN ẢNH — ở đó một vòng tròn vàng chọi với ảnh bìa, còn vòng tròn trắng thì đọc
   * được trên mọi bức ảnh và ghép cặp với nút quay lại ngay đối diện.
   */
  iconTone?: 'primary' | 'surface' | 'accent';
  /**
   * Gọi NGAY TRƯỚC khi rời màn. Nơi gọi nằm trong một tấm trượt phải đóng nó lại ở đây — nếu
   * không nó treo trên màn chat vừa mở.
   */
  onNavigate?: () => void;
}) {
  const t = useTranslations('Chat');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();

  const start = useMutation({
    mutationFn: () => chatApi.start(vehicleId ? { vehicleId } : { shopSlug: shopSlug ?? '' }),
    onSuccess: (conversation) => {
      onNavigate?.();
      navigateOnce(ROUTES.chat.thread(conversation.id, vehicleId));
    },
    onError: (error: unknown) => {
      /*
       * Chưa đăng nhập thì đưa tới màn đăng nhập, KHÔNG hiện câu lỗi kỹ thuật.
       *
       * Web mở modal ngay tại chỗ rồi tự chạy lại hành động; app không có modal đăng nhập nên
       * người dùng phải bấm lại sau khi vào. Kém một nhịp so với web, nhưng thà vậy còn hơn một
       * toast "401" ở một nút mà việc cần làm là đăng nhập.
       */
      if (isUnauthenticated(error)) {
        navigateOnce(ROUTES.account.login());
        return;
      }
      toast.showError(errorMessage(error));
    },
  });

  if (iconOnly) {
    return (
      <IconButton
        icon="chatbubble-ellipses"
        label={label ?? t('messageShop')}
        tone={iconTone}
        /* 20 là mặc định cho hình trên nền TRONG SUỐT; trên nền đặc nó tụt lại thành một
           chấm giữa vòng tròn, nên cần thêm hai điểm để cân quang học. */
        size={22}
        loading={start.isPending}
        onPress={() => start.mutate()}
      />
    );
  }

  return (
    <Button
      label={label ?? t('messageShop')}
      icon="chatbubble-ellipses-outline"
      variant={variant}
      {...(size ? { size } : {})}
      loading={start.isPending}
      onPress={() => start.mutate()}
    />
  );
}
