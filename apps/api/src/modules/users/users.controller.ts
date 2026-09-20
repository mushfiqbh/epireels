import {
  Body,
  Controller,
  Get,
  Patch,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

/**
 * User profile endpoints.
 *
 *   GET  /api/v1/users/me        Get current user profile.
 *   PATCH /api/v1/users/me       Update current user profile.
 */
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async getProfile(@CurrentUser() payload: JwtPayload) {
    return this.users.getProfile(payload.sub);
  }

  @Patch('me')
  async updateProfile(
    @CurrentUser() payload: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.users.updateProfile(payload.sub, dto);
  }
}
