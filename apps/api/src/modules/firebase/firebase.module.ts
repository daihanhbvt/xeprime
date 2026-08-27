import { Global, Module } from '@nestjs/common';
import { FirebaseAppService } from './firebase-app.service';

/** Global: chat cần mint custom token; để @Global cho ChatModule inject không phải import. */
@Global()
@Module({
  providers: [FirebaseAppService],
  exports: [FirebaseAppService],
})
export class FirebaseModule {}
