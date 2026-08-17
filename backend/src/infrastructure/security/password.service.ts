import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 8 characters and include a letter and a number';

@Injectable()
export class PasswordService {
  static readonly DEFAULT_INITIAL_PASSWORD = 'Root123!';
  static readonly MIN_LENGTH = 8;
  static readonly MAX_LENGTH = 128;
  static readonly POLICY_MESSAGE = PASSWORD_POLICY_MESSAGE;

  private readonly saltRounds = 10;

  static meetsPolicy(password: string): boolean {
    const value = password.trim();
    return (
      value.length >= PasswordService.MIN_LENGTH &&
      value.length <= PasswordService.MAX_LENGTH &&
      /[A-Za-z]/.test(value) &&
      /\d/.test(value)
    );
  }

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.saltRounds);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  generateTemporaryPassword(length = 12): string {
    const alphabet =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let result = '';
    for (let i = 0; i < length; i += 1) {
      result += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return result;
  }
}
