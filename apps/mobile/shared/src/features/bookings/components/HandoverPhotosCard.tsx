import { useState } from 'react';
import { YStack } from 'tamagui';
import { Card } from '@/components/ui/Card';
import { Text } from 'tamagui';
import { useTranslations } from 'use-intl';
import { HANDOVER_TYPE, PERMISSION, type HandoverType } from '@xeprime/types';
import { SectionCard } from '@/components/ui/SectionCard';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { HandoverPhotoGrid } from '@/features/handovers/components/HandoverPhotoGrid';
import {
  useHandoverContext,
  useSaveHandoverDraft,
} from '@/features/handovers/hooks/use-handovers';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import type { BookingDetail } from '../api';

/**
 * "THÔNG TIN BÀN GIAO" - bản native của web `HandoverPhotosCard` (Figma `23845:49956`): hai tab
 * (trước giao / sau nhận) ở đầu khối, lưới góc chụp bên dưới. Tải ảnh trước khi giao là soạn sẵn
 * biên bản nháp (tạo nháp đúng lúc chọn ảnh đầu tiên); sau khi đã xác nhận, tải thêm là BỔ SUNG
 * biên bản. Tab "Sau khi nhận xe" khoá tới khi đã giao xe.
 */
export function HandoverPhotosCard({ booking, closed }: { booking: BookingDetail; closed: boolean }) {
  const t = useTranslations('Bookings.detailPage.photos');
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.HANDOVER_VIEW);
  const handover = useHandoverContext(booking.id, canView).data;
  const pickupConfirmed = Boolean(handover?.pickup?.confirmedAt);
  // Tab mặc định theo chặng; chỉ khoá lựa chọn khi người dùng tự bấm (ngữ cảnh tải SAU lần dựng đầu).
  const [picked, setPicked] = useState<HandoverType | null>(null);
  const tab = picked ?? (pickupConfirmed ? HANDOVER_TYPE.RETURN : HANDOVER_TYPE.PICKUP);
  const saveDraft = useSaveHandoverDraft(booking.id, tab);
  if (!canView || !handover) return null;

  const current = tab === HANDOVER_TYPE.PICKUP ? handover.pickup : handover.return;
  const locked = tab === HANDOVER_TYPE.RETURN && !pickupConfirmed;

  return (
    // Figma `24158:103039`: không tiêu đề, tab xám "Trước khi giao / Sau khi nhận" ở đầu thẻ.
    <Card>
      <YStack gap={12}>
      <SegmentedTabs
        variant="neutral"
        value={tab}
        onChange={setPicked}
        items={[
          { key: HANDOVER_TYPE.PICKUP, label: t('before') },
          { key: HANDOVER_TYPE.RETURN, label: t('after') },
        ]}
      />
      {locked ? (
        <PhotoHint>{t('afterLocked')}</PhotoHint>
      ) : (
        <>
          <HandoverPhotoGrid
            key={tab}
            variant="row"
            disabled={closed}
            bookingId={booking.id}
            type={tab}
            vehicleType={booking.vehicleType}
            handover={current ?? null}
            {...(current
              ? {}
              : {
                  ensureHandover: async () => {
                    await saveDraft.mutateAsync({});
                  },
                })}
          />
          {/* Figma không có câu hướng dẫn dưới lưới ảnh (gỡ 20/11/2026); đơn đã khép vẫn báo chỉ-xem. */}
          {closed ? <PhotoHint>{t('readOnly')}</PhotoHint> : null}
        </>
      )}
      </YStack>
    </Card>
  );
}

/** Web `.photoHint`: 12 nghiêng màu phụ, cách trên `space-md` (cộng thêm khe của khối). */
function PhotoHint({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text col={colors.textMuted} fos={fontSize.bodySm} fontStyle="italic" mt={space.md}>
      {children}
    </Text>
  );
}
