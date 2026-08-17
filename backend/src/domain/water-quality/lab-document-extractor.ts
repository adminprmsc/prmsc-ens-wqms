import JSZip from 'jszip';
import {
  parsePcrwrLabReport,
  type ParsedLabReport,
} from './pcrwr-report-parser';

const DOCX_MIME = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
];
const PDF_MIME = ['application/pdf', 'application/octet-stream'];

export class LabDocumentExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LabDocumentExtractionError';
  }
}

function extensionOf(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cellText(cellXml: string): string {
  const parts = [...cellXml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(
    (match) => decodeXmlEntities(match[1] ?? ''),
  );
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function extractDocxTablesAndParagraphs(xml: string): string {
  const tables: string[] = [];
  const tableXmls = [...xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)].map(
    (match) => match[0],
  );
  for (const tableXml of tableXmls) {
    const rows = [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(
      (match) => {
        const cells = [...match[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map(
          (cell) => cellText(cell[0]),
        );
        return cells.join('\t');
      },
    );
    tables.push(rows.join('\n'));
  }

  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map((match) => cellText(match[0]))
    .filter(Boolean)
    .join('\n');

  return `${tables.join('\n\n')}\n\n${paragraphs}`;
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw new LabDocumentExtractionError('The Word file has no document.xml');
  }
  const xml = await documentFile.async('string');
  return extractDocxTablesAndParagraphs(xml);
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

export async function extractLabDocumentText(
  buffer: Buffer,
  fileName: string,
  mimeType?: string,
): Promise<string> {
  const extension = extensionOf(fileName);
  const mime = mimeType?.toLowerCase() ?? '';

  if (extension === 'doc' && !fileName.toLowerCase().endsWith('.docx')) {
    throw new LabDocumentExtractionError(
      'Legacy .doc files are not supported. Save the NWQL report as .docx or PDF and upload again.',
    );
  }

  if (extension === 'docx' || DOCX_MIME.includes(mime)) {
    if (buffer.subarray(0, 2).toString() !== 'PK') {
      throw new LabDocumentExtractionError(
        'The Word file is not a valid .docx archive',
      );
    }
    return extractDocxText(buffer);
  }

  if (
    extension === 'pdf' ||
    (PDF_MIME.includes(mime) && buffer.subarray(0, 4).toString() === '%PDF')
  ) {
    if (buffer.subarray(0, 4).toString() !== '%PDF') {
      throw new LabDocumentExtractionError('The file is not a valid PDF');
    }
    return extractPdfText(buffer);
  }

  throw new LabDocumentExtractionError(
    'Upload a PCRWR NWQL test report as .docx or .pdf',
  );
}

export async function parseLabDocument(input: {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
}): Promise<{ textLength: number; report: ParsedLabReport }> {
  const text = await extractLabDocumentText(
    input.buffer,
    input.fileName,
    input.mimeType,
  );
  if (!text.trim()) {
    throw new LabDocumentExtractionError(
      'No text could be read from the document',
    );
  }
  return {
    textLength: text.length,
    report: parsePcrwrLabReport(text, { fileName: input.fileName }),
  };
}
