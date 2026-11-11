import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ChatReportReasonDto } from './dto/chat.dto';

/**
 * Lý do báo cáo hội thoại (App Store Guideline 1.2).
 *
 * Danh sách sống ở `chat_report_reasons` (5 lý do mặc định do migration tạo). Màn quản trị để
 * thêm/sửa/bật-tắt lý do CHƯA làm ở đợt này — khi làm, nó thành writer duy nhất của bảng và ghi
 * `audit_logs`. Không có đường xoá: lý do đã có báo cáo trỏ tới (`RESTRICT`) chỉ TẮT được.
 */
@Injectable()
export class ChatReportReasonsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cho khách / chủ xe: chỉ lý do đang bật, theo thứ tự đã sắp. */
  async listActive(): Promise<ChatReportReasonDto[]> {
    return this.prisma.chatReportReason.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, label: true },
    });
  }
}
