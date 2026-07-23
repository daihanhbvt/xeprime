type ClassValue = string | false | null | undefined;

/**
 * Ghép class name của CSS Modules.
 *
 * `noUncheckedIndexedAccess` làm `styles.foo` có kiểu `string | undefined`, nên nối chuỗi
 * trực tiếp sẽ lọt chữ "undefined" vào DOM.
 */
export function cx(...values: ClassValue[]): string {
  return values.filter((value): value is string => Boolean(value)).join(' ');
}
