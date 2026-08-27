import { registerDecorator, type ValidationOptions } from 'class-validator';

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ngày lịch `YYYY-MM-DD` có THẬT hay không — regex hình dạng là chưa đủ: `2026-02-30`
 * hay `2026-99-99` vẫn khớp `\d{4}-\d{2}-\d{2}` rồi thành `Invalid Date` trong Prisma.
 * Kiểm bằng cách dựng Date UTC và đối chiếu ngược từng phần (JS tự "trôi" 30/02 → 02/03,
 * đối chiếu ngược bắt được đúng kiểu sai đó). Trả Date UTC nửa đêm, hoặc null nếu không hợp lệ.
 */
export function parseCalendarDate(value: string): Date | null {
  if (!DATE_SHAPE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return roundTrips ? date : null;
}

export function isCalendarDate(value: unknown): boolean {
  return typeof value === 'string' && parseCalendarDate(value) !== null;
}

/** Decorator DTO: chặn ngày lịch không tồn tại ngay ở mép vào (400 có kiểm soát, không 500). */
export function IsCalendarDate(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} phải là ngày hợp lệ dạng YYYY-MM-DD`,
        ...options,
      },
      validator: {
        validate: (value: unknown) => isCalendarDate(value),
      },
    });
  };
}
