import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION } from '@xeprime/types';
import { packageShopListingGateFrom } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { InfoHint } from '@/components/ui/InfoHint';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ShopListingGateAlert } from '@/features/shop/components/ShopListingGateAlert';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { vehicleEditHref } from '../workspace-links';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { useSubmitVehiclePublic } from '../hooks/use-vehicle';
import {
  publicationEditTab,
  type VehiclePublicationAction,
  type VehiclePublicationTask,
} from '../publication';
import type { VehicleDetail } from '../api';

/** Số mục còn thiếu nêu THẲNG trong thẻ; phần dư đếm số, chi tiết nằm sau dấu "i". */
const MISSING_PREVIEW = 2;

/** Vạch mép trái theo mức độ — cùng ngôn ngữ thẻ với khu quản lý. */
const TONE_COLOR = {
  critical: colors.danger,
  warning: colors.warning,
  info: colors.info,
} as const;

/**
 * MỘT việc "đưa xe lên chợ", nằm trong thẻ "Việc cần làm" ở đầu hồ sơ xe — bản native của
 * `apps/web/src/features/vehicles/components/VehiclePublicationTaskItem.tsx`.
 *
 * Trước 23/09/2026 thẻ này chỉ đọc cảnh báo do server tính, và server không biết gì về checklist
 * đăng chợ ngoài hai cảnh báo thô (`public_action_required`, `missing_vehicle_info`) — cả hai chỉ
 * có TIÊU ĐỀ, không có nút. Kết quả: một chiếc xe còn là nháp hiện "Không có việc cần làm", còn
 * hành động thật thì nằm ở cuối màn.
 *
 * Việc ở đây có NÚT THẬT, vì màn chi tiết có trong tay cả bản ghi xe: gửi duyệt gọi thẳng
 * mutation, hoàn tất hồ sơ mở đúng mục còn thiếu, bật hiển thị đưa người dùng tới chính công tắc
 * ở đầu màn. Đổi lại, `TodoCard` phải LỌC hai cảnh báo server nói trùng — xem chỗ gọi.
 *
 * Quyền: chỉ NÚT mới gác theo quyền. Câu mô tả tình trạng thì ai đọc được hồ sơ xe đều thấy —
 * "xe này chưa lên chợ" không phải bí mật với người đã vào được màn.
 */
