'use client';

import { CloseOutlined, GiftOutlined, TagOutlined } from '@ant-design/icons';
import { Button, Input, Modal, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  normalizePromoCode,
  PROMO_DISCOUNT_TYPE,
  PROMO_INELIGIBLE_REASON,
  PROMO_INELIGIBLE_REASON_VALUES,
} from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import { InfoHint } from '@/components/data-display/InfoHint';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { fetchAvailablePromoCodes } from '../api';
import type { PromoPreview, PromoTripParams } from '../types';
import styles from './PromoCodeField.module.css';

export interface PromoCodeFieldProps {
  /**
   * Chuyến đang chọn. `null` = chưa đủ dữ liệu để báo giá (chưa chọn thời gian, chưa chọn gói)
   * ⇒ khối tự ẩn: một ô áp mã trên một chuyến chưa có giá là một nút bấm được mà không có tác dụng.
   */
  trip: PromoTripParams | null;
  /** Mã ĐANG áp (đã chuẩn hoá) — `null` khi chưa áp gì. */
  appliedCode: string | null;
  /** Kết quả xem trước của mã đang áp — nguồn của số giảm và tên chương trình. */
  applied: PromoPreview | null;
  /** Đang gọi server để kiểm mã. */
  checking: boolean;
  /**
   * Lý do mã KHÔNG áp được (`PromoIneligibleReason`) — giao diện dịch từ MÃ, không hiện message
   * của server (ADR 0012).
   */
  reason: string | null;
  /**
   * Chuyến này KHÔNG có khoản thu trước nên mã không áp được ở đâu cả (báo giá tạm tính, thuê dài
   * hạn chưa chốt lịch). Khối vẫn hiện nhưng giải thích thay vì mời gõ mã.
   */
  unavailable?: boolean;
  /** Mã vừa bị BỎ vì điều kiện thuê đổi — hiện một dòng cảnh báo, không im lặng. */
  droppedCode?: string | null;
  onApply: (code: string) => void;
  onRemove: () => void;
}

/**
 * Ô ÁP MÃ KHUYẾN MÃI của luồng đặt xe — ADR 0046.
 *
 * Component CHỈ hiển thị và thu thập ý định: số giảm, tổng khách trả và lý do không áp được đều
 * do server tính (`/public/promo-codes/preview`). Không có phép cộng trừ tiền nào ở đây, và đó
 * không phải chuyện thẩm mỹ — một phép trừ ở client sẽ hiện một con số khác với con số in lên mã
 * QR, và khách chỉ phát hiện ra lúc chuyển khoản.
 *
 * Bốn trạng thái, mỗi trạng thái một hình dạng: mời gõ · đang kiểm · đã áp · không áp được (kèm
 * lý do). Không có trạng thái thứ năm "nút bấm được mà không làm gì".
 */
