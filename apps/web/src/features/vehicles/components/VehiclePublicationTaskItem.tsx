'use client';

import { Button } from 'antd';
import { App } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PERMISSION } from '@xeprime/types';
import { packageShopListingGateFrom } from '@xeprime/domain';

import { InfoHint } from '@/components/data-display/InfoHint';
import { ShopListingGateAlert } from '@/features/shop/components/ShopListingGateAlert';
import { usePermissions } from '@/hooks/use-permissions';
import { useWorkspace } from '@/hooks/use-workspace';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useSubmitVehiclePublic } from '../hooks/use-vehicle-mutations';
import { usePublicationLabels } from '../hooks/use-publication-labels';
import {
  publicationEditPath,
  type VehiclePublicationAction,
  type VehiclePublicationTask,
} from '../publication';
import type { VehicleDetail } from '../types';
import { REVIEW_PANEL_ANCHOR } from './VehiclePublicReviewPanel';
import styles from './VehiclePublicationTaskItem.module.css';

/** Số mục còn thiếu nêu THẲNG trong thẻ; phần dư đếm số, chi tiết nằm sau dấu "i". */
const MISSING_PREVIEW = 2;

/**
 * MỘT việc "đưa xe lên chợ", nằm trong thẻ "Việc cần làm" ở đầu hồ sơ xe.
 *
 * Trước 23/09/2026 thẻ này chỉ đọc cảnh báo do server tính, và server không biết gì về checklist
 * đăng chợ ngoài hai cảnh báo thô (`public_action_required`, `missing_vehicle_info`) — cả hai chỉ
 * có TIÊU ĐỀ, không có nút. Kết quả: một chiếc xe còn là nháp hiện "Không có việc cần làm", còn
 * hành động thật thì nằm ở cuối trang.
 *
 * Việc ở đây có NÚT THẬT, vì trang chi tiết có trong tay cả bản ghi xe: gửi duyệt gọi thẳng
 * mutation, hoàn tất hồ sơ mở đúng tab còn thiếu, bật hiển thị neo lên công tắc ở đầu trang.
 * Đổi lại, `TodoCard` phải LỌC hai cảnh báo server nói trùng — xem chỗ gọi.
 *
 * Quyền: chỉ nút mới gác theo quyền. Câu mô tả tình trạng thì ai đọc được hồ sơ xe đều thấy —
 * "xe của gian hàng này chưa lên chợ" không phải bí mật với người đã vào được trang.
 */
