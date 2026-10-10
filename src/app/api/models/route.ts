export const runtime = 'nodejs';

import { apiKeyManager } from '@/lib/server/api-key-manager';
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/server/rate-limiter';

// Server-side cache for models list (5 minute TTL)
let cachedModels: Array<{
  name: string;
  version: string;
  displayName: string;
  description: string;
}> | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  // Rate limiting
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const rateLimitResult = checkRateLimit(clientIp, 'models');
  if (!rateLimitResult.allowed) {
    return rateLimitExceededResponse(rateLimitResult);
  }

  // Return cached models if fresh
  const now = Date.now();
  if (cachedModels && (now - cacheTime) < CACHE_TTL_MS) {
    return Response.json({ models: cachedModels });
  }

  try {
    const { result } = await apiKeyManager.executeWithFailover(async (activeKey) => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(activeKey)}`,
        { signal: AbortSignal.timeout(6000) }
      );
      const data = await response.json().catch(() => ({}));
      return {
        result: data,
        status: response.status,
        error: data.error?.message,
      };
    });

    const models = (result.models || [])
      .filter((model: any) => 
        typeof model.name === 'string' && 
        model.name.includes('gemini') && 
        (model.supportedGenerationMethods || []).includes('generateContent')
      )
      .map((model: any) => ({
        name: model.name,
        version: model.version || '',
        displayName: model.displayName || model.name.replace('models/', ''),
        description: model.description || '',
      }));

    if (models.length > 0) {
      cachedModels = models;
      cacheTime = now;
    }

    return Response.json({ models });
  } catch (error: any) {
    // If cached models exist from prior run, return them as fallback
    if (cachedModels && cachedModels.length > 0) {
      return Response.json({ models: cachedModels });
    }

    return Response.json({ error: 'Could not load models list from provider.' }, { status: 502 });
  }
}
