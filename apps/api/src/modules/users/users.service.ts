import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return AuthService.toPublic(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const updateData: Partial<User> = {};

    if (dto.displayName !== undefined) {
      updateData.displayName = dto.displayName;
    }

    if (dto.avatarUrl !== undefined) {
      updateData.avatarUrl = dto.avatarUrl;
    }

    if (dto.password !== undefined) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Current password is required to change password');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!isValid) {
        throw new BadRequestException('Current password is incorrect');
      }

      updateData.passwordHash = await AuthService.hashPassword(dto.password);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return AuthService.toPublic(updated);
  }
}
