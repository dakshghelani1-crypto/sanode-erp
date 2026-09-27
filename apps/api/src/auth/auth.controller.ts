import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { LoginDto } from './auth.dto.js';
import { JwtAuthGuard, type AuthenticatedUser } from './jwt-auth.guard.js';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(dto.email, dto.password);
    const isProd = process.env.NODE_ENV === 'production';
    response.cookie('sanode_access', result.token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/'
    });
    return { user: result.user, token: result.token };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    const isProd = process.env.NODE_ENV === 'production';
    response.clearCookie('sanode_access', {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/'
    });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: Request & { user: AuthenticatedUser }) { return this.auth.me(request.user.userId); }
}
