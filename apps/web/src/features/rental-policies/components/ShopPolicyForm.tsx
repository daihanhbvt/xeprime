'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button } from 'antd';
import { useForm } from 'react-hook-form';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { formToSaveInput, policyToForm } from '../form';
import { policyFormSchema, type PolicyFormValues } from '../schema';
import type { SaveRentalPolicyInput, ShopRentalPolicy } from '../types';
import { PolicySections } from './PolicySections';

import styles from './ShopPolicyForm.module.css';

interface ShopPolicyFormProps {
  initial: ShopRentalPolicy;
  canEdit: boolean;
  submitting: boolean;
  onSubmit: (body: SaveRentalPolicyInput) => void;
}

/**
 * Form chính sách thuê mặc định của gian hàng (Figma `237:1557`).
 *
 * Thay đổi NHẠY CẢM: giá trị mới áp cho mọi lượt đặt mới của các xe đang kế thừa — nên trước
 * khi gửi luôn có bước xác nhận nêu rõ phạm vi ảnh hưởng và cam kết "đơn cũ giữ nguyên"
 * (snapshot bất biến ở backend). Thanh cảnh báo thay đổi chưa lưu bám theo `isDirty`.
 */
export function ShopPolicyForm({ initial, canEdit, submitting, onSubmit }: ShopPolicyFormProps) {
  const { modal } = App.useApp();
  const { control, handleSubmit, reset, formState } = useForm<PolicyFormValues>({
    resolver: yupResolver(policyFormSchema),
    values: policyToForm(initial.policy),
  });

  const confirmThenSubmit = handleSubmit((values) => {
    modal.confirm({
      title: 'Xác nhận thay đổi chính sách thuê?',
      content:
        initial.inheritingVehicles > 0
          ? `Chính sách mới áp dụng ngay cho ${initial.inheritingVehicles} xe đang kế thừa, tính từ các lượt đặt xe mới. Các đơn thuê đã chốt trước đó vẫn giữ nguyên mức giá và tiền cọc cũ.`
          : 'Chính sách mới áp dụng cho các lượt đặt xe mới. Các đơn thuê đã chốt trước đó vẫn giữ nguyên mức giá và tiền cọc cũ.',
      okText: 'Xác nhận thay đổi',
      cancelText: 'Hủy bỏ',
      onOk: () => onSubmit(formToSaveInput(values)),
    });
  });

  return (
    <form onSubmit={confirmThenSubmit} noValidate>
      {initial.policy === null ? (
        <Alert
          className={styles.introAlert}
          type="info"
          showIcon
          message="Gian hàng chưa cấu hình chính sách thuê"
          description="Khi chưa có chính sách, các lượt đặt mới không có tiền cọc, không hỗ trợ giao tận nơi và không có ưu đãi giảm giá. Điền cấu hình bên dưới rồi bấm Lưu chính sách."
        />
      ) : null}

      {formState.isDirty ? (
        <Alert
          className={styles.dirtyBar}
          type="warning"
          showIcon
          message="Bạn có các thay đổi chưa được áp dụng"
          action={
            <Button size="small" onClick={() => reset()} disabled={submitting}>
              Hủy bỏ
            </Button>
          }
        />
      ) : null}

      <PolicySections
        control={control}
        // Mốc cũ theo NGÀY chưa quy đổi được: hiện cảnh báo để chủ xe chọn lại theo gói.
        legacyDiscountTiers={initial.policy?.legacyDiscountTiers}
        depositHint={
          initial.inheritingVehicles > 0
            ? `${initial.inheritingVehicles} xe đang dùng mức cọc này`
            : undefined
        }
      />

      <StickyFormActions
        submitLabel="Lưu chính sách"
        cancelLabel="Hủy thay đổi"
        onCancel={formState.isDirty ? () => reset() : undefined}
        submitting={submitting}
        disabled={!canEdit}
      />
    </form>
  );
}
