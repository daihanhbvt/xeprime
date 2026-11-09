import * as yup from 'yup';
import { SUBSCRIPTION_ORIGIN, subscriptionEndsAtValid } from '@xeprime/types';
import { appWallClockToIso, toAppTz, type Dayjs } from '@/lib/datetime';
import type { Subscription, UpdateSubscriptionInput } from './types';

/** Trần ô "số xe" — cùng `@Max` của `UpdateSubscriptionDto.maxVehicles`. */
export const TERM_MAX_VEHICLES = 100_000;
const NOTE_MAX = 1000;

export interface TermEditFormValues {
  /** VND nguyên; chỉ gửi khi kỳ do admin gán (`priceEditable`). */
  price: number | null;
  endsAt: Dayjs | null;
  unlimitedVehicles: boolean;
  maxVehicles: number | null;
  note: string;
}

/** GIÁ chỉ sửa được ở kỳ admin gán — kỳ từ hoá đơn đã trả giữ số tiền khớp hoá đơn (ADR 0080 điều 3). */
export const termPriceEditable = (term: Pick<Subscription, 'origin'>) =>
  term.origin === SUBSCRIPTION_ORIGIN.ADMIN;

export function termEditDefaults(term: Subscription): TermEditFormValues {
  // Kỳ không có snapshot hạn mức (dòng trước ADR 0041) hiện là "không giới hạn" — đúng như cổng đọc.
  const maxVehicles = term.quota?.maxVehicles ?? null;
  return {
    price: Number(term.price),
    endsAt: toAppTz(term.endsAt),
    unlimitedVehicles: maxVehicles === null,
    maxVehicles,
    note: term.note ?? '',
  };
}

export function buildTermEditSchema(
  term: Subscription,
  messages: { required: string; endsAtInvalid: string; vehiclesMin: string; noteTooLong: string },
): yup.ObjectSchema<TermEditFormValues> {
  return yup.object({
    price: termPriceEditable(term)
      ? yup.number().nullable().defined().min(0).required(messages.required)
      : yup.number().nullable().defined(),
    endsAt: yup
      .mixed<Dayjs>()
      .nullable()
      .defined()
      .required(messages.required)
      // Cùng hàm server kiểm (sau bắt đầu, sau bây giờ, ≤ 36 tháng) — báo ngay thay vì chờ 400.
      .test('ends-valid', messages.endsAtInvalid, (value) =>
        value ? subscriptionEndsAtValid(term, appWallClockToIso(value)) : false,
      ),
    unlimitedVehicles: yup.boolean().defined(),
    maxVehicles: yup
      .number()
      .nullable()
      .defined()
      .when('unlimitedVehicles', {
        is: false,
        then: (schema) =>
          schema
            .required(messages.required)
            .integer(messages.vehiclesMin)
            .min(1, messages.vehiclesMin)
            .max(TERM_MAX_VEHICLES),
      }),
    note: yup.string().defined().max(NOTE_MAX, messages.noteTooLong),
  });
}

/**
 * Chỉ gửi trường ĐÃ ĐỔI — server coi trường vắng là "giữ nguyên", và một lượt lưu không đổi gì
 * không đáng một dòng audit.
 */
export function toUpdateTermBody(
  term: Subscription,
  form: TermEditFormValues,
): UpdateSubscriptionInput {
  const before = termEditDefaults(term);
  const body: UpdateSubscriptionInput = {};
  if (termPriceEditable(term) && form.price !== null && form.price !== before.price) {
    body.price = String(form.price);
  }
  if (form.endsAt) {
    const endsAt = appWallClockToIso(form.endsAt);
    if (new Date(endsAt).getTime() !== new Date(term.endsAt).getTime()) body.endsAt = endsAt;
  }
  const maxVehicles = form.unlimitedVehicles ? null : form.maxVehicles;
  if (maxVehicles !== before.maxVehicles) body.maxVehicles = maxVehicles;
  const note = form.note.trim();
  if (note !== (term.note ?? '')) body.note = note === '' ? null : note;
  return body;
}
