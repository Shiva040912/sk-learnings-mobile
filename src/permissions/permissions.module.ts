import { forwardRef, Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsController } from './permissions.controller';

@Module({
  // forwardRef() — UsersModule now imports this module too (for
  // PermissionsGuard on UsersController), so this is a two-way reference.
  imports: [forwardRef(() => UsersModule)],
  controllers: [PermissionsController],
  providers: [PermissionsService, PermissionsGuard],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
