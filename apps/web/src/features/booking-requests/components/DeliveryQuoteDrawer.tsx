'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import { useMutation } from '@tanstack/react-query';
import { PriceBreakdown } from '@/components/data-display/PriceBreakdown';
import { NumberField } from '@/components/form/NumberField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { getErrorMessage } from '@/services/api-client';
import { previewDeliveryQuote } from '../api';
import { useSaveDeliveryQuote } from '../hooks/use-booking-request-mutations';
import type { BookingRequestItem, DeliveryQuotePreview } from '../types';

import styles from './DeliveryQuoteDrawer.module.css';

/**
 * Validate sớm ở FE; điều kiện "ngoài bán kính phải nhập phí" do server phán (biết chính sách).
 * Bắt buộc khai bằng `.test('required')` để giữ kiểu `number | null` khớp RHF (cùng thủ pháp
 * `requestFormSchema`).
 */
const quoteFormSchema = yup.object({
  distanceKm: yup
    .number()
    .nullable()
    .defined()
    .default(null)
    .min(0, 'Giá trị khoảng cách không thể âm')
    .max(500, 'Tối đa 500 km')
    .test('required', 'Vui lòng nhập khoảng cách', (value) => value != null),
  fee: yup
    .number()
    .nullable()
    .defined()
    .default(null)
    .integer('Phí phải là số nguyên VND')
    .min(0, 'Phí không được âm'),
  note: yup.string().trim().max(1000, 'Tối đa 1000 ký tự').defined().default(''),
});

type QuoteFormValues = yup.InferType<typeof quoteFormSchema>;

