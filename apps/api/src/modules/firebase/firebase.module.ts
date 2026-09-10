import { Global, Module } from '@nestjs/common';
import { FirebaseAppService } from './firebase-app.service';

/**
 * Global: chat cần mint custom token, thông báo cần biết `PUSH_ENABLED` — hai module ở hai
 * nhánh khác nhau của cây, nên @Global rẻ hơn việc import chéo.
 */
@Global()
@Module({
  providers: [FirebaseAppService],
  exports: [FirebaseAppService],
})
export class FirebaseModule {}
