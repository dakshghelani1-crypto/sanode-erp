import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { timingSafeEqual, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly config: ConfigService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user?.isActive || !(await this.verifyPassword(password, user?.passwordHash ?? ''))) throw new UnauthorizedException('Email or password is incorrect.');
    const payload = { userId: user.id, organizationId: user.organizationId, role: user.role, email: user.email };
    return { token: await this.jwt.signAsync(payload, { expiresIn: this.config.get('JWT_EXPIRES_IN', '8h') }), user: { id: user.id, name: user.name, email: user.email, role: user.role, organizationId: user.organizationId } };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true, organizationId: true, isActive: true } });
    if (!user?.isActive) throw new UnauthorizedException('User account is inactive.');
    return user;
  }

  private async verifyPassword(password: string, stored: string) {
    const [scheme, saltEncoded, hashEncoded] = stored.split(':');
    if (scheme !== 'scrypt' || !saltEncoded || !hashEncoded) return false;
    const derived = (await scryptAsync(password, Buffer.from(saltEncoded, 'base64'), 64)) as Buffer;
    const expected = Buffer.from(hashEncoded, 'base64');
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  }
}
