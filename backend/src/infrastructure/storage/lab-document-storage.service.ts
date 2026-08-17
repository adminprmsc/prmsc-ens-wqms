import { createHash, randomBytes } from 'crypto';
import {
  copyFile,
  mkdir,
  rename,
  rm,
  writeFile,
} from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { Injectable, InternalServerErrorException } from '@nestjs/common';

const STAGING_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class LabDocumentStorageService {
  private readonly root: string;

  constructor() {
    this.root = path.resolve(
      process.env.UPLOAD_ROOT ?? path.join(process.cwd(), 'uploads'),
    );
  }

  async writeStaging(input: {
    buffer: Buffer;
    originalName: string;
    mimeType?: string;
  }) {
    const originalName = sanitizeOriginalName(input.originalName);
    const extension = extensionOf(originalName);
    const token = randomBytes(24).toString('hex');
    const storagePath = path.posix.join('tmp', `${token}${extension}`);
    const absolutePath = this.absolutePath(storagePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.buffer);
    return {
      token,
      originalName,
      mimeType: normalizeMimeType(input.mimeType, extension),
      storagePath,
      sizeBytes: input.buffer.length,
      expiresAt: new Date(Date.now() + STAGING_TTL_MS),
    };
  }

  async promoteToReport(input: {
    stagingPath: string;
    reportId: string;
    originalName: string;
  }) {
    const originalName = sanitizeOriginalName(input.originalName);
    const storagePath = path.posix.join(
      'reports',
      safeSegment(input.reportId),
      originalName,
    );
    const from = this.absolutePath(input.stagingPath);
    const to = this.absolutePath(storagePath);
    await mkdir(path.dirname(to), { recursive: true });
    try {
      await rename(from, to);
    } catch {
      await copyFile(from, to);
      await rm(from, { force: true });
    }
    return { storagePath };
  }

  absolutePath(storagePath: string): string {
    if (!storagePath || storagePath.includes('..') || path.isAbsolute(storagePath)) {
      throw new InternalServerErrorException('Invalid stored file path');
    }
    const resolved = path.resolve(this.root, storagePath);
    const rootWithSep = this.root.endsWith(path.sep)
      ? this.root
      : `${this.root}${path.sep}`;
    if (resolved !== this.root && !resolved.startsWith(rootWithSep)) {
      throw new InternalServerErrorException('Invalid stored file path');
    }
    return resolved;
  }

  exists(storagePath: string): boolean {
    return existsSync(this.absolutePath(storagePath));
  }

  async deleteIfExists(storagePath: string | null | undefined) {
    if (!storagePath) return;
    try {
      await rm(this.absolutePath(storagePath), { force: true });
    } catch {
      // ignore missing files
    }
  }
}

function extensionOf(fileName: string): string {
  const match = fileName.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match?.[1] ?? '';
}

function sanitizeOriginalName(fileName: string): string {
  const base = path.basename(fileName || 'lab-report').replace(/\\/g, '/');
  const cleaned = base
    .replace(/[^\w.\- ()[\]]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 180)
    .trim();
  const withExt = cleaned.includes('.') ? cleaned : `${cleaned || 'lab-report'}.docx`;
  return withExt || 'lab-report.docx';
}

function safeSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned || createHash('sha1').update(value).digest('hex').slice(0, 16);
}

function normalizeMimeType(mimeType: string | undefined, extension: string) {
  const mime = mimeType?.toLowerCase() ?? '';
  if (extension === '.pdf') return 'application/pdf';
  if (extension === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (mime && mime !== 'application/octet-stream') return mime;
  return 'application/octet-stream';
}
