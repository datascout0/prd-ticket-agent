// app/api/extract/route.ts
import { NextResponse } from "next/server";
import * as mammoth from "mammoth";

// pdfjs-dist legacy build works best in Next.js (server runtime)
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// NOTE (Vercel build fix):
// Some pdfjs-dist versions do not export the TextItem type from this path.
// Avoid importing TextItem and treat content items as `any[]` instead.

// Tell PDF.js where the worker lives (avoids "Setting up fake worker failed")
GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_PDF_PAGES = 50;
const MAX_EXTRACTED_CHARS = 120_000;

function normalizeText(input: string) {
  return input
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[TRUNCATED]";
}

async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  // mammoth expects a Node Buffer in server environments
  const buf = Buffer.from(new Uint8Array(buffer));
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return truncate(normalizeText(value || ""), MAX_EXTRACTED_CHARS);
}

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const data = new Uint8Array(buffer);

  const loadingTask = getDocument({
    data,
  });

  const doc = await loadingTask.promise;

  const totalPages = Math.min(doc.numPages, MAX_PDF_PAGES);
  let out = "";

  for (let i = 1; i <= totalPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    const items = (content.items as any[]) || [];
    const pageText = items
      .map((it) => (typeof it?.str === "string" ? it.str : ""))
      .filter(Boolean)
      .join(" ");

    out += pageText + "\n\n";
    if (out.length > MAX_EXTRACTED_CHARS) break;
  }

  return truncate(normalizeText(out), MAX_EXTRACTED_CHARS);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ message: "No file uploaded" }, { status: 400 });
    }

    const name = file.name || "upload";
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const size = file.size ?? 0;

    if (size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { message: "File too large for v1 (max 5MB). Paste the PRD text instead." },
        { status: 413 }
      );
    }

    // Text-like files (TXT/MD/etc.)
    const isText =
      (file.type && file.type.startsWith("text/")) ||
      ["txt", "md", "markdown", "csv", "json"].includes(ext);

    if (isText) {
      const text = truncate(normalizeText(await file.text()), MAX_EXTRACTED_CHARS);
      return NextResponse.json({ text });
    }

    const buf = await file.arrayBuffer();

    if (ext === "docx") {
      const text = await extractDocxText(buf);
      return NextResponse.json({ text });
    }

    if (ext === "pdf") {
      const text = await extractPdfText(buf);
      return NextResponse.json({ text });
    }

    return NextResponse.json(
      { message: "Unsupported file type. Use .txt, .md, .pdf, or .docx." },
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Failed to extract file text" },
      { status: 500 }
    );
  }
}
