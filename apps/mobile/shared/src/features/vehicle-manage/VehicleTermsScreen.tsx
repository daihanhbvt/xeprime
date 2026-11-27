import type { SubFormSave } from '@/hooks/use-report-dirty';
import { useTranslations } from 'use-intl';
import type { ServiceType } from '@xeprime/types';
import { BlockLink } from '@/components/ui/BlockTitle';
import { RentalConditionsCard } from '@/features/rental-policies/components/RentalConditionsCard';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';

/**
 * Thân "Thủ tục cho thuê" của MỘT xe sau ADR 0112 điều 3: giấy tờ và cách đối chiếu là LUẬT CHUẨN của
 * nền tảng (chỉ hiện), điều khoản thuê là của GIAN HÀNG cho mọi xe - sửa ở trang Chính sách thuê. Xe
 * không còn giấy tờ / cách đối chiếu / điều khoản riêng (cột theo xe thôi được đọc/ghi), nên khối này
 * không còn form hay nút Lưu. Cọc · hạn mức km nằm ở các thẻ mục chính sách của xe (web `PolicyPane`,
 * `ServicesPane`).
 *
 * Chữ ký giữ nguyên để các màn chứa cũ (nhận chuyến & thủ tục) không phải đổi.
 */
export function TermsBody({
  isManage = true,
}: {
  onDirtyChange?: (dirty: boolean) => void;
  registerSave?: (save: SubFormSave | null) => void;
  vehicleId: string;
  serviceType: ServiceType;
  canEdit: boolean;
  isManage?: boolean;
  showRules?: boolean;
}) {
  const tWorkspace = useTranslations('Shop.policies.workspace');
  const navigateOnce = useNavigateOnce();
  return (
    <RentalConditionsCard
      footer={
        isManage ? (
          <BlockLink
            label={tWorkspace('title')}
            onPress={() => navigateOnce(ROUTES.manage.shopPolicies())}
          />
        ) : null
      }
    />
  );
}
