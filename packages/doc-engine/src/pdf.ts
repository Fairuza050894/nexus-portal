import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

export interface PdfResult {
  generated: string[];
  warnings: string[];
}

/**
 * Renders already-generated self-contained HTML files to PDF with the same
 * Chromium build the QA run uses. Failures are warnings, not silent passes:
 * the caller records them as limitations.
 */
export async function generatePdfDocs(
  docsDir: string,
  htmlFiles: string[],
  options: { timeoutMs?: number } = {},
): Promise<PdfResult> {
  const generated: string[] = [];
  const warnings: string[] = [];
  const files = htmlFiles.filter((file) => existsSync(join(docsDir, file)));
  if (files.length === 0) return { generated, warnings: ['no HTML documents to render as PDF'] };

  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    return {
      generated,
      warnings: [`PDF generation skipped: ${(error as Error).message}`],
    };
  }

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(options.timeoutMs ?? 30_000);
    for (const file of files) {
      try {
        await page.goto(pathToFileURL(join(docsDir, file)).href, { waitUntil: 'load' });
        const target = file.replace(/\.html$/i, '.pdf');
        await page.pdf({
          path: join(docsDir, target),
          format: 'A4',
          printBackground: true,
          margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
        });
        generated.push(target);
      } catch (error) {
        warnings.push(`PDF generation failed for ${file}: ${(error as Error).message}`);
      }
    }
  } finally {
    await browser.close();
  }

  return { generated, warnings };
}