interface DeliveryQuoteDrawerProps {
  request: BookingRequestItem | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Drawer "Báo giá giao nhận" (Figma `237:1845`, states mobile `247:2004`).
 *
 * Mọi con số trong "Chi tiết báo giá dự kiến" đến từ endpoint preview (PricingService) — FE
 * không tự cộng trừ. Trong bán kính: phí tự tính, ô phí khoá lại ("Tự động tính"). Ngoài bán
 * kính: phí nhập tay bắt buộc. Báo giá cũ (chính sách đã đổi sau khi báo) có cảnh báo riêng.
 */
export function DeliveryQuoteDrawer({ request, onClose, onSaved }: DeliveryQuoteDrawerProps) {
  const { message } = App.useApp();
  const save = useSaveDeliveryQuote();
  // Preview gắn theo id yêu cầu — đổi yêu cầu là preview cũ tự vô hiệu, không cần reset trong effect.
  const [previewState, setPreviewState] = useState<{
    id: string;
    data: DeliveryQuotePreview;
  } | null>(null);

  const { control, handleSubmit, reset, getValues } = useForm<QuoteFormValues>({
    resolver: yupResolver(quoteFormSchema),
    defaultValues: { distanceKm: null, fee: null, note: '' },
  });

  // Mở drawer cho một yêu cầu khác → nạp lại form từ báo giá đã có (nếu có).
  const requestId = request?.id ?? null;
  useEffect(() => {
    if (!requestId) return;
    reset({
      distanceKm: request?.deliveryQuote?.distanceKm ?? null,
      fee: request?.deliveryQuote ? Number(request.deliveryQuote.fee) : null,
      note: request?.deliveryQuote?.note ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ nạp lại khi ĐỔI yêu cầu
  }, [requestId, reset]);

  const previewMutation = useMutation({
    mutationFn: (body: { distanceKm: number; fee?: string }) =>
      previewDeliveryQuote(requestId!, body),
    onSuccess: (data) => {
      if (requestId) setPreviewState({ id: requestId, data });
    },
  });
  const preview = previewState?.id === requestId ? previewState.data : null;
  // `mutate` của TanStack có identity ỔN ĐỊNH — dùng thẳng trong effect debounce được.
  const requestPreview = previewMutation.mutate;

  const distanceKm = useWatch({ control, name: 'distanceKm' });
  const fee = useWatch({ control, name: 'fee' });
  const requiresManualFee = preview?.requiresManualFee ?? false;

  // Preview đuổi theo input (debounce) — nguồn số duy nhất là server.
  useEffect(() => {
    if (requestId == null || distanceKm == null) return;
    const timer = setTimeout(() => {
      requestPreview({
        distanceKm,
        ...(fee != null ? { fee: String(Math.round(fee)) } : {}),
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [requestId, distanceKm, fee, requestPreview]);

  const submit = handleSubmit((values) => {
    if (requestId == null || values.distanceKm == null) return;
    if (requiresManualFee && values.fee == null) {
      message.error('Khoảng cách ngoài bán kính tự báo — vui lòng nhập phí giao nhận đề xuất');
      return;
    }
    save.mutate(
      {
        id: requestId,
        body: {
          distanceKm: values.distanceKm,
          ...(values.fee != null ? { fee: String(Math.round(values.fee)) } : {}),
          ...(values.note?.trim() ? { note: values.note.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          message.success('Đã gửi báo giá giao nhận');
          onSaved();
        },
        onError: (error) => message.error(getErrorMessage(error)),
      },
    );
  });

  const breakdownRows = useMemo(() => preview?.breakdown.rows ?? [], [preview]);

  return (
    <DetailDrawer
      open={request != null}
      onClose={onClose}
      title="Báo giá giao nhận"
      footer={
        <div className={styles.footer}>
          <Button size="large" onClick={onClose} disabled={save.isPending}>
            Hủy
          </Button>
          <Button
            type="primary"
            size="large"
            loading={save.isPending}
            onClick={() => void submit()}
          >
            Gửi báo giá
          </Button>
        </div>
      }
    >
      {request ? (
        <div className={styles.body}>
          {/* Ngữ cảnh yêu cầu — Figma `237:1855`. */}
          <dl className={styles.context}>
            <div className={styles.contextRow}>
              <dt>Khách hàng:</dt>
              <dd>{request.customerName}</dd>
            </div>
            <div className={styles.contextRow}>
              <dt>Xe yêu cầu:</dt>
              <dd className={styles.vehicleName}>{request.vehicleName}</dd>
            </div>
            <div className={styles.contextRow}>
              <dt>Điểm giao:</dt>
              <dd>{request.deliveryAddress ?? '—'}</dd>
            </div>
            {requiresManualFee ? (
              <div className={styles.badgeRow}>
                <span className={styles.outsideBadge}>Ngoài bán kính tự động</span>
              </div>
            ) : null}
          </dl>

          {request.deliveryQuote?.stale ? (
            <Alert
              type="warning"
              showIcon
              message="Chính sách giao nhận đã thay đổi sau khi báo giá"
              description="Kiểm tra lại khoảng cách và phí rồi gửi báo giá mới trước khi duyệt."
            />
          ) : null}

          <NumberField
            control={control}
            name="distanceKm"
            label="Khoảng cách xác nhận (km)"
            addonAfter="km"
            min={0}
            required
          />

          {requiresManualFee ? (
            <NumberField
              control={control}
              name="fee"
              label="Phí giao nhận đề xuất (VND)"
              money
              required
              help="Ngoài bán kính tự báo — shop tự chốt phí với khách"
            />
          ) : (
            <div className={styles.autoFee}>
              <span className={styles.autoFeeLabel}>Phí giao nhận</span>
              <span className={styles.autoFeeValue}>
                {preview?.autoFee != null
                  ? `${new Intl.NumberFormat('vi-VN').format(Number(preview.autoFee))}đ`
                  : '—'}
                <span className={styles.autoFeeTag}>Tự động tính</span>
              </span>
            </div>
          )}

          <TextAreaField
            control={control}
            name="note"
            label="Ghi chú cho khách hàng"
            placeholder="Phí giao nhận một chiều ngoài bán kính hỗ trợ mặc định của gian hàng…"
            rows={3}
          />

          {previewMutation.isError ? (
            <Alert
              type="error"
              showIcon
              message={getErrorMessage(previewMutation.error)}
              action={
                <Button
                  size="small"
                  onClick={() =>
                    distanceKm != null &&
                    requestPreview({
                      distanceKm,
                      ...(getValues('fee') != null
                        ? { fee: String(Math.round(getValues('fee')!)) }
                        : {}),
                    })
                  }
                >
                  Thử lại
                </Button>
              }
            />
          ) : preview ? (
            <PriceBreakdown
              title="Chi tiết báo giá dự kiến"
              rows={breakdownRows}
              totalAmount={preview.breakdown.totalAmount}
              totalLabel="Tổng cộng khách trả"
              depositAmount={preview.breakdown.depositAmount}
            />
          ) : (
            <p className={styles.hint}>
              {previewMutation.isPending
                ? 'Đang tính báo giá…'
                : 'Nhập khoảng cách xác nhận để xem chi tiết báo giá.'}
            </p>
          )}
        </div>
      ) : null}
    </DetailDrawer>
  );
}
