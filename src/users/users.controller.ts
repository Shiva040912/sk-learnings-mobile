import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService:
      UsersService,
  ) {}

  private ensureAdministrator(
    role?: string,
  ) {
    if (role !== 'admin') {
      throw new ForbiddenException(
        'Administrator access required',
      );
    }
  }

  @Post('create-admin')
  createAdmin(
    @Req() req: any,
    @Body()
    createUserDto:
      CreateUserDto,
  ) {
    this.ensureAdministrator(
      req.user?.role,
    );

    return this.usersService.createUser(
      createUserDto,
    );
  }

  @Get()
  getAllUsers(
    @Req() req: any,
  ) {
    this.ensureAdministrator(
      req.user?.role,
    );

    return this.usersService.getAllUsers();
  }

  @Get(':id')
  getUserById(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    this.ensureAdministrator(
      req.user?.role,
    );

    return this.usersService.getUserById(
      id,
    );
  }

  @Patch(':id')
  updateUser(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    updateUserDto:
      UpdateUserDto,
  ) {
    this.ensureAdministrator(
      req.user?.role,
    );

    return this.usersService.updateUser(
      id,
      updateUserDto,
    );
  }

  @Delete(':id')
  deleteUser(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    this.ensureAdministrator(
      req.user?.role,
    );

    return this.usersService.deleteUser(
      id,
    );
  }
}