import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

/**
 * Default model: Meta Llama 3.2 3B Instruct (open weights, very cheap & fast).
 * "us." is the cross-region inference profile - use it with us-east-1 / us-east-2 / us-west-2.
 * Override with BEDROCK_MODEL_ID (e.g. us.meta.llama3-2-1b-instruct-v1:0, meta.llama3-1-8b-instruct-v1:0).
 */
export const DEFAULT_BEDROCK_MODEL_ID = "us.meta.llama3-2-3b-instruct-v1:0";

let client: BedrockRuntimeClient | null = null;

export function isBedrockConfigured(): boolean {
  return Boolean(
    process.env.AWS_BEARER_TOKEN_BEDROCK ||
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
  );
}

// Created lazily so the .env file has already been loaded when the SDK reads credentials.
function getClient(): BedrockRuntimeClient {
  if (!client) {
    client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "us-east-1" });
  }
  return client;
}

/**
 * Uses the model-agnostic Converse API, so any Bedrock text model can be swapped in
 * through BEDROCK_MODEL_ID without code changes. Everything goes in one user message
 * because some open models reject a separate system prompt.
 */
export async function generateWithBedrock(
  prompt: string,
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const modelId = process.env.BEDROCK_MODEL_ID || DEFAULT_BEDROCK_MODEL_ID;
  const out = await getClient().send(
    new ConverseCommand({
      modelId,
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: {
        maxTokens: opts.maxTokens ?? 160,
        temperature: opts.temperature ?? 0.8,
        topP: 0.9,
      },
    }),
  );

  const blocks = (out.output?.message?.content ?? []) as Array<{ text?: string }>;
  const text = blocks.map((b) => b.text ?? "").join("").trim();
  if (!text) throw new Error("Bedrock returned an empty response");
  return text;
}
