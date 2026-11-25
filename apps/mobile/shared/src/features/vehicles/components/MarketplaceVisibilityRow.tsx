import { useState } from 'react';
import { Switch } from 'react-native';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isLogoOnlyGate, packageShopListingGateFrom } from '@xeprime/domain';
import {
  MARKETPLACE_VISIBILITY_REASON,
  MARKETPLACE_VISIBILITY_REASON_META,
  PERMISSION,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  type MarketplaceVisibilityReason,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { metaColor, metaLabel } from '@/lib/status-meta';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { InfoHint } from '@/components/ui/InfoHint';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
// Lỗi hạn mức gói (ADR 0065) nói đúng loại xe + con số thay cho câu chung — như web.
import { usePlanAwareErrorMessage } from '@/features/subscription/plan-quota-gate';
import { useDomainLabel } from '@/i18n/domain';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES, SHOP_SECTION } from '@/navigation/routes';
import { themed, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { useSetVehicleMarketplaceVisibility } from '../hooks/use-vehicle';
import type { VehicleDetail } from '../api';

/** Màu rãnh công tắc — cùng bảng với `PolicySwitch` của khu chính sách thuê. */
const useSwitchTrack = themed((colors) => ({ false: colors.borderInput, true: colors.primary }));

/**
 * Hàng "Trên chợ" ở ĐẦU hồ sơ xe — câu trả lời đầu tiên cho "xe của tôi có đang bán không"
 * (ADR 0048). Bản native của `MarketplaceVisibilitySwitch` bên web.
 *
 * ## Vì sao nó nằm ở đây chứ không ở thẻ xét duyệt phía dưới
 *
 * Bản đầu của chính ADR này đặt công tắc trong thẻ "Duyệt & hiển thị trên chợ" gần cuối trang.
 * Đó là chỗ đúng về mặt phân loại và sai về mặt sử dụng: chủ xe phải cuộn qua tiền, thông số,
 * giấy tờ và lịch sử mới biết xe có đang hiện hay không — trong khi đây là thứ họ kiểm tra
 * thường xuyên nhất. Nó lên đầu, và **chỉ có ở đây**: hai công tắc cho cùng một trạng thái trên
 * cùng một màn là hai chỗ để lệch nhau.
 *
 * ## Chưa duyệt thì KHÔNG vẽ một công tắc xám
 *
 * Một công tắc mờ mời người ta chạm rồi không làm gì. Xe chưa qua cổng duyệt hiện một VIÊN trạng
 * thái đọc theo nghĩa "xe có ngoài chợ không" (`Chưa hiển thị` · `Đang chờ duyệt` · …), còn việc
 * cần làm để đổi điều đó nằm ở thẻ "Việc cần làm" — nơi có chỗ cho một nút thật.
 *
 * Nhãn của viên đó cố ý KHÁC `Domain.vehiclePublicStatus` (đọc theo trục quy trình duyệt: "Nháp")
 * — cùng một mã, hai câu hỏi. MÀU thì vẫn lấy từ bảng meta dùng chung.
 *
 * ## Không có trạng thái mờ nào khác
 *
 * Với xe ĐÃ DUYỆT, công tắc bật được trừ khi người dùng thiếu quyền (lúc đó chỉ còn phần chữ —
 * không vẽ nút cho một hành động không mở). Gian hàng bị khoá, hồ sơ mặt tiền thiếu: backend trả
 * mã lỗi kèm câu giải thích ĐÚNG LÚC người dùng cần nó, thay vì một dòng luật nội bộ đứng sẵn ở
 * đầu màn. Và TẮT thì luôn được — một ô mờ ở đó sẽ khoá luôn quyền rút xe về.
 */
export function MarketplaceVisibilityRow({
  vehicle,
  compact = false,
}: {
  vehicle: VehicleDetail;
  /**
   * Dạng gọn của Chi tiết xe (Figma `_Toggle base` 36×20 ở mép phải dòng tên): chỉ công tắc (hoặc
   * viên trạng thái khi xe chưa duyệt / bị hệ thống ẩn), nhãn "Trên chợ" thành tên trợ năng.
   */
  compact?: boolean;
}) {
  const colors = useColors();
  const SWITCH_TRACK = useSwitchTrack();
  const t = useTranslations('Vehicles.publish.visibility');
  const toast = useAppToast();
  const errorMessage = usePlanAwareErrorMessage();
  const { has } = usePermissions();
  const toggle = useSetVehicleMarketplaceVisibility(vehicle.id);
  const tGate = useTranslations('Shop.listingGate');
  const tActions = useTranslations('Common.actions');
  const navigateOnce = useNavigateOnce();
  /**
   * Bật lại chợ chạm cổng mặt tiền gian hàng tuyến gói (ADR 0048 · ADR 0040 điều 7) — gần như luôn
   * là thiếu LOGO. Toast không chứa được lối đi tiếp, nên đây là hộp thoại nói rõ thiếu gì và dẫn
   * thẳng tới hồ sơ gian hàng — đúng `showListingGate` của web.
   */
  const [listingGate, setListingGate] =
    useState<ReturnType<typeof packageShopListingGateFrom>>(null);

  /**
   * Vị trí công tắc trong lúc CHỜ server — `null` nghĩa là đang đọc thẳng giá trị của server.
   *
   * `Switch` của React Native KHÔNG phải một component thuần điều khiển về mặt hình ảnh: nó tự
   * chạy hoạt ảnh theo ngón tay ngay khi chạm, rồi React render lại bằng giá trị CŨ (mutation
   * chưa về) nên nó gạt ngược lại, và khi server trả mới gạt lần thứ hai. Người dùng thấy đúng
   * hai lần sai trước khi tới nơi (báo 24/09/2026).
   *
   * Giữ chốt này CHỈ trong lúc bay, không ghi lạc quan vào cache: dòng CHỮ cạnh công tắc vẫn nói
   * sự thật của server (một chiếc xe bật lên mà gian hàng đang khoá thì nó KHÔNG ra chợ), còn cái
   * người dùng vừa gạt thì nằm yên ở chỗ họ gạt.
   */
  const [pending, setPending] = useState<boolean | null>(null);

  const status = vehicle.publicStatus as VehiclePublicStatus;
  const approved = status === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  // Cùng permission với gửi duyệt: ai được đưa xe ra chợ thì được rút xe về (xem controller).
  const canManage = has(PERMISSION.VEHICLE_SUBMIT_PUBLIC);

  if (!approved) {
    if (compact) {
      return (
        <StatusBadge
          label={t(`moderationTag.${status}`)}
          color={metaColor(VEHICLE_PUBLIC_STATUS_META, status)}
          size="sm"
        />
      );
    }
    return (
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('label')}
        </Text>
        <StatusBadge
          label={t(`moderationTag.${status}`)}
          color={metaColor(VEHICLE_PUBLIC_STATUS_META, status)}
          size="sm"
        />
      </XStack>
    );
  }

  function onChange(next: boolean) {
    setPending(next);
    toggle.mutate(next, {
      onSuccess: () => {
        // Cache đã mang giá trị mới (hook ghi `setQueryData` trước callback này) ⇒ nhả chốt.
        setPending(null);
        toast.showSuccess(next ? t('enabled') : t('disabled'));
      },
      onError: (error) => {
        /*
         * Nhả chốt là công tắc TRỞ VỀ giá trị server — đúng ý ban đầu: một lượt bật bị ba cổng
         * của server từ chối phải kết thúc ở chỗ cũ, chứ không nằm lại chỗ người dùng vừa gạt.
         */
        setPending(null);
        const gate = packageShopListingGateFrom(error);
        if (gate) setListingGate(gate);
        else toast.showError(errorMessage(error));
      },
    });
  }

  return (
    <XStack ai="center" jc="space-between" gap={space.sm}>
      {compact ? null : (
        <XStack ai="center" gap={4} flexShrink={1}>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('label')}
          </Text>
          <InfoHint label={t('hintLabel')} content={t('hint')} />
        </XStack>
      )}
      <XStack ai="center" gap={space.xs}>
        {/* Dạng gọn: chỉ nói thêm khi xe KHÔNG ra chợ dù đã bật (lý do server suy) - còn lại công tắc đã đủ. */}
        {compact && canManage && (vehicle.isMarketplaceVisible || !vehicle.marketplaceEnabled) ? null : (
          <MarketplaceState vehicle={vehicle} />
        )}
        {canManage ? (
          compact ? (
            /* Chi tiết xe: Figma `_Toggle base` 36×20 (cỡ sm). */
            <ToggleSwitch
              size="sm"
              value={pending ?? vehicle.marketplaceEnabled}
              onValueChange={onChange}
              disabled={toggle.isPending}
              accessibilityLabel={t('ariaLabel', { name: vehicle.name })}
            />
          ) : (
            <Switch
              value={pending ?? vehicle.marketplaceEnabled}
              onValueChange={onChange}
              // Khoá trong lúc gọi để một cú chạm kép không bắn hai lượt ngược chiều nhau.
              disabled={toggle.isPending}
              accessibilityLabel={t('ariaLabel', { name: vehicle.name })}
              trackColor={SWITCH_TRACK}
              thumbColor={colors.surface}
              ios_backgroundColor={colors.borderInput}
            />
          )
        ) : null}
      </XStack>
      <AlertDialog
        open={listingGate !== null}
        title={t('gate.title')}
        message={listingGate && isLogoOnlyGate(listingGate) ? t('gate.logoOnly') : t('gate.missing')}
        body={
          listingGate && !isLogoOnlyGate(listingGate) ? (
            <YStack gap={2}>
              {listingGate.map((key) => (
                <Text key={key} col={colors.textMuted} fos={fontSize.bodySm}>
                  {`• ${tGate(`items.${key}`)}`}
                </Text>
              ))}
            </YStack>
          ) : null
        }
        confirmLabel={
          listingGate && isLogoOnlyGate(listingGate) ? tGate('ctaLogo') : tGate('cta')
        }
        cancelLabel={tActions('close')}
        onConfirm={() => {
          setListingGate(null);
          navigateOnce(ROUTES.manage.shop({ section: SHOP_SECTION.PROFILE }));
        }}
        onCancel={() => setListingGate(null)}
      />
    </XStack>
  );
}

