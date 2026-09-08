import { chatApi } from '@xeprime/api-client';
import { CHAT_ATTACHMENT_MAX_BYTES, CHAT_ATTACHMENT_MIME_TYPES } from '@xeprime/types';
import { ApiClientError } from '@/services/api-client';
import { uploadToR2 } from '@/services/upload';
import type { ChatAttachmentPresign } from './types';

/**
 * Phần WEB của lối gọi chat. Toàn bộ phần gọi HTTP nằm ở `chatApi` (`@xeprime/api-client`) để
 * app native dùng lại nguyên vẹn; ở đây chỉ còn thứ dính vào `File` của trình duyệt — thứ Metro
 * không đọc được và là lý do nó không đi vào package dùng chung.
 */
export { chatApi };

/** `accept` của `<input type="file">` — dựng từ chính bộ MIME dùng chung, không gõ lại chuỗi. */
export const CHAT_ATTACHMENT_ACCEPT = CHAT_ATTACHMENT_MIME_TYPES.join(',');

export type ChatAttachmentRejection = 'type' | 'tooLarge';

/**
 * Chặn tệp sai TRƯỚC khi presign — báo ngay thay vì để người dùng chờ hết một vòng upload rồi
 * mới nhận 400. Trần thật vẫn ở backend; đây là phép lịch sự, không phải lớp bảo vệ.
 */
export function validateChatAttachment(file: File): ChatAttachmentRejection | null {
  if (!(CHAT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size > CHAT_ATTACHMENT_MAX_BYTES) return 'tooLarge';
  return null;
}

export interface UploadedChatAttachment {
  url: string;
  fileType: string;
  fileName: string;
  fileSize: number;
}

/**
 * Presign → PUT thẳng R2 → trả metadata để gắn vào tin nhắn (ADR 0009 §5).
 *
 * `onProgress` đi tới `uploadToR2`, nơi đã có nhánh `XMLHttpRequest` cho phần trăm thật — một
 * thanh tiến trình giả (nhảy 0 → 100) nói dối đúng lúc người dùng cần biết còn bao lâu.
 */
export async function uploadChatAttachment(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadedChatAttachment> {
  const rejection = validateChatAttachment(file);
  if (rejection) {
    throw new ApiClientError({
      code: `CHAT_ATTACHMENT_${rejection}`,
      message: `Chat attachment rejected: ${rejection}`,
      status: 0,
    });
  }

  const contentType = file.type || 'application/octet-stream';
  const ticket: ChatAttachmentPresign = await chatApi.presignAttachment({
    fileName: file.name,
    contentType,
    fileSize: file.size,
  });
  await uploadToR2(ticket.uploadUrl, file, onProgress);

  return {
    url: ticket.publicUrl,
    fileType: contentType,
    fileName: file.name,
    fileSize: file.size,
  };
}
