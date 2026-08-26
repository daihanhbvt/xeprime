import { BadRequestException } from '@nestjs/common';
import {
  API_ERROR_CODE,
  HANDOVER_PHOTO_SLOT_VALUES,
  HANDOVER_TYPE_VALUES,
  type HandoverPhotoSlot,
  type HandoverType,
} from '@xeprime/types';

/**
 * Tham số ĐƯỜNG DẪN của bàn giao cũng là đầu vào của client — validate như mọi đầu vào khác.
 *
 * Sống ở module bàn giao (chủ sở hữu khái niệm) chứ không nằm trong từng controller: cùng một
 * `:type`/`:slot` giờ xuất hiện ở cả bề mặt vận hành (`/bookings/:id/handovers/...`) lẫn bề mặt
 * bằng chứng của khách (`/trips/:id/handover-evidence/...`). Hai bản sao là hai cơ hội để một
 * bên quên chặn giá trị lạ và đẩy chuỗi tuỳ ý xuống thẳng câu truy vấn.
 */
export function handoverTypeParam(value: string): HandoverType {
  if (!(HANDOVER_TYPE_VALUES as string[]).includes(value)) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Chiều bàn giao không hợp lệ',
      details: { allowed: HANDOVER_TYPE_VALUES },
    });
  }
  return value as HandoverType;
}

export function handoverPhotoSlotParam(value: string): HandoverPhotoSlot {
  if (!(HANDOVER_PHOTO_SLOT_VALUES as string[]).includes(value)) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Góc chụp không hợp lệ',
      details: { allowed: HANDOVER_PHOTO_SLOT_VALUES },
    });
  }
  return value as HandoverPhotoSlot;
}
