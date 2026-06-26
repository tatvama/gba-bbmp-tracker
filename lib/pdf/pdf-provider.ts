export interface PDFGenerateOptions {
  title: string;
  subject?: string;
  author?: string;
}

export interface PDFProvider {
  name: string;
  generatePdf(html: string, options?: PDFGenerateOptions): Promise<Buffer>;
}
