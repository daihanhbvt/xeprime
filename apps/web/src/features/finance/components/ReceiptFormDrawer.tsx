'use client';

import { App, Button, Drawer } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { getErrorMessage } from '@/services/api-client';
import { PAYMENT_METHOD_OPTIONS, RECEIPT_TYPE, RECEIPT_TYPE_OPTIONS } from '../constants';
import { useFinanceCategories } from '../hooks/use-finance-categories';
import { useCreateReceipt } from '../hooks/use-receipt-mutations';
import { receiptFormSchema, type ReceiptFormValues } from '../schema';
import type { CreateReceiptInput } from '../types';

const DEFAULTS: ReceiptFormValues = {
  type: RECEIPT_TYPE.EXPENSE,
  amount: null,
  paymentMethod: 'cash',
  categoryId: null,
  referenceCode: '',
  description: '',
};

/** Drawer tạo phiếu thu/chi (chờ duyệt). Danh mục lọc theo loại phiếu đang chọn. */
export function ReceiptFormDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const { control, handleSubmit, reset } = useForm<ReceiptFormValues>({
    resolver: yupResolver(receiptFormSchema),
    defaultValues: DEFAULTS,
  });

  const type = useWatch({ control, name: 'type' });
  const { data: categories } = useFinanceCategories(type);
  const categoryOptions = (categories ?? []).map((c) => ({ value: c.id, label: c.name }));

  const create = useCreateReceipt();

  const submit = handleSubmit((values) => {
    const body: CreateReceiptInput = {
      type: values.type,
      amount: String(values.amount ?? 0),
      paymentMethod: values.paymentMethod,
      categoryId: values.categoryId || undefined,
      referenceCode: values.referenceCode || undefined,
      description: values.description || undefined,
    };
    create.mutate(body, {
      onSuccess: () => {
        message.success('Đã tạo phiếu — chờ duyệt');
        reset(DEFAULTS);
        onClose();
      },
      onError: (err) => message.error(getErrorMessage(err)),
    });
  });

  return (
    <Drawer title="Tạo phiếu thu/chi" width={480} open={open} onClose={onClose} destroyOnClose>
      <form onSubmit={submit} noValidate>
        <SelectField control={control} name="type" label="Loại phiếu" options={RECEIPT_TYPE_OPTIONS} />
        <SelectField
          control={control}
          name="categoryId"
          label="Danh mục"
          options={categoryOptions}
          placeholder="Chọn danh mục"
          allowClear
        />
        <NumberField control={control} name="amount" label="Số tiền" money min={0} />
        <SelectField
          control={control}
          name="paymentMethod"
          label="Hình thức"
          options={PAYMENT_METHOD_OPTIONS}
        />
        <TextField
          control={control}
          name="referenceCode"
          label="Mã tra soát (tuỳ chọn)"
          placeholder="VD: mã giao dịch CK"
        />
        <TextAreaField
          control={control}
          name="description"
          label="Diễn giải"
          rows={3}
          maxLength={2000}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <Button onClick={onClose}>Huỷ</Button>
          <Button type="primary" htmlType="submit" loading={create.isPending}>
            Tạo phiếu
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
