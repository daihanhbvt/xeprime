import { ApiClientError } from '@/services/api-client';

/**
 * Một lỗi cấp TRƯỜNG do backend trả về.
 *
 * `field` là đường dẫn chấm (`fuelConsumptionCity`, `deliveryTiers.0.toKm`) — cùng cú pháp tên
 * field của react-hook-form, nên gắn thẳng vào ô nhập được.
 *
 * `detail` là câu kỹ thuật của backend (tiếng Việt, hoặc chuỗi tự sinh của class-validator).
 * Nó KHÔNG dùng để hiện lên màn hình — ADR 0012: chữ cho người dùng đi từ mã lỗi, không từ
 * `message` của backend. Giữ lại vì nó là thứ đáng ghi vào console khi lần dấu.
 */
export interface ApiFieldIssue {
  field: string;
  detail?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function issueFrom(entry: unknown): ApiFieldIssue | null {
  const row = asRecord(entry);
  const field = row?.field;
  if (typeof field !== 'string' || field === '') return null;

  // Hai hình dạng backend đang dùng cho cùng một ý:
  //  - pipe validate toàn cục → `constraints: string[]`
  //  - validate viết tay (vd `validateDocumentMetadata`) → `message: string`
  const constraints = row?.constraints;
  const detail =
    typeof row?.message === 'string'
      ? row.message
      : Array.isArray(constraints) && typeof constraints[0] === 'string'
        ? constraints[0]
        : undefined;

  return { field, detail };
}

/**
 * Rút danh sách lỗi cấp trường ra khỏi một lỗi API — rỗng nếu lỗi này không phải loại đó.
 *
 * Backend hiện phát `details` ở HAI hình dạng: mảng `[{ field, constraints }]` do pipe validate
 * toàn cục sinh, và `{ fields: [{ field, message }] }` do vài chỗ validate viết tay sinh. Nơi gọi
 * không nên phải biết mình đang nhận cái nào, nên chỗ duy nhất biết điều đó là hàm này.
 */
export function parseApiFieldIssues(error: unknown): ApiFieldIssue[] {
  if (!(error instanceof ApiClientError)) return [];

  const details = error.details;
  const rows = Array.isArray(details) ? details : asRecord(details)?.fields;
  if (!Array.isArray(rows)) return [];

  const issues: ApiFieldIssue[] = [];
  const seen = new Set<string>();
  for (const entry of rows) {
    const issue = issueFrom(entry);
    // Một trường có thể vi phạm nhiều ràng buộc — ô nhập chỉ hiện được một lỗi, giữ cái đầu.
    if (issue && !seen.has(issue.field)) {
      seen.add(issue.field);
      issues.push(issue);
    }
  }
  return issues;
}
