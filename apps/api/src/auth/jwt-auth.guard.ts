import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export type AuthenticatedUser = { userId: string; organizationId: string; role: string; email: string };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const bearer = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined;
    const token = request.cookies?.sanode_access ?? bearer;
    if (!token) throw new UnauthorizedException('Sign in is required.');
    try {
      request.user = this.jwt.verify<AuthenticatedUser>(token);
      return true;
    } catch {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }
  }
}
