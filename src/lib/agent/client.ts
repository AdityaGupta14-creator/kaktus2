import type { ImageAttachment } from './image-attachments';
import { auth } from '@/lib/firebase';

export type AgentPart = { text: string } | { inline_data: { mime_type: string; data: string } };

export interface AgentMessage {
  role: 'user' | 'model';
  parts: AgentPart[];
}

export function toGeminiImagePart(image: ImageAttachment): AgentPart {
  return { inline_data: { mime_type: image.mimeType, data: image.data! } };
}

export interface AgentResponse {
  text: string;
  sources: Array<{ title: string; uri: string }>;
  searchQueries: string[];
  researched: boolean;
}

interface AgentRequest {
  apiKeys?: string[];
  model: string;
  systemPrompt: string;
  contents: AgentMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  research?: boolean;
  abortSignal?: AbortSignal;
}

/**
 * Sends request to secure server-side agent gateway.
 * The server manages key selection, rotation, bounded failover, and rate limiting.
 */
export async function requestAgent(request: AgentRequest): Promise<AgentResponse> {
  const payload = { ...request };
  delete (payload as any).apiKeys;
  delete (payload as any).apiKey;

  if (request.abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // Attach Firebase ID token if user is signed in
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const idToken = await currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${idToken}`;
    }
  } catch {
    // Non-fatal, continue with unauthenticated request
  }

  const response = await fetch('/api/agent', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: request.abortSignal,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Agent generation failed.');
  }

  return {
    text: data.text || '',
    sources: Array.isArray(data.sources) ? data.sources : [],
    searchQueries: Array.isArray(data.searchQueries) ? data.searchQueries : [],
    researched: data.researched === true,
  };
}

/**
 * Loads available Gemini models from the secure server-side endpoint.
 * No API key query parameters are passed.
 */
export async function listAgentModels(_apiKey?: string): Promise<Array<{
  name: string;
  version: string;
  displayName: string;
  description: string;
}>> {
  const response = await fetch('/api/models');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not load models.');
  return data.models || [];
}