export function PromoCodeField({
  trip,
  appliedCode,
  applied,
  checking,
  reason,
  unavailable = false,
  droppedCode = null,
  onApply,
  onRemove,
}: PromoCodeFieldProps) {
  const t = useTranslations('PromoCodes');
  const fmt = useAppFormat();
  const [draft, setDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const hasApplied = Boolean(appliedCode && applied?.applicable);

  /*
   * Ô nhập trả về rỗng NGAY tại cú bấm, không qua một `useEffect` theo `appliedCode`.
   *
   * Effect đó sẽ ghi state trong lúc render (React 19 cảnh báo cascading render), và nó cũng sai
   * ở một ca thật: mã bị TỪ CHỐI cũng cần xoá ô: giữ lại chuỗi vừa bị từ chối chỉ mời người ta
   * bấm "Áp dụng" lần nữa với đúng cái mã đó.
   */
  function submitDraft() {
    const code = normalizePromoCode(draft);
    if (!code) return;
    setDraft('');
    onApply(code);
  }

  function applyFromPicker(code: string) {
    setPickerOpen(false);
    onApply(code);
  }

  if (!trip) return null;

  return (
    <div className={cx(styles.block, hasApplied && styles.blockApplied)}>
      <div className={styles.head}>
        <TagOutlined aria-hidden className={styles.icon} />
        <span>{t('field.label')}</span>
        <InfoHint content={t('field.hint')} label={t('field.hintLabel')} />
        {/*
          Nút mở danh sách chỉ có nghĩa khi chuyến còn áp mã được và chưa áp mã nào — sau khi áp,
          việc tiếp theo là BỎ mã, không phải chọn thêm một mã thứ hai (một chuyến một mã).
        */}
        {!hasApplied && !unavailable ? (
          <button type="button" className={styles.browse} onClick={() => setPickerOpen(true)}>
            {t('field.browse')}
          </button>
        ) : null}
      </div>

      {unavailable ? (
        <p className={styles.note}>{t('field.unavailableForTrip')}</p>
      ) : hasApplied && applied ? (
        <>
          <div className={styles.appliedRow}>
            <span className={styles.appliedCode}>{applied.code}</span>
            <span className={styles.appliedName}>{applied.name}</span>
            <span className={styles.appliedAmount}>
              −{fmt.money(applied.discountAmount ?? '0')}
            </span>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              aria-label={t('field.removeLabel')}
              onClick={onRemove}
            />
          </div>
          {/*
            Mã bị TRẦN kẹp xuống: nói rõ, nếu không khách sẽ tự trừ mệnh giá khỏi tổng rồi thấy
            con số của mình không khớp.
          */}
          {applied.clamped ? (
            <p className={styles.note}>
              {t('field.clamped', { amount: fmt.money(applied.discountAmount ?? '0') })}
            </p>
          ) : null}
        </>
      ) : (
        <div className={styles.row}>
          <Input
            className={styles.input}
            value={draft}
            placeholder={t('field.placeholder')}
            aria-label={t('field.label')}
            maxLength={24}
            disabled={checking}
            onChange={(e) => setDraft(e.target.value)}
            onPressEnter={(e) => {
              /* Ô này nằm TRONG form đặt xe — Enter ở đây không được gửi cả biểu mẫu. */
              e.preventDefault();
              submitDraft();
            }}
          />
          <Button
            onClick={submitDraft}
            loading={checking}
            disabled={normalizePromoCode(draft).length === 0}
          >
            {t('field.apply')}
          </Button>
        </div>
      )}

      {checking ? <p className={styles.note}>{t('field.checking')}</p> : null}
      {!checking && reason && !hasApplied ? (
        <p className={styles.error}>{reasonText(t, reason)}</p>
      ) : null}
      {droppedCode ? (
        <p className={styles.warn}>{t('field.dropped', { code: droppedCode })}</p>
      ) : null}

      <PromoPicker
        open={pickerOpen}
        trip={trip}
        appliedCode={appliedCode}
        onClose={() => setPickerOpen(false)}
        onApply={applyFromPicker}
      />
    </div>
  );
}

/**
 * Hộp thoại chọn mã — gõ tay HOẶC chọn từ danh sách đã công bố.
 *
 * Mã không đủ điều kiện vẫn hiện, mờ đi và kèm lý do. Ẩn chúng đi thì khách vừa nhận một mã qua
 * email sẽ không hiểu vì sao nó không có ở đây; hiện chúng với nút bấm được thì lại là một nút
 * không có tác dụng. Mờ + lý do + nút vô hiệu hoá là hình dạng duy nhất nói đúng sự thật.
 *
 * `enabled: open` — danh sách chỉ hỏi server khi hộp thoại mở, không hỏi sẵn cho một hộp thoại
 * mà phần lớn khách không bao giờ bấm vào.
 */
function PromoPicker({
  open,
  trip,
  appliedCode,
  onClose,
  onApply,
}: {
  open: boolean;
  trip: PromoTripParams;
  appliedCode: string | null;
  onClose: () => void;
  onApply: (code: string) => void;
}) {
  const t = useTranslations('PromoCodes');
  const fmt = useAppFormat();
  const [draft, setDraft] = useState('');

  const listQ = useQuery({
    queryKey: queryKeys.marketplace.promoCodes({
      vehicleId: trip.vehicleId,
      serviceType: trip.serviceType ?? null,
      pickupAt: trip.pickupAt ?? null,
      returnAt: trip.returnAt ?? null,
      packageMonths: trip.packageMonths ?? null,
      routeType: trip.routeType ?? null,
    }),
    queryFn: () => fetchAvailablePromoCodes(trip),
    enabled: open,
    staleTime: 60_000,
  });

  function submitDraft() {
    const code = normalizePromoCode(draft);
    if (code) {
      setDraft('');
      onApply(code);
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={t('picker.title')}
      destroyOnHidden
      centered
    >
      <div className={styles.pickerManual}>
        <Input
          className={styles.input}
          value={draft}
          placeholder={t('field.placeholder')}
          aria-label={t('picker.manualLabel')}
          maxLength={24}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={(e) => {
            e.preventDefault();
            submitDraft();
          }}
        />
        <Button onClick={submitDraft} disabled={normalizePromoCode(draft).length === 0}>
          {t('picker.apply')}
        </Button>
      </div>

      {listQ.isPending ? (
        <Skeleton active paragraph={{ rows: 4 }} title={false} />
      ) : listQ.isError ? (
        <p className={styles.note}>{t('picker.error')}</p>
      ) : (listQ.data?.length ?? 0) === 0 ? (
        <p className={styles.note}>{t('picker.empty')}</p>
      ) : (
        <div className={styles.pickerList}>
          {listQ.data?.map((promo) => (
            <PickerRow
              key={promo.code}
              promo={promo}
              inUse={promo.code === appliedCode}
              onApply={() => onApply(promo.code)}
              money={fmt.money}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

function PickerRow({
  promo,
  inUse,
  onApply,
  money,
}: {
  promo: PromoPreview;
  inUse: boolean;
  onApply: () => void;
  money: (value: string) => string;
}) {
  const t = useTranslations('PromoCodes');
  const disabled = !promo.applicable;

  return (
    <div className={cx(styles.pickerItem, disabled && styles.pickerItemDisabled)}>
      <span className={cx(styles.pickerBadge, disabled && styles.pickerBadgeDisabled)}>
        <GiftOutlined aria-hidden />
      </span>
      <div className={styles.pickerBody}>
        <span className={styles.pickerCode}>{promo.code}</span>
        <span className={styles.pickerHeadline}>
          {promo.discountType === PROMO_DISCOUNT_TYPE.PERCENT
            ? t('picker.discountPercent', { percent: promo.discountPercent ?? 0 })
            : t('picker.discountFixed', { amount: money(promo.discountAmount ?? '0') })}
          {promo.discountType === PROMO_DISCOUNT_TYPE.PERCENT && promo.maxDiscountAmount
            ? ` · ${t('picker.maxDiscount', { amount: money(promo.maxDiscountAmount) })}`
            : ''}
        </span>
        <span className={styles.pickerMeta}>
          {promo.description ??
            (Number(promo.minOrderAmount) > 0
              ? t('picker.minOrder', { amount: money(promo.minOrderAmount) })
              : promo.name)}
        </span>
        {/*
          Số giảm THẬT của chuyến này — nó có thể nhỏ hơn mệnh giá vì trần, và đó chính là con số
          khách cần so sánh khi chọn giữa hai mã.
        */}
        {promo.applicable && promo.discountAmount ? (
          <span className={styles.pickerMeta}>
            {t('picker.savesAmount', { amount: money(promo.discountAmount) })}
          </span>
        ) : null}
        {disabled && promo.reason ? (
          <span className={styles.pickerReason}>{reasonText(t, promo.reason)}</span>
        ) : null}
      </div>
      <div className={styles.pickerAction}>
        <Button type="primary" size="small" disabled={disabled || inUse} onClick={onApply}>
          {inUse ? t('picker.applied') : t('picker.apply')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Lý do → chữ, dịch từ MÃ (ADR 0012 §4).
 *
 * Lọc qua `PROMO_INELIGIBLE_REASON_VALUES` TRƯỚC khi tra bản dịch, không bọc `try/catch`:
 * `next-intl` KHÔNG ném khi thiếu khoá — nó trả về chính đường dẫn khoá
 * (`"PromoCodes.reason.abc"`). Một `try/catch` ở đây vì thế không bao giờ chạy, và một mã lý do
 * mới ở backend sẽ hiện nguyên chuỗi kỹ thuật lên bảng giá của khách.
 *
 * Danh sách mã là thứ `@xeprime/types` đã có, nên phép lọc này tự đúng khi backend thêm lý do
 * mới — miễn là `pnpm i18n:check` vẫn canh đủ khoá cho mọi giá trị trong đó.
 */
function reasonText(t: ReturnType<typeof useTranslations<'PromoCodes'>>, reason: string): string {
  const known = (PROMO_INELIGIBLE_REASON_VALUES as readonly string[]).includes(reason)
    ? reason
    : PROMO_INELIGIBLE_REASON.NOT_FOUND;
  return t(`reason.${known}` as Parameters<typeof t>[0]);
}
