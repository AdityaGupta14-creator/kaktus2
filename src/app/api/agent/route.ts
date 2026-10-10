export const runtime = 'nodejs';

import { apiKeyManager } from '@/lib/server/api-key-manager';
import { requireAuthenticatedUser, handleAuthError } from '@/lib/server/auth';
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/server/rate-limiter';
import { checkAndConsumeEntitlement, rollbackEntitlement, recordApiUsage } from '@/lib/server/usage-meter';
import { logSecurityEvent } from '@/lib/server/security-logger';

const MAX_BODY_BYTES = 1_500_000;
const MODEL_PATTERN = /^(?:models\/)?gemini-[a-zA-Z0-9._-]+$/;

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface GeminiResponse {
  error?: { message?: string; status?: string; code?: number };
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      webSearchQueries?: string[];
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export async function POST(request: Request) {
  const startTime = Date.now();

  // 1. Validate payload size
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: 'Request is too large.' }, { status: 413 });
  }

  let callerUid: string;
  try {
    const user = await requireAuthenticatedUser(request);
    callerUid = user.uid;
  } catch (error) {
    return handleAuthError(error);
  }

  // 3. Rate limiting per user / IP
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const rateLimitKey = callerUid !== 'anonymous' ? callerUid : clientIp;
  const rateLimitResult = checkRateLimit(rateLimitKey, 'agent');
  if (!rateLimitResult.allowed) {
    return rateLimitExceededResponse(rateLimitResult);
  }

  // 4. Validate request JSON
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) return Response.json({ error: 'Request body must be an object.' }, { status: 400 });
    body = parsed;
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (!validText(body.model, 160) || !MODEL_PATTERN.test(body.model)) {
    return Response.json({ error: 'A valid Gemini model identifier is required.' }, { status: 400 });
  }
  if (!validText(body.systemPrompt, 600_000) || !Array.isArray(body.contents) || body.contents.length > 80) {
    return Response.json({ error: 'Invalid agent context.' }, { status: 400 });
  }

  const model = body.model.startsWith('models/') ? body.model : 'models/' + body.model;

  // 5. Entitlement check & atomic run deduction
  const entitlement = await checkAndConsumeEntitlement(callerUid !== 'anonymous' ? callerUid : null, model);
  if (!entitlement.allowed) {
    return Response.json({ error: entitlement.reason || 'Plan allowance exceeded.' }, { status: 403 });
  }

  const requestPayload = {
    systemInstruction: { parts: [{ text: body.systemPrompt }] },
    contents: body.contents,
    ...(body.research === true ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: {
      temperature: typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 1) : 0.2,
      maxOutputTokens: typeof body.maxOutputTokens === 'number' ? Math.min(Math.max(body.maxOutputTokens, 256), 32768) : 16384,
      responseMimeType: 'text/plain',
    },
  };

  // 6. Execute Gemini call with automatic bounded key rotation and failover
  try {
    const { result, keyId } = await apiKeyManager.executeWithFailover(async (activeKey) => {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(activeKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
          signal: AbortSignal.timeout(45_000),
        }
      );

      const upstreamData: GeminiResponse = await upstream.json().catch((): GeminiResponse => ({}));
      return {
        result: upstreamData,
        status: upstream.status,
        error: upstreamData.error?.message,
      };
    });

    if (result.error) {
      if (entitlement.decremented) await rollbackEntitlement(callerUid);
      return Response.json({ error: 'Generation request failed.' }, { status: 502 });
    }

    const durationMs = Date.now() - startTime;
    const inputTokens = result.usageMetadata?.promptTokenCount;
    const outputTokens = result.usageMetadata?.candidatesTokenCount;
    const totalTokens = result.usageMetadata?.totalTokenCount;

    // 7. Record usage metering
    recordApiUsage({
      uid: callerUid,
      endpoint: '/api/agent',
      provider: 'Gemini',
      model,
      timestamp: new Date().toISOString(),
      success: true,
      failure: false,
      durationMs,
      inputTokens,
      outputTokens,
      totalTokens,
      keyId,
    });

    // Extract content
    const text = result.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '';
    const grounding = result.candidates?.[0]?.groundingMetadata;
    const sources = Array.isArray(grounding?.groundingChunks)
      ? grounding.groundingChunks.flatMap(chunk => chunk.web?.uri && chunk.web?.title
        ? [{ title: chunk.web.title.slice(0, 240), uri: chunk.web.uri }]
        : []).filter((source: { uri: string }, index: number, all: { uri: string }[]) => all.findIndex(item => item.uri === source.uri) === index).slice(0, 20)
      : [];
    const searchQueries = Array.isArray(grounding?.webSearchQueries) ? grounding.webSearchQueries.slice(0, 12) : [];

    return Response.json({
      text,
      sources,
      searchQueries,
      researched: body.research === true && sources.length > 0,
      tokens: totalTokens ? { input: inputTokens, output: outputTokens, total: totalTokens } : undefined,
    });

  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    if (entitlement.decremented) {
      await rollbackEntitlement(callerUid);
    }

    logSecurityEvent('API_REQUEST_FAILED', { uid: callerUid }, {
      model,
      durationMs,
      error: error.message,
    });

    recordApiUsage({
      uid: callerUid,
      endpoint: '/api/agent',
      provider: 'Gemini',
      model,
      timestamp: new Date().toISOString(),
      success: false,
      failure: true,
      errorType: error.message?.includes('rate limit') ? 'RATE_LIMIT' : 'PROVIDER_ERROR',
      durationMs,
    });

    return Response.json(
      { error: error.message || 'Upstream service temporarily unavailable.' },
      { status: error.message?.includes('rate limit') ? 429 : 502 }
    );
  }
}

export async function GET() {
  return Response.json({ ok: true, service: 'Hardware Studio Agent Gateway' });
}
