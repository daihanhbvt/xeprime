import { RATING_MAX, RATING_MIN } from '@xeprime/types';
import * as yup from 'yup';

/** Schema form đánh giá (yup — báo lỗi sớm; validate thật + CHECK rating ở BE/DB). */
export const reviewFormSchema = yup.object({
  rating: yup
    .number()
    .typeError('Chọn số sao')
    .required('Chọn số sao')
    .min(RATING_MIN, 'Chọn số sao')
    .max(RATING_MAX),
  comment: yup.string().trim().max(2000).default(''),
});

export type ReviewFormValues = yup.InferType<typeof reviewFormSchema>;
