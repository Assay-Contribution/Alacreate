/*  Talking to OpenAI: the models we use, one-shot chat, and streamed chat with tool calls.
    Files ending in .server.ts run only on the server (Vercel functions and the Vite dev
    middleware); never import them from browser code. The OpenAI key (API_KEY) only lives
    on the server, never in the browser bundle. */

// Fast, cheap model for chat, summaries, tool calls, and gathering material for reports.
export const CHAT_MODEL = process.env.AI_CHAT_MODEL ?? "gpt-4.1-mini";
// Stronger model for writing reports, where quality matters more than speed.
export const REPORT_MODEL = process.env.AI_REPORT_MODEL ?? "gpt-4.1";
// Most tool calls the model may make before it has to answer, so it can't loop forever.
const MAX_TOOL_ROUNDS = 4;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chat(
  messages: ChatMessage[],
  maxTokens: number,
  model = CHAT_MODEL,
): Promise<string | null> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.API_KEY}`,
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
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
  model = CHAT_MODEL,
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
        model,
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
