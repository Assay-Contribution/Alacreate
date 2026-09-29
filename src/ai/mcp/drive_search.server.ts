/*  drive_search tool: finds files in the user's Google Drive whose name or contents contain
    any of the given keywords, using Google's own full-text index (Docs, Sheets, Slides,
    PDFs, Word files, ...). Returns file details only, not the matching text: read a file
    with drive_read_file. `accessToken` must be the signed-in user's own Google token (from
    lib/connections.server.ts), so the search only covers files they can see. */

const DEFAULT_RESULTS = 10;
const MAX_RESULTS = 20;
const MAX_KEYWORDS = 5;
const MAX_KEYWORD_LENGTH = 100;

const TYPE_FILTERS: Record<string, string> = {
  doc: "mimeType = 'application/vnd.google-apps.document'",
  sheet: "mimeType = 'application/vnd.google-apps.spreadsheet'",
  slides: "mimeType = 'application/vnd.google-apps.presentation'",
  pdf: "mimeType = 'application/pdf'",
};

// Friendlier names than MIME types, for the AI and the user.
export const DRIVE_TYPE_NAMES: Record<string, string> = {
  "application/vnd.google-apps.document": "Google Doc",
  "application/vnd.google-apps.spreadsheet": "Google Sheet",
  "application/vnd.google-apps.presentation": "Google Slides",
  "application/vnd.google-apps.folder": "folder",
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document",
  "text/plain": "text file",
};

// Tool definition in the format OpenAI function calling expects.
export const DRIVE_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "drive_search",
    description:
      "Search the user's Google Drive for files whose name or contents contain any of the " +
      "keywords. This is keyword search, not a question answerer: pass a few short words " +
      "or phrases likely to appear in the file (e.g. [\"Q3 planning\", \"hiring\"]), not a " +
      "full question. Returns each file's id, name, type, last modified date, and link, " +
      "best match first. To see what a file says, call drive_read_file with its id.",
    parameters: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: { type: "string" },
          description: `1-${MAX_KEYWORDS} short words or phrases. A file matches if it contains any of them.`,
        },
        modified_after: {
          type: "string",
          description: "Only files changed on or after this day, formatted YYYY-MM-DD.",
        },
        type: {
          type: "string",
          enum: ["doc", "sheet", "slides", "pdf", "any"],
          description: "Only this kind of file (default any).",
        },
        limit: {
          type: "integer",
          description: `How many files to return (default ${DEFAULT_RESULTS}, max ${MAX_RESULTS}).`,
        },
      },
      required: ["keywords"],
      additionalProperties: false,
    },
  },
} as const;

export type DriveSearchOptions = {
  keywords: string[];
  modifiedAfter?: string;
  type?: string;
  limit?: number;
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  owners?: { displayName?: string }[];
};

export async function driveSearch(accessToken: string, options: DriveSearchOptions): Promise<string> {
  const keywords = options.keywords
    .map((keyword) => keyword.trim().slice(0, MAX_KEYWORD_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS);
  if (keywords.length === 0) return "No keywords given. Pass a few short words to search for.";
  const limit = Math.min(Math.max(Math.round(options.limit ?? DEFAULT_RESULTS), 1), MAX_RESULTS);

  const conditions = [
    `(${keywords.map((keyword) => `fullText contains '${escapeQuery(keyword)}'`).join(" or ")})`,
    "trashed = false",
    "mimeType != 'application/vnd.google-apps.folder'",
  ];
  if (options.type && TYPE_FILTERS[options.type]) conditions.push(TYPE_FILTERS[options.type]);
  if (options.modifiedAfter) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(options.modifiedAfter)) {
      return `"${options.modifiedAfter}" isn't a valid date. Use YYYY-MM-DD.`;
    }
    conditions.push(`modifiedTime >= '${options.modifiedAfter}T00:00:00'`);
  }

  // Full-text results come back best match first; Drive doesn't allow orderBy with them.
  const params = new URLSearchParams({
    q: conditions.join(" and "),
    pageSize: String(limit),
    fields: "files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName))",
    // Include shared drives, not just My Drive and files shared with the user.
    corpora: "allDrives",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
  });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return driveError(response.status, await response.text());

  const { files } = (await response.json()) as { files: DriveFile[] };
  const searched = keywords.map((keyword) => `"${keyword}"`).join(", ");
  if (files.length === 0) {
    return `No Drive files contain ${searched}. Try other keywords (synonyms, a title word, a person's name).`;
  }

  const lines = files.map((file, index) => {
    const owner = file.owners?.[0]?.displayName;
    return (
      `${index + 1}. ${file.name} (${DRIVE_TYPE_NAMES[file.mimeType] ?? file.mimeType})\n` +
      `   id: ${file.id} | modified ${file.modifiedTime.slice(0, 10)}` +
      (owner ? ` | owner: ${owner}` : "") +
      (file.webViewLink ? `\n   link: ${file.webViewLink}` : "")
    );
  });
  return [
    `${files.length} Drive file${files.length === 1 ? "" : "s"} containing ${searched} (best match first):`,
    ...lines,
    "Call drive_read_file with a file's id (and a query) to see what it says. Share links with the user when helpful.",
  ].join("\n\n");
}

// Drive query strings are single-quoted; escape backslashes and quotes inside them.
function escapeQuery(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// Turns a Drive API error into something the AI can act on or pass on to the user.
export function driveError(status: number, body: string): string {
  let reason = body.slice(0, 300);
  try {
    reason = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? reason;
  } catch {
    // Not JSON; use the raw text.
  }
  if (status === 401) {
    return "Google Drive rejected the connection. The user needs to reconnect Google Drive on the Integrations page.";
  }
  if (status === 403 && /has not been used|is disabled/i.test(reason)) {
    return `The Google Drive API isn't enabled for this app's Google Cloud project: ${reason}`;
  }
  if (status === 404) return "That Drive file doesn't exist or the user can't access it.";
  return `Google Drive error ${status}: ${reason}`;
}