export function VehiclePublicationTaskItem({
  vehicle,
  task,
  onEnableMarketplace,
  onViewStatus,
  customerScope = false,
}: {
  vehicle: VehicleDetail;
  task: VehiclePublicationTask;
  /**
   * Đưa người dùng tới chính công tắc ở đầu màn (web neo bằng `#anchor`).
   *
   * KHÔNG bật hộ từ đây: đó sẽ là chỗ ghi thứ hai cho cùng một trạng thái, và người dùng không
   * nhìn thấy cái công tắc vừa đổi.
   */
  onEnableMarketplace?: () => void;
  /**
   * Cuộn tới thẻ xét duyệt trong CÙNG màn — bản native của liên kết `#${REVIEW_PANEL_ANCHOR}` bên
   * web. Không truyền thì không vẽ nút: một nút không đưa đi đâu tệ hơn không có nút.
   */
  onViewStatus?: () => void;
  /**
   * Màn đang mở từ khu TÀI KHOẢN (chủ xe tuyến hoa hồng — `/account/vehicles/[id]`). Web chọn
   * đích hỗ trợ theo khu làm việc (`useWorkspace().paths.support`): `/account/support` ở khu tài
   * khoản, `/manage/support` ở cổng quản lý.
   */
  customerScope?: boolean;
}) {
  const t = useTranslations('Vehicles.publish.task');
  const tPublish = useTranslations('Vehicles.publish');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const navigateOnce = useNavigateOnce();
  const submit = useSubmitVehiclePublic(vehicle.id);

  /**
   * Hồ sơ GIAN HÀNG còn thiếu gì (ADR 0040) — `null` = không phải lỗi đó.
   *
   * Giữ trong state thay vì đọc từ `submit.error`: dải này phải ĐỨNG LẠI cho tới khi người dùng
   * sửa xong (họ sẽ rời sang màn hồ sơ để tải logo rồi quay về), còn `submit.error` biến mất
   * ngay khi mutation được gọi lại. Và nó phải tự dọn khi lượt gửi kế tiếp đi qua được.
   */
  const [listingGate, setListingGate] =
    useState<ReturnType<typeof packageShopListingGateFrom>>(null);

  const canSubmit = has(PERMISSION.VEHICLE_SUBMIT_PUBLIC);
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);

  function onSubmit() {
    submit.mutate(undefined, {
      onSuccess: () => {
        setListingGate(null);
        toast.showSuccess(t('submitted'));
      },
      onError: (error) => {
        // Cổng hồ sơ gian hàng có một dải RIÊNG vì nó cần một đường đi tiếp. Mọi lỗi khác vẫn là
        // một toast — chúng không có lối đi nào ngoài "thử lại".
        const gate = packageShopListingGateFrom(error);
        setListingGate(gate);
        if (!gate) toast.showError(errorMessage(error));
      },
    });
  }

  const missingLabels = task.missing.map((key) =>
    tPublish(`requirements.${key}` as 'requirements.plateNumber'),
  );
  const preview = missingLabels.slice(0, MISSING_PREVIEW);
  const overflow = missingLabels.length - preview.length;

  function action(spec: VehiclePublicationAction | null, isPrimary: boolean) {
    if (!spec) return null;
    const label = t(`actions.${spec.cta}`);
    const variant = isPrimary ? 'primary' : 'secondary';

    switch (spec.kind) {
      case 'submit':
        return canSubmit ? (
          <Button
            label={label}
            size="sm"
            variant={variant}
            block={false}
            loading={submit.isPending}
            onPress={onSubmit}
          />
        ) : null;
      case 'edit':
        return canEdit ? (
          <Button
            label={label}
            size="sm"
            variant={variant}
            block={false}
            onPress={() =>
              navigateOnce(
                vehicleEditHref(vehicle.id, publicationEditTab(task.missing), customerScope),
              )
            }
          />
        ) : null;
      case 'enableMarketplace':
        // Đưa tới chính công tắc thay vì bật hộ từ đây: một hành động, một chỗ bấm.
        return canSubmit && onEnableMarketplace ? (
          <Button
            label={label}
            size="sm"
            variant={variant}
            block={false}
            onPress={onEnableMarketplace}
          />
        ) : null;
      case 'viewStatus':
        // Không gác quyền — đúng như web: đọc tình trạng xét duyệt là việc của mọi người xem hồ sơ.
        return onViewStatus ? (
          <Button label={label} size="sm" variant={variant} block={false} onPress={onViewStatus} />
        ) : null;
      case 'contactSupport':
        // `hidden` không có đường tự phục vụ nào (ADR 0048 điều 4) — lối duy nhất là hỗ trợ.
        return (
          <Button
            label={label}
            size="sm"
            variant={variant}
            block={false}
            onPress={() =>
              navigateOnce(customerScope ? ROUTES.account.support() : ROUTES.manage.support())
            }
          />
        );
    }
  }

  const primary = action(task.primary, true);
  const secondary = action(task.secondary, false);

  return (
    <XStack
      gap={space.sm}
      p={space.sm}
      br={radius.sm}
      bg={colors.surfaceMuted}
      borderLeftWidth={3}
      borderLeftColor={TONE_COLOR[task.tone]}
    >
      <YStack f={1} gap={space.xs}>
        <XStack ai="center" gap={4} flexWrap="wrap">
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold} flexShrink={1}>
            {t(`${task.key}.title`)}
          </Text>
          {/*
            Dấu "i" CHỈ khi danh sách bị cắt bớt. Không cắt thì dòng tóm tắt đã nói đủ, và một
            tấm trượt lặp lại đúng câu đó là bắt người dùng chạm một lần cho không gì cả.
          */}
          {overflow > 0 ? (
            <InfoHint
              label={t('missingHintLabel')}
              content={t('missingHint', { list: missingLabels.join(', ') })}
            />
          ) : null}
        </XStack>

        {/*
          Mô tả NGẮN, một dòng: thẻ này đứng cạnh việc bảo dưỡng và giấy tờ, nên một đoạn văn ở
          đây đẩy mọi thứ khác xuống dưới nếp gấp. Danh sách điều kiện đầy đủ nằm sau dấu "i" ở
          trên, và bản checklist đánh dấu từng mục vẫn ở thẻ xét duyệt phía dưới.
        */}
        <Text col={colors.textMuted} fos={fontSize.label}>
          {missingLabels.length > 0
            ? t('missingSummary', { list: preview.join(', '), count: overflow })
            : t(`${task.key}.description`)}
        </Text>

        {/* Câu NGƯỜI DUYỆT viết — đi qua nguyên văn, không dịch được. */}
        {task.reason ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {task.reason}
          </Text>
        ) : null}

        {listingGate ? <ShopListingGateAlert missing={listingGate} /> : null}

        {primary || secondary ? (
          <XStack gap={space.xs} flexWrap="wrap">
            {primary}
            {secondary}
          </XStack>
        ) : null}
      </YStack>
    </XStack>
  );
}
