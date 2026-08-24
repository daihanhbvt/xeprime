/** Thêm giá trị vào union mà quên xử lý thì đây là chỗ TypeScript báo lỗi, không phải lúc chạy. */
export function assertNever(value: never, context: string): never {
  throw new Error(`${context}: giá trị không được xử lý — ${String(value)}`);
}
