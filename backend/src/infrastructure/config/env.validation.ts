import { plainToInstance, Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}

class EnvironmentVariables {
  @IsInt()
  @Min(1)
  PORT!: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MinLength(16)
  JWT_SECRET?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  SYSTEM_ADMIN_EMAIL?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  SYSTEM_ADMIN_PASSWORD?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