/**
 * Trạng thái hiện tại bằng CHỮ, cạnh công tắc — một công tắc bật/tắt không tự nói được nó đang
 * ở đâu với người dùng đọc màn hình theo dòng.
 *
 * BA ca, không phải hai: một chiếc xe có `marketplaceEnabled = true` mà vẫn không ra chợ (gian
 * hàng đang khoá) thì "Đang hiển thị" là một câu SAI. Ca đó mượn nhãn của chính lý do server đã
 * suy (`marketplaceVisibilityReason`) thay vì bịa thêm một câu thứ tư.
 */
function MarketplaceState({ vehicle }: { vehicle: VehicleDetail }) {
  const colors = useColors();
  const t = useTranslations('Vehicles.publish.visibility');
  const domainLabel = useDomainLabel();
  const reason = vehicle.marketplaceVisibilityReason as MarketplaceVisibilityReason;

  /*
   * Tắt vì HẾT SUẤT GÓI (ADR 0085 điều 5) không phải "Đang tắt" của chủ xe: nói đúng lý do để họ biết
   * bật lại cần một suất trống, không phải chỉ một cú bấm. Như web.
   */
  if (!vehicle.marketplaceEnabled && reason !== MARKETPLACE_VISIBILITY_REASON.PLAN_PAUSED) {
    return (
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t('off')}
      </Text>
    );
  }

  if (vehicle.isMarketplaceVisible) {
    return (
      <Text col={colors.success} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {t('on')}
      </Text>
    );
  }

  return (
    <StatusBadge
      label={domainLabel(
        'marketplaceVisibility',
        reason,
        metaLabel(MARKETPLACE_VISIBILITY_REASON_META, reason),
      )}
      color={metaColor(MARKETPLACE_VISIBILITY_REASON_META, reason)}
      size="sm"
    />
  );
}
