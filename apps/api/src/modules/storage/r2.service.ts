import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { newId } from '@xeprime/prisma';

export interface PresignResult {
  /** Key trong bucket — client trả lại khi gửi message có đính kèm. */
  key: string;
  /** URL để client PUT file lên (hết hạn ngắn). */
  uploadUrl: string;
  /** URL công khai của file sau khi upload — lưu vào chat_attachments.file_url. */
  publicUrl: string;
  expiresIn: number;
}

/**
 * Cloudflare R2 (tương thích S3) cho đính kèm chat — ADR 0009 §5. Client upload THẲNG lên R2
 * qua presigned PUT (không đẩy nhị phân qua API); Postgres chỉ giữ metadata. Client S3 dựng lười
 * để app vẫn boot khi chat tắt.
 */
@Injectable()
export class R2Service {
  private client: import('@aws-sdk/client-s3').S3Client | null = null;

  constructor(private readonly config: ConfigService) {}

  private async getClient(): Promise<import('@aws-sdk/client-s3').S3Client> {
    if (this.client) return this.client;
    const { S3Client } = await import('@aws-sdk/client-s3');
    this.client = new S3Client({
      region: 'auto', // R2 không dùng region — 'auto' theo hướng dẫn Cloudflare.
      endpoint: this.config.getOrThrow<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
      },
    });
    return this.client;
  }

  async presignUpload(params: {
    prefix: string;
    fileName: string;
    contentType: string;
  }): Promise<PresignResult> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

    const bucket = this.config.getOrThrow<string>('R2_BUCKET');
    const publicBase = this.config.getOrThrow<string>('R2_PUBLIC_BASE_URL').replace(/\/+$/, '');
    const key = `${params.prefix}/${newId()}-${sanitize(params.fileName)}`;
    const expiresIn = 300;

    const uploadUrl = await getSignedUrl(
      await this.getClient(),
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: params.contentType }),
      { expiresIn },
    );

    return { key, uploadUrl, publicUrl: `${publicBase}/${key}`, expiresIn };
  }
}

/** Chỉ giữ ký tự an toàn cho key, tránh path traversal / ký tự lạ. */
function sanitize(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '_');
  return cleaned.slice(-120) || 'file';
}
