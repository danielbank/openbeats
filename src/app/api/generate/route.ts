import { NextRequest } from "next/server";
import OpenAI from "openai";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.2";
const MAX_API_KEY_LENGTH = 512;

function bearerApiKey(req: NextRequest): string | null {
  const raw = req.headers.get("authorization");
  if (!raw) return null;
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  const key = m?.[1]?.trim();
  if (!key || key.length > MAX_API_KEY_LENGTH) return null;
  return key;
}

/**
 * Streams the model's OpenUI Lang output as raw text deltas. The client feeds
 * the accumulating text into OpenUI's <Renderer>, so the control layout appears as it streams.
 *
 * Expects `Authorization: Bearer <openai_api_key>` on each request. The key is
 * not persisted server-side.
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = bearerApiKey(req);
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "Missing API key. Send Authorization: Bearer <your OpenAI API key>.",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
    });

    const { systemPrompt, prompt } = (await req.json()) as {
      systemPrompt: string;
      prompt: string;
    };

    if (!systemPrompt || !prompt) {
      return new Response(JSON.stringify({ error: "Missing systemPrompt or prompt" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const completion = await client.chat.completions.create({
      model: MODEL,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) controller.enqueue(encoder.encode(delta));
          }
        } catch (err) {
          controller.error(err);
          return;
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
