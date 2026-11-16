import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { VehicleRegistrationUploadsService } from './vehicle-registration-uploads.service';

/** Nhịp dọn — hạn giữ ảnh tính bằng ngày, trễ nửa giờ không đổi gì. */
const SWEEP_INTERVAL_MS = 30 * 60_000;

/**
 * Dọn ảnh cà vẹt của wizard tạo xe bỏ dở (ADR 0089) — cà vẹt mang tên + địa chỉ chủ xe.
 *
 * Ở API (không ở `apps/worker`) vì chỉ API có R2Service để xoá object riêng tư — cùng lý do các
 * sweeper khác. Nhiều tiến trình API chạy cùng vẫn an toàn: xoá object là idempotent, xoá dòng có
 * điều kiện trạng thái.
 */
@Injectable()
export class VehicleRegistrationUploadsSweeper
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(VehicleRegistrationUploadsSweeper.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly uploads: VehicleRegistrationUploadsService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Một vòng dọn. Public để test gọi thẳng. */
  async sweep(now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const purged = await this.uploads.purgeStale(now);
      if (purged) this.logger.log(`Đã xoá ${purged} ảnh cà vẹt của lượt tạo xe bỏ dở`);
      return purged;
    } catch (error) {
      this.logger.error('Dọn ảnh cà vẹt bỏ dở lỗi', error as Error);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