export function VehiclePublicationTaskItem({
  vehicle,
  task,
}: {
  vehicle: VehicleDetail;
  task: VehiclePublicationTask;
}) {
  const t = useTranslations('Vehicles.publish.task');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { requirement } = usePublicationLabels();
  const { has } = usePermissions();
  const { paths } = useWorkspace();
  const submit = useSubmitVehiclePublic(vehicle.id);

  /**
   * Hồ sơ GIAN HÀNG còn thiếu gì (ADR 0040) — `null` = không phải lỗi đó.
   *
   * Giữ trong state thay vì đọc từ `submit.error`: dải này phải ĐỨNG LẠI cho tới khi người dùng
   * sửa xong (họ sẽ mở tab khác để tải logo rồi quay về), còn `submit.error` biến mất ngay khi
   * mutation được gọi lại. Và nó phải tự dọn khi lượt gửi kế tiếp đi qua được.
   */
  const [listingGate, setListingGate] = useState<ReturnType<
    typeof packageShopListingGateFrom
  > | null>(null);

  const canSubmit = has(PERMISSION.VEHICLE_SUBMIT_PUBLIC);
  const canEdit = has(PERMISSION.VEHICLE_UPDATE);

  function onSubmit() {
    submit.mutate(undefined, {
      onSuccess: () => {
        setListingGate(null);
        message.success(t('submitted'));
      },
      onError: (err) => {
        // Cổng hồ sơ gian hàng có một dải RIÊNG vì nó cần một cái link (xem `ShopListingGateAlert`).
        // Mọi lỗi khác vẫn là một toast — chúng không có lối đi tiếp nào ngoài "thử lại".
        const gate = packageShopListingGateFrom(err);
        setListingGate(gate);
        if (!gate) message.error(errorMessage(err));
      },
    });
  }

  const missingLabels = task.missing.map(requirement);
  const preview = missingLabels.slice(0, MISSING_PREVIEW);
  const overflow = missingLabels.length - preview.length;

  function action(spec: VehiclePublicationAction | null, isPrimary: boolean) {
    if (!spec) return null;
    const label = t(`actions.${spec.cta}`);
    const type = isPrimary ? 'primary' : 'default';

    switch (spec.kind) {
      case 'submit':
        return canSubmit ? (
          <Button size="small" type={type} loading={submit.isPending} onClick={onSubmit}>
            {label}
          </Button>
        ) : null;
      case 'edit':
        return canEdit ? (
          <Link href={publicationEditPath(vehicle.id, task.missing)}>
            <Button size="small" type={type}>
              {label}
            </Button>
          </Link>
        ) : null;
      case 'enableMarketplace':
        /*
         * Neo lên chính công tắc ở đầu trang thay vì bật hộ từ đây: một hành động, một chỗ bấm.
         * Bật hộ sẽ là chỗ ghi thứ hai cho cùng một trạng thái, và người dùng không thấy cái
         * công tắc vừa đổi.
         */
        return canSubmit ? (
          <Link href={`#${MARKETPLACE_SWITCH_ANCHOR}`}>
            <Button size="small" type={type}>
              {label}
            </Button>
          </Link>
        ) : null;
      case 'viewStatus':
        return (
          <Link href={`#${REVIEW_PANEL_ANCHOR}`}>
            <Button size="small" type={type}>
              {label}
            </Button>
          </Link>
        );
      case 'contactSupport':
        // `hidden` không có đường tự phục vụ nào (ADR 0048 điều 4) — lối duy nhất là hỗ trợ,
        // nên dẫn thẳng vào đó thay vì để người dùng đi tìm.
        return (
          <Link href={paths.support}>
            <Button size="small" type={type}>
              {label}
            </Button>
          </Link>
        );
    }
  }

  const primary = action(task.primary, true);
  const secondary = action(task.secondary, false);

  return (
    <div className={`${styles.task} ${styles[task.tone]}`}>
      <p className={styles.title}>
        {t(`${task.key}.title`)}
        {/*
          Dấu "i" CHỈ khi danh sách bị cắt bớt. Không cắt thì dòng tóm tắt đã nói đủ, và một
          tooltip lặp lại đúng câu đó là đọc hai lần với trình đọc màn hình (`InfoHint` luôn
          nhúng một bản ẩn-thị-giác của nội dung).
        */}
        {overflow > 0 ? (
          <InfoHint
            label={t('missingHintLabel')}
            content={t('missingHint', { list: missingLabels.join(', ') })}
          />
        ) : null}
      </p>

      {/*
        Mô tả NGẮN, một dòng: thẻ này đứng cạnh việc bảo dưỡng và giấy tờ, nên một đoạn văn ở đây
        đẩy mọi thứ khác xuống dưới nếp gấp. Danh sách điều kiện đầy đủ nằm sau dấu "i" ở trên, và
        bản checklist đánh dấu từng mục vẫn ở thẻ xét duyệt phía dưới.
      */}
      {missingLabels.length > 0 ? (
        <p className={styles.detail}>
          {t('missingSummary', { list: preview.join(', '), count: overflow })}
        </p>
      ) : (
        <p className={styles.detail}>{t(`${task.key}.description`)}</p>
      )}

      {/* Câu NGƯỜI DUYỆT viết — đi qua nguyên văn, không dịch được. */}
      {task.reason ? <p className={styles.reason}>{task.reason}</p> : null}

      {listingGate ? <ShopListingGateAlert missing={listingGate} /> : null}

      {primary || secondary ? (
        <div className={styles.actions}>
          {primary}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}

/** Neo của hàng công tắc ở đầu trang — dùng cho CTA "Bật hiển thị". */
export const MARKETPLACE_SWITCH_ANCHOR = 'vehicle-marketplace-switch';
