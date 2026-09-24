'use client';

import { App, Switch, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import {
  MARKETPLACE_VISIBILITY_REASON_META,
  PERMISSION,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  type MarketplaceVisibilityReason,
  type VehiclePublicStatus,
} from '@xeprime/types';

import { InfoHint } from '@/components/data-display/InfoHint';
import { StatusTag } from '@/components/data-display/StatusTag';
import { usePermissions } from '@/hooks/use-permissions';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useSetVehicleMarketplaceVisibility } from '../hooks/use-vehicle-mutations';
import type { VehicleDetail } from '../types';
import styles from './MarketplaceVisibilitySwitch.module.css';

/**
 * Hàng "Trên chợ" ở CỘT THAO TÁC đầu trang hồ sơ xe — câu trả lời đầu tiên cho "xe của tôi có
 * đang bán không" (ADR 0048).
 *
 * ## Vì sao nó nằm ở đây chứ không ở thẻ xét duyệt phía dưới
 *
 * Bản đầu đặt công tắc trong thẻ "Duyệt & hiển thị trên chợ" gần cuối trang. Đó là chỗ đúng về
 * mặt phân loại và sai về mặt sử dụng: chủ xe phải cuộn qua tiền, thông số, giấy tờ và lịch sử
 * mới biết xe có đang hiện hay không — trong khi đây là thứ họ kiểm tra thường xuyên nhất. Nó
 * lên đầu, ngay trên "Chỉnh sửa"/"Xem lịch", và **chỉ có ở đây**: hai công tắc cho cùng một
 * trạng thái trên cùng một trang là hai chỗ để lệch nhau.
 *
 * ## Chưa duyệt thì KHÔNG vẽ một công tắc xám
 *
 * Một công tắc mờ mời người ta bấm rồi không làm gì. Xe chưa qua cổng duyệt hiện một THẺ trạng
 * thái đọc theo nghĩa "xe có ngoài chợ không" (`Chưa hiển thị` · `Đang chờ duyệt` · …), còn việc
 * cần làm để đổi điều đó nằm ở thẻ "Việc cần làm" — nơi có chỗ cho một nút thật.
 *
 * ## Không có trạng thái mờ nào khác
 *
 * Với xe ĐÃ DUYỆT, công tắc bật được trừ khi người dùng thiếu quyền (lúc đó chỉ còn cái thẻ —
 * không vẽ nút cho một hành động không mở). Gian hàng bị khoá, hồ sơ mặt tiền thiếu: backend
 * trả mã lỗi kèm câu giải thích ĐÚNG LÚC người dùng cần nó, thay vì một dòng luật nội bộ đứng
 * sẵn trong header. Và TẮT thì luôn được — một ô mờ ở đó sẽ khoá luôn quyền rút xe về.
 */
export function MarketplaceVisibilitySwitch({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.publish.visibility');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const toggle = useSetVehicleMarketplaceVisibility(vehicle.id);

  const status = vehicle.publicStatus as VehiclePublicStatus;
  const approved = status === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  // Cùng permission với gửi duyệt: ai được đưa xe ra chợ thì được rút xe về (xem controller).
  const canManage = has(PERMISSION.VEHICLE_SUBMIT_PUBLIC);

  /*
   * Xe chưa qua cổng duyệt: một THẺ, không phải một công tắc. Nhãn đọc theo trục "có ngoài chợ
   * không" (`Chưa hiển thị`) chứ không theo trục kiểm duyệt (`Nháp`) — trục kiểm duyệt đã có
   * thẻ riêng trong hàng trạng thái, và lặp lại đúng chữ đó ở đây không thêm gì.
   */
  if (!approved) {
    return (
      <div className={styles.row}>
        <span className={styles.label}>{t('label')}</span>
        {/*
          `Tag` trần chứ không `StatusTag`: MÀU vẫn lấy từ bảng meta dùng chung, nhưng NHÃN ở đây
          cố ý khác `Domain.vehiclePublicStatus`. Cùng một mã, hai câu hỏi — "hồ sơ đang ở đâu
          trong quy trình duyệt" (Nháp) và "khách có thấy xe không" (Chưa hiển thị). Đẩy câu thứ
          hai vào bảng Domain là đổi nhãn ở mọi màn đang hỏi câu thứ nhất.
        */}
        <Tag color={VEHICLE_PUBLIC_STATUS_META[status].color}>{t(`moderationTag.${status}`)}</Tag>
      </div>
    );
  }

  function onChange(next: boolean) {
    toggle.mutate(next, {
      onSuccess: () => message.success(next ? t('enabled') : t('disabled')),
      /*
       * Không cần khôi phục trạng thái cũ bằng tay: `checked` bám vào `vehicle` từ cache, và
       * mutation chỉ ghi cache khi server trả về thành công. Lỗi thì công tắc vẫn ở đúng chỗ cũ.
       */
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  return (
    <div className={styles.row}>
      <span className={styles.label} id={`${vehicle.id}-marketplace-label`}>
        {t('label')}
        <InfoHint label={t('hintLabel')} content={t('hint')} />
      </span>
      <MarketplaceState vehicle={vehicle} />
      {canManage ? (
        <Switch
          checked={vehicle.marketplaceEnabled}
          // `loading` che luôn việc bấm lặp: AntD bỏ qua sự kiện khi Switch đang loading.
          loading={toggle.isPending}
          onChange={onChange}
          aria-label={t('ariaLabel', { name: vehicle.name })}
          aria-describedby={`${vehicle.id}-marketplace-label`}
        />
      ) : null}
    </div>
  );
}

/**
 * Trạng thái hiện tại bằng CHỮ, cạnh công tắc — vì một công tắc bật/tắt không tự nói được nó
 * đang ở đâu với người dùng trình đọc màn hình đọc theo dòng.
 *
 * Ba ca, không phải hai: một chiếc xe có `marketplace_enabled = true` mà vẫn không ra chợ (gian
 * hàng đang khoá) thì "Đang hiển thị" là một câu SAI. Ca đó mượn nhãn của chính lý do mà server
 * đã suy (`marketplaceVisibilityReason`) thay vì bịa thêm một câu thứ tư.
 */
function MarketplaceState({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.publish.visibility');
  const reason = vehicle.marketplaceVisibilityReason as MarketplaceVisibilityReason;

  if (!vehicle.marketplaceEnabled) return <span className={styles.state}>{t('off')}</span>;
  if (vehicle.isMarketplaceVisible) {
    return <span className={`${styles.state} ${styles.live}`}>{t('on')}</span>;
  }
  return (
    <StatusTag
      value={reason}
      meta={MARKETPLACE_VISIBILITY_REASON_META}
      group="marketplaceVisibility"
    />
  );
}
