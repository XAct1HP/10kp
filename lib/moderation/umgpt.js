// U-M GPT Toolkit client.
// The gateway is OpenAI Chat Completions-compatible, so we just POST JSON.
// Never call this from the browser — the API key must stay server-only.

function getConfig() {
  const apiKey = process.env.UMGPT_API_KEY;
  const baseUrl =
    process.env.UMGPT_BASE_URL || "https://api.toolkit.umgpt.umich.edu/v1";
  const model = process.env.UMGPT_MODEL || "gpt-4o";

  if (!apiKey) {
    throw new Error(
      "Missing UMGPT_API_KEY environment variable (server-side only)"
    );
  }

  return { apiKey, baseUrl: baseUrl.replace(/\/$/, ""), model };
}

async function chatCompletion({ messages, model, responseFormat, temperature }) {
  const { apiKey, baseUrl, model: defaultModel } = getConfig();

  const body = {
    model: model || defaultModel,
    messages,
    temperature: temperature ?? 0,
  };

  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(
      `UM-GPT error ${res.status}: ${raw.slice(0, 500) || res.statusText}`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`UM-GPT returned non-JSON response: ${raw.slice(0, 300)}`);
  }

  const content = parsed?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("UM-GPT response missing message content");
  }
  return content;
}

// Call UM-GPT and demand strict JSON. If the model puts stray text around the
// JSON we still try to salvage it.
export async function callJson({ messages, model, temperature } = {}) {
  const content = await chatCompletion({
    messages,
    model,
    responseFormat: { type: "json_object" },
    temperature,
  });

  try {
    return JSON.parse(content);
  } catch {
    // Salvage — pull the first {...} block.
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* fall through */
      }
    }
    throw new Error(`Could not parse UM-GPT JSON: ${content.slice(0, 300)}`);
  }
}

// Vision message helper — attach one or more images alongside a text prompt.
// UM-GPT supports OpenAI-style image_url parts.
export function imageMessage({ text, images }) {
  const parts = [];
  if (text) parts.push({ type: "text", text });
  for (const img of images || []) {
    // img can be a URL string OR a data URL.
    parts.push({
      type: "image_url",
      image_url: { url: img },
    });
  }
  return { role: "user", content: parts };
}
