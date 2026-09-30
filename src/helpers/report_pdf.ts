/*  Turns a generated report (Markdown) into an editable PDF: the title and section headings
    are fixed text, and each section's text sits in a fillable text box the user can edit in
    Chrome, Edge, Firefox, Adobe Reader, or Preview. Built in the browser with pdf-lib.
*/
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// US Letter, in points.
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_SPACE = 30;
const TITLE_SIZE = 18;
const HEADING_SIZE = 10.5;
const BODY_SIZE = 10.5;
const LINE_HEIGHT = BODY_SIZE * 1.3;
const FIELD_PADDING = 6;
// Blank lines left in each box so there's room to add text.
const EXTRA_LINES = 2;
// Don't start a box at the bottom of a page with room for fewer lines than this.
const MIN_FIELD_LINES = 3;

const ACCENT = rgb(0.13, 0.45, 0.55);
const MUTED = rgb(0.42, 0.43, 0.5);
const FIELD_BORDER = rgb(0.72, 0.78, 0.86);
const FIELD_BACKGROUND = rgb(0.97, 0.98, 1);

type Section = { heading: string; text: string };
type Line = { text: string; endsParagraph: boolean };

export async function downloadReportPdf(markdown: string, fileName: string): Promise<void> {
  const bytes = await buildReportPdf(markdown);
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function buildReportPdf(markdown: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const form = pdf.getForm();
  const { title, sections } = parseReport(markdown);
  pdf.setTitle(title);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };

  for (const line of wrap(clean(title, bold), bold, TITLE_SIZE, CONTENT_WIDTH)) {
    y -= TITLE_SIZE;
    page.drawText(line.text, { x: MARGIN, y, size: TITLE_SIZE, font: bold, color: ACCENT });
    y -= 4;
  }
  y -= 8;
  page.drawText("The text in each box can be edited.", { x: MARGIN, y, size: 8.5, font, color: MUTED });
  y -= 22;

  const usedNames = new Set<string>();
  for (const section of sections) {
    const lines = wrap(clean(section.text, font), font, BODY_SIZE, CONTENT_WIDTH - FIELD_PADDING * 2);
    const headingHeight = HEADING_SIZE + 8;
    const minFieldHeight = MIN_FIELD_LINES * LINE_HEIGHT + FIELD_PADDING * 2;
    if (y - headingHeight - minFieldHeight < MARGIN + FOOTER_SPACE) newPage();

    y -= HEADING_SIZE;
    page.drawText(clean(section.heading, bold).toUpperCase(), {
      x: MARGIN,
      y,
      size: HEADING_SIZE,
      font: bold,
      color: ACCENT,
    });
    y -= 8;

    // A section that doesn't fit on the page continues in another box on the next page.
    let part = 1;
    while (lines.length > 0) {
      const available = y - MARGIN - FOOTER_SPACE - FIELD_PADDING * 2;
      if (available < MIN_FIELD_LINES * LINE_HEIGHT) {
        newPage();
        continue;
      }
      const fits = Math.floor(available / LINE_HEIGHT);
      const taken = lines.splice(0, lines.length + EXTRA_LINES <= fits ? lines.length : fits - EXTRA_LINES);
      const height = (taken.length + EXTRA_LINES) * LINE_HEIGHT + FIELD_PADDING * 2;

      const field = form.createTextField(fieldName(section.heading, part, usedNames));
      field.enableMultiline();
      field.setText(joinLines(taken));
      field.addToPage(page, {
        x: MARGIN,
        y: y - height,
        width: CONTENT_WIDTH,
        height,
        font,
        borderColor: FIELD_BORDER,
        borderWidth: 0.75,
        backgroundColor: FIELD_BACKGROUND,
      });
      field.setFontSize(BODY_SIZE);
      y -= height + 18;
      part++;
    }
  }

  form.updateFieldAppearances(font);
  const pages = pdf.getPages();
  pages.forEach((current, index) => drawFooter(current, font, index + 1, pages.length));
  return pdf.save();
}

// Splits the report into its title and sections. Bullets become "• " lines and **bold**
// markers are dropped, since the editable boxes hold plain text.
export function parseReport(markdown: string): { title: string; sections: Section[] } {
  let title = "Report";
  const sections: Section[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  const finish = () => {
    if (!current) return;
    const text = current.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text) sections.push({ heading: current.heading, text });
  };

  for (const raw of markdown.split("\n")) {
    const line = raw.trim().replace(/\*\*(.+?)\*\*/g, "$1");
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading && heading[1].length === 1) {
      title = heading[2];
    } else if (heading) {
      finish();
      current = { heading: heading[2], lines: [] };
    } else {
      current ??= { heading: "Report", lines: [] };
      current.lines.push(line.replace(/^[-*]\s+/, "• "));
    }
  }
  finish();
  return { title, sections };
}

// Wraps text to a width, remembering which lines end a paragraph so the editable text
// keeps its real line breaks and nothing else.
function wrap(text: string, font: PDFFont, size: number, width: number): Line[] {
  const lines: Line[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ").filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(candidate, size) > width) {
        lines.push({ text: current, endsParagraph: false });
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push({ text: current, endsParagraph: true });
  }
  return lines;
}

// PDF text fields use a carriage return for line breaks; "\n" shows up as "?" in some viewers.
function joinLines(lines: Line[]): string {
  return lines
    .map((line, index) => line.text + (index === lines.length - 1 ? "" : line.endsParagraph ? "\r" : " "))
    .join("");
}

// The standard PDF fonts only cover basic Latin characters, so swap in close equivalents
// for anything else instead of failing. Line breaks are kept (they aren't drawn, but they
// separate paragraphs and bullets).
const REPLACEMENTS: Record<string, string> = { "→": "->", "←": "<-", "≤": "<=", "≥": ">=", "×": "x", "✓": "v" };
function clean(text: string, font: PDFFont): string {
  return [...text]
    .map((char) => {
      if (char === "\n") return char;
      try {
        font.encodeText(char);
        return char;
      } catch {
        return REPLACEMENTS[char] ?? "?";
      }
    })
    .join("");
}

function fieldName(heading: string, part: number, used: Set<string>): string {
  const base = heading.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "section";
  let name = part > 1 ? `${base}_${part}` : base;
  for (let copy = 2; used.has(name); copy++) name = `${base}_${copy}`;
  used.add(name);
  return name;
}

function drawFooter(page: PDFPage, font: PDFFont, number: number, total: number): void {
  const text = `Generated by Alacreate  ·  Page ${number} of ${total}`;
  const width = font.widthOfTextAtSize(text, 8);
  page.drawText(text, { x: (PAGE_WIDTH - width) / 2, y: MARGIN / 2, size: 8, font, color: MUTED });
}
