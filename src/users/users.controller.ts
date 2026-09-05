import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { UsersService } from './users.service';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import {
  RequirePageAccess,
  RequirePermission,
} from '../permissions/permissions.decorator';

// 'users' page access is now grantable to a Trainer (see PERMISSION_PAGES),
// so this no longer hardcodes role === 'admin' — it goes through the same
// PermissionsGuard as every other page. The one thing that stays
// admin-only regardless of this permission is touching an admin account
// (creating one, or editing/deleting an existing one) — enforced in
// UsersService.ensureNotEscalatingToAdmin, not here, since the service is
// what actually knows a target user's current role.
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly usersService:
      UsersService,
  ) {}

  @RequirePermission('users', 'actions', 'add')
  @Post('create-admin')
  createAdmin(
    @Req() req: any,
    @Body()
    createUserDto:
      CreateUserDto,
  ) {
    return this.usersService.createUser(
      createUserDto,
      req.user?.role,
    );
  }

  @RequirePageAccess('users')
  @Get()
  getAllUsers() {
    return this.usersService.getAllUsers();
  }

  @RequirePageAccess('users')
  @Get(':id')
  getUserById(
    @Param('id') id: string,
  ) {
    return this.usersService.getUserById(
      id,
    );
  }

  @RequirePermission('users', 'actions', 'edit')
  @Patch(':id')
  updateUser(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    updateUserDto:
      UpdateUserDto,
  ) {
    return this.usersService.updateUser(
      id,
      updateUserDto,
      req.user?.role,
    );
  }

  @RequirePermission('users', 'actions', 'delete')
  @Delete(':id')
  deleteUser(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.usersService.deleteUser(
      id,
      req.user?.role,
    );
  }
}
