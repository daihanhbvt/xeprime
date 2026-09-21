import { useState } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ApproveRequestSheet } from '@/features/booking-requests/components/ApproveRequestSheet';
import { ApproveSuccessSheet } from '@/features/booking-requests/components/ApproveSuccessSheet';
import { RejectRequestSheet } from '@/features/booking-requests/components/RejectRequestSheet';
import {
  useApproveBookingRequest,
  useRejectBookingRequest,
} from '@/features/booking-requests/hooks/use-booking-requests';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { tripToDecisionTarget } from '../decision-target';
import type { CustomerTripDetail } from '../api';

/**
 * Hai quyết định của CHỦ XE trên một yêu cầu còn chờ, ở màn chi tiết chuyến — bản native của
 * `TripHostDecisions`.
 *
 * Là component RIÊNG chứ không phải một nhánh `if` trong `TripDetailScreen`: nó cầm hai mutation
 * và ba tấm trượt, mà hook thì không gọi có điều kiện được. Để trong màn cha nghĩa là mọi người
 * xem — kể cả khách đang mở chuyến mình đi thuê — đều phải dựng cả cụm đó.
 *
 * Không kiểm permission ở đây: `role = host` chỉ do server đặt cho **chủ** gian hàng sở hữu xe
 * của chuyến (`CustomerTripsService.resolveScope`), và vai đó có sẵn toàn bộ quyền tenant. Cửa
 * chặn thật vẫn là guard của `POST /booking-requests/:id/approve`.
 *
 * Quá hạn thì `ApproveRequestSheet` tự khoá nút xác nhận theo `respondBy` — cùng vị từ server
 * dùng, nên hai phía không nói hai câu khác nhau.
 */
export function TripHostDecisions({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips.host');
  const tRequests = useTranslations('BookingRequests');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const approve = useApproveBookingRequest();
  const reject = useRejectBookingRequest();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [approved, setApproved] = useState(false);

  const target = tripToDecisionTarget(trip);

  function confirmApprove(body?: Parameters<typeof approve.mutate>[0]['body']) {
    approve.mutate(
      { id: target.id, ...(body ? { body } : {}) },
      {
        onSuccess: () => {
          toast.showSuccess(
            target.longTermPackageMonths
              ? tRequests('approve.successLongTerm')
              : tRequests('approve.success'),
          );
          setApproving(false);
          setApproved(true);
        },
        onError: (error) => toast.showError(errorMessage(error)),
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
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  }

  return (
    <>
      <Card>
        <YStack gap={space.sm}>
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
            {t('decisionTitle')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('decisionHint')}
          </Text>
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

      {approved ? (
        <ApproveSuccessSheet request={target} onClose={() => setApproved(false)} />
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
    </>
  );
}
