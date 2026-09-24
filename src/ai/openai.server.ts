/*  Shared helpers for the AI backend. Files ending in .server.ts run only on the server
    (Vercel functions and the Vite dev middleware); never import them from browser code.
    The OpenAI key (API_KEY) only lives on the server, never in the browser bundle. */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const MODEL = "gpt-4.1-mini";
// Most tool calls the model may make before it has to answer, so it can't loop forever.
const MAX_TOOL_ROUNDS = 4;
const MAX_ITEMS = 50;
const MAX_ITEM_LENGTH = 2000;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type HandlerOptions = {
  // Only the local dev server turns this off, so the backend-free demo page works.
  requireAuth?: boolean;
  // Only the local dev server turns this on: logs what the model received and returned
  // to the terminal. Off in production so users' notes don't end up in server logs.
  debug?: boolean;
};

export type Handler = (request: Request, options?: HandlerOptions) => Promise<Response>;

// Runs the checks every AI endpoint needs before calling OpenAI.
export async function guardRequest(
  request: Request,
  { requireAuth = true }: HandlerOptions,
): Promise<Response | null> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!process.env.API_KEY) return json({ error: "API_KEY is not configured" }, 500);
  if (requireAuth && !(await isSignedIn(request))) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

export async function chat(messages: ChatMessage[], maxTokens: number): Promise<string | null> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
  });

  if (!response.ok) {
    console.error("[ai] OpenAI API error", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: object };
};

// Runs one tool call and returns the text the model should see as the result.
export type ToolRunner = (name: string, args: Record<string, unknown>) => Promise<string>;

type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

type StreamDelta = {
  content?: string | null;
  tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
};

// Streams the model's answer as it's written. The model may call tools first: each round,
// its tool calls are run and the results sent back, until it answers or MAX_TOOL_ROUNDS is
// reached. Only the final answer's text is yielded. Yields nothing if OpenAI fails.
export async function* streamChatWithTools(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  runTool: ToolRunner,
  maxTokens: number,
  log?: (line: string) => void,
): AsyncGenerator<string> {
  const conversation: object[] = [...messages];
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const canUseTools = tools.length > 0 && round < MAX_TOOL_ROUNDS;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: conversation,
        stream: true,
        ...(canUseTools ? { tools } : {}),
      }),
    });
    if (!response.ok || !response.body) {
      console.error("[ai] OpenAI API error", response.status, await response.text());
      return;
    }

    // Tool calls arrive in pieces; stitch them together by index.
    const toolCalls: ToolCall[] = [];
    let content = "";
    for await (const delta of readStreamDeltas(response.body)) {
      for (const part of delta.tool_calls ?? []) {
        const call = (toolCalls[part.index] ??= {
          id: "",
          type: "function",
          function: { name: "", arguments: "" },
        });
        if (part.id) call.id = part.id;
        call.function.name += part.function?.name ?? "";
        call.function.arguments += part.function?.arguments ?? "";
      }
      if (delta.content) {
        content += delta.content;
        if (toolCalls.length === 0) yield delta.content;
      }
    }
    if (toolCalls.length === 0) return;

    conversation.push({ role: "assistant", content: content || null, tool_calls: toolCalls });
    for (const call of toolCalls) {
      let result: string;
      try {
        result = await runTool(call.function.name, JSON.parse(call.function.arguments || "{}"));
      } catch (error) {
        console.error("[ai] tool failed", call.function.name, error);
        result = `The ${call.function.name} tool failed. Tell the user it didn't work.`;
      }
      log?.(`tool ${call.function.name}(${call.function.arguments}) →\n${result}`);
      conversation.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
}

// Parses OpenAI's server-sent events ("data: {...}" lines) into message deltas.
async function* readStreamDeltas(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamDelta> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.trim().replace(/^data:\s*/, "");
      if (!line.trim().startsWith("data:")) continue;
      if (data === "[DONE]") return;
      try {
        const delta = JSON.parse(data)?.choices?.[0]?.delta;
        if (delta) yield delta;
      } catch {
        // Ignore keep-alive or partial lines.
      }
    }
  }
}

// A Supabase client that acts as the user who sent the request, so Row Level Security
// limits every query to their own data. Null if the request has no login token.
export function createUserClient(request: Request): SupabaseClient | null {
  const token = bearerToken(request);
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !anonKey) return null;
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

// The login token the browser sent, if any.
export function bearerToken(request: Request): string | null {
  return request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? null;
}

async function isSignedIn(request: Request): Promise<boolean> {
  const token = bearerToken(request);
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !anonKey) return false;

  try {
    const response = await fetch(`${new URL(supabaseUrl).origin}/auth/v1/user`, {
      headers: { apikey: anonKey, authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function stringList(body: unknown, field: string): string[] | null {
  const value = (body as Record<string, unknown> | null)?.[field];
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return null;
  if (!value.every((item) => typeof item === "string" && item.length <= MAX_ITEM_LENGTH)) {
    return null;
  }
  return value;
}

export function isShortString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ITEM_LENGTH;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
