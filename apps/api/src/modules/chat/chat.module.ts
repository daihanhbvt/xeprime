import { Module } from '@nestjs/common';

/**
 * Skeleton — Phase 5.
 *
 * Kiến trúc đã chốt: Postgres giữ `conversations` metadata + archive, Firestore chỉ giữ
 * 30–100 tin gần nhất cho realtime. Client chỉ listen danh sách hội thoại và thread đang
 * mở — listen toàn bộ là nguồn chi phí Firestore lớn nhất.
 */
@Module({})
export class ChatModule {}
