import { useState } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { canHostCancelTrip, type CustomerTripStage } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ApproveRequestSheet } from '@/features/booking-requests/components/ApproveRequestSheet';
import { CancelRequestSheet } from '@/features/booking-requests/components/CancelRequestSheet';
import { RejectRequestSheet } from '@/features/booking-requests/components/RejectRequestSheet';
import {
  useApproveBookingRequest,
  useCancelBookingRequest,
  useRejectBookingRequest,
} from '@/features/booking-requests/hooks/use-booking-requests';
import type {
  BookingRequestDecisionTarget,
  CancelBookingRequestInput,
} from '@/features/booking-requests/api';
import { cancelErrorKey, decisionErrorKey } from '@/features/booking-requests/decision-error';
import { getErrorCode } from '@/lib/api-client';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { tripToDecisionTarget } from '../decision-target';
import type { CustomerTripDetail } from '../api';

/**
 * Quyết định của CHỦ XE trên một chuyến chưa thành đơn, ở màn chi tiết chuyến — bản native của
 * `TripHostDecisions`.
 *
 * Là component RIÊNG chứ không phải một nhánh `if` trong `TripDetailScreen`: nó cầm ba mutation
 * và bốn tấm trượt, mà hook thì không gọi có điều kiện được. Để trong màn cha nghĩa là mọi người
 * xem — kể cả khách đang mở chuyến mình đi thuê — đều phải dựng cả cụm đó.
 *
 * ## HAI chặng, hai bộ nút hoàn toàn khác nhau
 *
 * Trước ADR 0045, màn này hỏi `respondBy != null` rồi bày "Duyệt"/"Từ chối". Từ ADR 0044,
 * `respondBy` vẫn còn nguyên SAU khi chủ xe đã nhận chuyến — nên chính họ nhìn thấy nút "Duyệt"
 * cho một chuyến mình duyệt rồi, và bấm vào chỉ nhận một lỗi khó hiểu từ server.
 *
 * Chặng nói đúng bóng đang ở chân ai:
 *
 *   · `pending_approval` (+ `pending_approval_paid` LEGACY ADR 0039) — chủ xe còn phải quyết:
 *     **Duyệt** hoặc **Từ chối**;
 *   · `awaiting_hold` — đã nhận, bóng ở chân khách. Việc chính là ĐỢI, và lối duy nhất còn lại
 *     là **Huỷ chuyến** (ADR 0045 điều 1).
 *
 * Cổng `canHostDecideTrip` nằm ở nơi GỌI; ở đây chỉ còn phép phân nhánh giữa hai bộ nút.
 *
 * Không kiểm permission ở đây: `role = host` chỉ do server đặt cho **chủ** gian hàng sở hữu xe
 * của chuyến (`CustomerTripsService.resolveScope`), và vai đó có sẵn toàn bộ quyền tenant. Cửa
 * chặn thật vẫn là guard của `POST /booking-requests/:id/approve` và `/cancel`.
 *
 * Quá hạn thì `ApproveRequestSheet` tự khoá nút xác nhận theo `respondBy` — cùng vị từ server
 * dùng, nên hai phía không nói hai câu khác nhau.
 */
