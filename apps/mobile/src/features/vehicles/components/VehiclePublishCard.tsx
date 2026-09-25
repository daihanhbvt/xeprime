import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { VEHICLE_PUBLIC_STATUS, type VehiclePublicStatus } from '@xeprime/types';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { publicStatusPresentation, publishChecklist } from '../publication';
import type { VehicleDetail } from '../api';

const BANNER_TONE = {
  success: { fg: colors.success, bg: colors.successSurface },
  info: { fg: colors.info, bg: colors.infoSurface },
  warning: { fg: colors.warning, bg: colors.warningSurface },
  error: { fg: colors.danger, bg: colors.dangerSurface },
} as const;

/**
 * HỒ SƠ XÉT DUYỆT của một chiếc xe — thẻ TRA CỨU, không phải nơi hành động (23/09/2026, ADR 0048
 * điều 7). Bản native của `VehiclePublicReviewPanel`.
 *
 * ## Nó vừa mất hai thứ, và đó là điểm chính
 *
 * Trước đây thẻ này giữ nút "Gửi duyệt công khai", ở gần cuối một màn rất dài — hành động quan
 * trọng nhất của một chiếc xe nằm ở chỗ phải cuộn mới thấy, trong khi thẻ "Việc cần làm" ngay
 * đầu màn có thể đang nói "Không có việc cần làm".
 *
 * Giờ: công tắc hiển thị lên đầu màn (`MarketplaceVisibilityRow`), nút gửi duyệt vào thẻ Việc
 * cần làm (`VehiclePublicationTaskItem`). Thẻ này còn lại phần **tra cứu**: tình trạng hồ sơ,
 * checklist đánh dấu từng mục, mốc gửi và mốc duyệt. Không lặp lại CTA nào ở trên — hai nút cho
 * cùng một việc là hai chỗ để lệch nhau.
 *
 * ## Vì sao vẫn giữ checklist
 *
 * Thẻ Việc cần làm chỉ nêu vài mục còn thiếu rồi đẩy phần còn lại vào dấu "i" — nó phải ngắn vì
 * đứng cạnh việc bảo dưỡng và giấy tờ. Chủ xe muốn xem mình còn cách bao xa thì cần bản đầy đủ
 * có đánh dấu đạt/chưa đạt, và đây là chỗ của nó.
 *
 * Điều kiện lấy từ `publication.ts` — CÙNG bảng mà "Việc cần làm" đọc, nên hai chỗ không thể nói
 * một cái "đủ rồi" còn cái kia "còn thiếu".
 */
export function VehiclePublishCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.publish');
  const fmt = useAppFormat();

  const status = vehicle.publicStatus as VehiclePublicStatus;
  const approved = status === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;

  /**
   * Xe ĐÃ DUYỆT thì thẻ thu gọn sẵn — đúng `Collapse` mặc định đóng của bản web.
   *
   * Hồ sơ xét duyệt lúc đó là LỊCH SỬ, không phải việc đang làm: bày cả checklist bảy dòng đã
   * xanh hết ra là cho một khối đã xong chiếm cùng chỗ với những khối đang có việc, trên đúng
   * cái màn dài nhất của app.
   *
   * Khởi tạo MỘT LẦN từ `approved`, không đồng bộ lại theo prop: một chiếc xe được duyệt trong
   * lúc người dùng đang mở thẻ mà tự gập lại là giật mất thứ họ đang đọc.
   */
  const [collapsed, setCollapsed] = useState(approved);

  /*
   * Checklist chỉ gồm điều kiện ÁP DỤNG với xe này — giá kiểm theo dịch vụ xe đăng.
   *
   * Luật đến từ `@xeprime/types` (qua `publishChecklist`), CÙNG bảng mà backend dùng để từ chối
   * `submit-public`. Trước đợt này app giữ một bản chép tay thiếu mục `branchLocation`.
   */
  const checklist = publishChecklist(vehicle).map((item) => ({
    ...item,
    label: t(`requirements.${item.key}` as 'requirements.plateNumber'),
  }));

  const presentation = publicStatusPresentation(status);
  const tone = BANNER_TONE[presentation.type];
  const reason = vehicle.latestPublicReview?.reason;
  const review = vehicle.latestPublicReview;

  return (
    <Card>
      <YStack gap={space.sm}>
        {/*
          Tiêu đề đổi theo VAI của thẻ: "Tiến trình xét duyệt" khi hồ sơ còn đang chạy, "Thông
          tin xét duyệt" khi đã duyệt — lúc đó nó là lịch sử, không phải việc đang làm.

          Hàng tiêu đề CŨNG là công tắc thu/mở (`BlockTitle` lo mũi tên lật + vùng chạm cả hàng).
          Chỉ xe đã duyệt mới gập được: với xe chưa duyệt, checklist chính là thứ người ta mở màn
          để đọc, nên giấu nó sau một cú chạm là giấu nội dung chính.
        */}
        <BlockTitle
          {...(approved
            ? { collapsed, onToggleCollapsed: () => setCollapsed((open) => !open) }
            : {})}
        >
          {approved ? t('panel.titleApproved') : t('panel.title')}
        </BlockTitle>

        {collapsed ? null : (
          <>
            <YStack bg={tone.bg} br={radius.sm} p={space.sm} gap={2}>
              <Text col={tone.fg} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {t(`status.${presentation.key}.message`)}
              </Text>
              {/* `reason` là câu do người duyệt viết — đi qua nguyên văn, không dịch được. */}
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {presentation.useReason && reason
                  ? reason
                  : t(`status.${presentation.key}.description`)}
              </Text>
            </YStack>

            {/*
              Checklist hiện cho MỌI người đọc được hồ sơ xe, không còn gác sau `canSubmit`.

              "Xe còn thiếu gì để lên chợ" là thông tin, không phải một hành động — gác nó theo
              quyền GỬI DUYỆT nghĩa là nhân viên không có quyền đó nhìn thấy một thẻ trống rỗng và
              không có cách nào biết vì sao xe chưa bán được. Quyền chỉ gác NÚT, và nút thì đã rời
              khỏi thẻ này.
            */}
            <YStack gap={space.xs}>
              {checklist.map((item) => (
                <XStack key={item.key} ai="center" gap={space.xs}>
                  <Ionicons
                    name={item.met ? 'checkmark-circle' : 'close-circle-outline'}
                    size={iconSize.sm}
                    color={item.met ? colors.success : colors.textMuted}
                  />
                  <Text f={1} col={colors.text} fos={fontSize.bodySm}>
                    {item.label}
                  </Text>
                  {/* Chữ mang nghĩa, không phải icon — icon là trang trí nên trình đọc bỏ qua. */}
                  <Text
                    col={item.met ? colors.success : colors.textMuted}
                    fos={fontSize.label}
                    fow={fontWeight.medium}
                  >
                    {item.met ? t('panel.met') : t('panel.unmet')}
                  </Text>
                </XStack>
              ))}
            </YStack>

            {/*
              Mốc gửi / mốc duyệt — xe chưa từng gửi thì không có gì để kể, và một dòng "—" không
              nói gì cả.
            */}
            {review ? (
              <YStack gap={2}>
                <DataRow label={t('panel.submittedAt')} value={fmt.dateTime(review.submittedAt)} />
                {review.reviewedAt ? (
                  <DataRow label={t('panel.reviewedAt')} value={fmt.dateTime(review.reviewedAt)} />
                ) : null}
              </YStack>
            ) : null}
          </>
        )}
      </YStack>
    </Card>
  );
}
