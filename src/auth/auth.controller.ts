import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req: any) {
    return {
      message: 'Protected route accessed successfully',
      user: req.user,
    };
  }

  // Freshly resolves the caller's effective permissions from the database
  // (not from the JWT) so an admin's edit to a trainer's permissions takes
  // effect on the trainer's next call here without requiring a re-login.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Request() req: any) {
    return this.authService.getEffectiveProfile(
      req.user.userId,
    );
  }
}