export function TripHostDecisions({
  trip,
  onApproved,
}: {
  trip: CustomerTripDetail;
  /**
   * Báo lên màn CHA bản ghi server trả về sau lượt duyệt.
   *
   * Tấm kết quả KHÔNG dựng ở đây, và đó là một ràng buộc về VÒNG ĐỜI chứ không phải sở thích bố
   * cục: chính component này bị gác bằng `canHostDecideTrip(stage)`, mà lượt duyệt vừa làm
   * `stage` đổi — nhánh không thu giữ chỗ đi thẳng sang `ready`. Hook duyệt invalidate nhánh
   * `trips`, màn chi tiết refetch, cổng trả `false`, cả cụm này unmount — và tấm "Đã tạo đơn
   * thuê" biến mất cùng nó, mang theo lối DUY NHẤT sang đơn vừa tạo.
   */
  onApproved: (approved: BookingRequestDecisionTarget) => void;
}) {
  const t = useTranslations('Trips.host');
  const tRequests = useTranslations('BookingRequests');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const approve = useApproveBookingRequest();
  const reject = useRejectBookingRequest();
  const cancel = useCancelBookingRequest();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  /** Chuyến ĐÃ NHẬN đang chờ huỷ (ADR 0045 điều 1) — khác hẳn `rejecting` về đường tiền. */
  const [cancelling, setCancelling] = useState(false);
  const target = tripToDecisionTarget(trip);
  /* Đã nhận chuyến ⇒ không còn gì để duyệt, chỉ còn một lối thoát. */
  const accepted = canHostCancelTrip(trip.stage as CustomerTripStage);

  /** Lỗi quyết định → câu có LỐI ĐI TIẾP; `null` thì rơi về ánh xạ chung theo MÃ. */
  function decisionError(error: unknown): string {
    const key = decisionErrorKey(getErrorCode(error));
    return key ? tRequests(key) : errorMessage(error);
  }

  function confirmApprove(body?: Parameters<typeof approve.mutate>[0]['body']) {
    approve.mutate(
      { id: target.id, ...(body ? { body } : {}) },
      {
        /*
         * Không toast: `approve.success` nói "đã tạo đơn thuê", SAI ở nhánh mặc định của luồng
         * mới. Tấm trượt tự nói đúng cả hai kết cục từ chính bản ghi server trả về.
         */
        onSuccess: (approved) => {
          setApproving(false);
          onApproved(approved);
        },
        onError: (error) => toast.showError(decisionError(error)),
      },
    );
  }

  function confirmCancel(body: CancelBookingRequestInput) {
    cancel.mutate(
      { id: target.id, body },
      {
        onSuccess: () => {
          toast.showSuccess(tRequests('cancel.success'));
          setCancelling(false);
        },
        /*
         * Cuộc đua với đồng tiền: khách chuyển khoản đúng lúc chủ xe đang mở tấm trượt ⇒ webhook
         * thắng, yêu cầu đã thành đơn thuê, và lệnh huỷ này không claim được gì (409). Câu chung
         * ("có lỗi xảy ra") sẽ khiến họ bấm lại vài lần rồi gọi hỗ trợ.
         */
        onError: (error) => {
          const key = cancelErrorKey(getErrorCode(error));
          toast.showError(key ? tRequests(key) : errorMessage(error));
        },
      },
    );
  }

  function confirmReject(reason: string) {
    reject.mutate(
      { id: target.id, reason },
      {
        onSuccess: () => {
          toast.showSuccess(tRequests('reject.success'));
          setRejecting(false);
        },
        onError: (error) => toast.showError(decisionError(error)),
      },
    );
  }

  return (
    <>
      <Card>
        <YStack gap={space.sm}>
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
            {accepted ? t('acceptedTitle') : t('decisionTitle')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {accepted ? t('acceptedHint') : t('decisionHint')}
          </Text>
          {/*
            Đã nhận rồi thì KHÔNG còn nút duyệt: bóng ở chân khách, và việc chính của chủ xe là
            đợi. Nút huỷ đứng một mình, tông cảnh báo — nó là lối thoát hiếm dùng, không phải
            hành động thường ngày của chặng này.
          */}
          {accepted ? (
            <Button
              label={t('cancel')}
              variant="danger"
              icon="close-circle-outline"
              onPress={() => setCancelling(true)}
            />
          ) : (
            <>
              <Button
                label={t('approve')}
                size="lg"
                icon="checkmark-circle-outline"
                onPress={() => setApproving(true)}
              />
              <Button
                label={t('reject')}
                variant="secondary"
                icon="close-circle-outline"
                onPress={() => setRejecting(true)}
              />
            </>
          )}
        </YStack>
      </Card>

      {/* Gắn CÓ ĐIỀU KIỆN — `defaultValues` của tấm trượt chỉ đọc lúc dựng. */}
      {approving ? (
        <ApproveRequestSheet
          open
          onClose={() => setApproving(false)}
          request={target}
          onConfirm={confirmApprove}
          loading={approve.isPending}
        />
      ) : null}

      {rejecting ? (
        <RejectRequestSheet
          open
          onClose={() => setRejecting(false)}
          request={target}
          onConfirm={confirmReject}
          loading={reject.isPending}
        />
      ) : null}

      {cancelling ? (
        <CancelRequestSheet
          open
          onClose={() => setCancelling(false)}
          request={target}
          onConfirm={confirmCancel}
          loading={cancel.isPending}
        />
      ) : null}
    </>
  );
}
