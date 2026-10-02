import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { colors, fontSize, space } from '@/theme/tokens';

import type { PlanPurchaseState } from '../plan-purchase';
import { PlanPricingTable } from './PlanPricingTable';

/**
 * Câu chữ của màn gọi — mỗi luồng có ngữ cảnh riêng và nói khác nhau.
 *
 * Copy đi bằng PROP thay vì một `useTranslations` trong này: hai luồng dùng panel này thuộc hai
 * namespace khác nhau (`ShopOnboarding.checkout` cho onboarding gian hàng trả phí,
 * `Subscription.upgrade` cho luồng nâng cấp), và gom chúng về một namespace nghĩa là dời khoá —
 * thứ mà web cũng đang đọc. Cấu trúc dùng chung, câu chữ thuộc về nơi có ngữ cảnh.
 */
export interface PlanPickerCopy {
  /** Không tải được danh mục gói. */
  loadError: string;
  /** Không có bậc gói nào đang bán — lỗi cấu hình phía nền tảng, không phải lựa chọn của người dùng. */
  empty: string;
  emptyHint?: string;
  /** Nhãn nút hành động — bỏ trống khi nơi gọi tự dựng khu hành động của mình (`showSubmit`). */
  submit?: string;
  /** Vì sao nút đang mờ. */
  pickTermHint?: string;
}

/**
 * BỘ CHỌN GÓI + nút hành động — phần dùng CHUNG của mọi màn bán gói. Bản native của
 * `PlanPickerPanel` bên web.
 *
 * Trước đợt này cùng một thang trạng thái (đang tải → lỗi → danh mục rỗng → bảng giá + quy chế +
 * nút mờ kèm lời giải thích) tồn tại hai bản gần như y hệt ở `PackageShopCheckout` và ở bước 1
 * của luồng nâng cấp. Hai bản nghĩa là một lần sửa dải quy chế sàn hay câu "chưa có gói nào đang
 * bán" chỉ đúng với một nửa số người dùng.
 *
 * Panel KHÔNG sở hữu state: `usePlanPurchase` sống ở nơi gọi vì chính nơi đó cần `selection` để
 * quyết định bước kế tiếp (tạo hoá đơn ngay, hay mở form hồ sơ).
 */
export function PlanPickerPanel({
  plans,
  state,
  copy,
  submitting,
  errorText,
  showSubmit = true,
  onSubmit,
}: {
  /**
   * Kết quả của `useTenantPlans`. Khai theo HÌNH DẠNG cần dùng, không theo `UseQueryResult` đầy
   * đủ: panel chỉ đọc ba thứ, và một kiểu hẹp giữ cho nó test được mà không phải dựng query thật.
   */
  plans: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  state: PlanPurchaseState;
  copy: PlanPickerCopy;
  /** Đang gửi request của nơi gọi (tạo hoá đơn). */
  submitting: boolean;
  /** Lỗi của bước sau, hiện ngay trên bảng giá. `null` = không có gì để báo. */
  errorText: string | null;
  /**
   * Panel tự dựng nút hành động của nó.
   *
   * Mặc định BẬT: ở màn onboarding, nút đứng sẵn (mờ kèm câu giải thích) để người dùng thấy ngay
   * bước cuối là gì. Màn NÂNG CẤP tắt nó đi vì khu hành động ở đó là cả một dải có tổng tiền,
   * ghi chú bảo mật và bước kế tiếp — thứ chỉ nơi gọi biết cách dựng.
   */
  showSubmit?: boolean;
  onSubmit: () => void;
}) {
  const tCommon = useTranslations('Common.actions');

  if (plans.isLoading) return <MiniRowsSkeleton rows={6} />;

  if (plans.isError) {
    return (
      <Callout tone="danger" title={copy.loadError}>
        <Button
          label={tCommon('retry')}
          variant="secondary"
          size="sm"
          onPress={() => void plans.refetch()}
        />
      </Callout>
    );
  }

  /*
   * Danh mục không có bậc gói nào đang bán = lỗi cấu hình phía nền tảng, không phải lựa chọn của
   * người dùng. Nói thẳng thay vì hiện một bảng giá rỗng với một nút không bấm được.
   */
  if (state.tiers.length === 0) {
    return (
      <Callout tone="warning" title={copy.empty}>
        {copy.emptyHint ? <CalloutBody>{copy.emptyHint}</CalloutBody> : null}
      </Callout>
    );
  }

  return (
    <YStack gap={space.md}>
      {errorText ? <Callout tone="danger" title={errorText} /> : null}

      <PlanPricingTable state={state} />

      {/*
        Quy chế sàn là văn bản quy định phí dịch vụ và thứ tự hiển thị mà gian hàng đang mua —
        đây là khoảnh khắc nó bắt đầu ràng buộc họ (ADR 0028 điều 9).
      */}
      <LegalConsentNote place="subscription" />

      {showSubmit ? (
        <YStack gap={space.sm}>
          <Button
            label={copy.submit ?? ''}
            loading={submitting}
            disabled={!state.selection}
            onPress={onSubmit}
          />
          {/*
            Nút mờ phải nói VÌ SAO. Không có dòng này, người dùng chọn xong một bậc rồi thấy nút
            xám và không có cách nào biết mình còn thiếu một cú chạm vào thẻ kỳ hạn.
          */}
          {state.selection ? null : (
            <Text col={colors.textMuted} fos={fontSize.label} ta="center">
              {copy.pickTermHint}
            </Text>
          )}
        </YStack>
      ) : null}
    </YStack>
  );
}
