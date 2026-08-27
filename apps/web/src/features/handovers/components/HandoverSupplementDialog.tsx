'use client';

import { Alert, Segmented } from 'antd';
import { useState } from 'react';
import {
  HANDOVER_TYPE,
  HANDOVER_TYPE_LABEL,
  PERMISSION,
  type HandoverType,
} from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useInvalidateHandovers } from '../hooks';
import type { Handover, HandoverContext } from '../types';
import { HandoverPhotoGrid } from './HandoverPhotoGrid';
import styles from './HandoverSupplementDialog.module.css';

/**
 * Bổ sung thông tin cho biên bản bàn giao ĐÃ LẬP — "Ghi nhận hiện trạng" của design 14 §4.1.
 *
 * Vì sao cần: luồng nhanh Wave 10 cố tình cho xác nhận trong một cú bấm, nên quên đính ảnh là
 * chuyện thường ngày chứ không phải ngoại lệ. Không có bề mặt này thì bằng chứng KHÔNG BAO GIỜ
 * vào được hệ thống — người vận hành chụp ảnh trong điện thoại rồi để đó.
 *
 * Ranh giới cố ý HẸP: chỉ ảnh. Số KM sau khi xác nhận đi đường điều chỉnh riêng (có lý do +
 * quyền `vehicles.odometer.correct` + audit), còn giờ giấc và trạng thái thì bất biến — mở
 * chúng ra ở đây là biến biên bản đã ký thành một biểu mẫu sửa được.
 *
 * Ảnh thêm SAU khi xác nhận được đánh dấu rõ: một tấm chụp ba ngày sau không được đọc như bằng
 * chứng hiện trạng lúc bàn giao.
 */
export function HandoverSupplementDialog({
  context,
  open,
  onClose,
}: {
  context: HandoverContext;
  open: boolean;
  onClose: () => void;
}) {
  const { has } = usePermissions();
  const fmt = useAppFormat();
  const invalidate = useInvalidateHandovers(context.bookingId, context.vehicleId);
  const canViewFiles = has(PERMISSION.HANDOVER_FILE_VIEW);

  /** Chỉ những chiều ĐÃ có biên bản — chưa giao xe thì không có gì để bổ sung. */
  const available = (
    [
      { type: HANDOVER_TYPE.PICKUP, handover: context.pickup },
      { type: HANDOVER_TYPE.RETURN, handover: context.return },
    ] as const
  ).filter((entry): entry is { type: HandoverType; handover: Handover } =>
    Boolean(entry.handover),
  );

  const [active, setActive] = useState<HandoverType>(available[0]?.type ?? HANDOVER_TYPE.PICKUP);
  const current = available.find((entry) => entry.type === active) ?? available[0] ?? null;

  /** Bản ghi mới nhất trong tay — ảnh vừa đính làm `rowVersion` và danh sách ảnh đổi. */
  const [draft, setDraft] = useState<Handover | null>(current?.handover ?? null);
  const shown = draft?.type === current?.handover.type ? draft : (current?.handover ?? null);

  return (
    <ResponsiveDialog
      title="Bổ sung thông tin bàn giao"
      open={open}
      onClose={onClose}
      size="md"
      footer={null}
    >
      <div className={styles.body}>
        {available.length === 0 ? (
          <Alert
            type="info"
            showIcon
            message="Chưa có biên bản bàn giao nào"
            description="Bổ sung ảnh được sau khi đã xác nhận giao hoặc nhận xe."
          />
        ) : (
          <>
            {/* Hai chiều có ảnh RIÊNG — gộp chung một lưới là trộn hiện trạng đầu và cuối chuyến. */}
            {available.length > 1 ? (
              <Segmented
                block
                value={active}
                onChange={(value) => {
                  setActive(value as HandoverType);
                  setDraft(null);
                }}
                options={available.map((entry) => ({
                  value: entry.type,
                  label: HANDOVER_TYPE_LABEL[entry.type],
                }))}
              />
            ) : null}

            {shown?.confirmedAt ? (
              <Alert
                type="warning"
                showIcon
                message={`Biên bản đã xác nhận lúc ${fmt.dateTime(shown.confirmedAt)}`}
                description="Ảnh thêm từ bây giờ được ghi nhận là bổ sung sau, kèm đúng thời điểm tải lên. Số KM và thời gian bàn giao không sửa ở đây."
              />
            ) : null}

            {current ? (
              <HandoverPhotoGrid
                bookingId={context.bookingId}
                type={current.type}
                photos={shown?.photos ?? []}
                canViewFiles={canViewFiles}
                disabled={false}
                onChanged={(next) => {
                  setDraft(next);
                  invalidate();
                }}
              />
            ) : null}
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}
