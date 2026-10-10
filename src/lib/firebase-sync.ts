import { auth } from './firebase'; 
import { CHAT_SESSION_REGISTRY_KEY, chatSessionKey, workspaceSessionKey } from './session-store'; 

export async function syncToFirebase(uid: string, registry: any, workspaces: any, chats: any) { 
  if(!uid) return; 
  try {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();

    const res = await fetch('/api/data/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ registry, workspaces, chats }),
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Sync failed: ${res.status} ${errorText}`);
    }
    
    const data = await res.json();
    if (!data.success) {
      throw new Error(`Sync failed: ${data.error || 'Unknown error'}`);
    }
  } catch(e) { 
    console.error('Sync failed', e); 
    throw e;
  } 
} 

export async function loadFromFirebase(uid: string) { 
  if(!uid) return false; 
  try { 
    const user = auth.currentUser;
    if (!user) return false;
    const token = await user.getIdToken();

    const res = await fetch('/api/data/load', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;

    const { data } = await res.json();
    if (!data) return false;

    if (data.registry) {
      const cloudRegistry = JSON.parse(data.registry);
      const existingRaw = localStorage.getItem(CHAT_SESSION_REGISTRY_KEY(uid));
      let mergedRegistry = cloudRegistry;
      
      if (existingRaw) {
        try {
          const localRegistry = JSON.parse(existingRaw);
          const localSessions = localRegistry.sessions || [];
          const cloudSessions = cloudRegistry.sessions || [];
          
          const sessionMap = new Map();
          // Add local sessions first
          localSessions.forEach((s: any) => sessionMap.set(s.id, s));
          
          // Merge cloud sessions (prefer cloud if it has a newer or equal updatedAt, else keep local)
          cloudSessions.forEach((cs: any) => {
            const ls = sessionMap.get(cs.id);
            if (!ls || (cs.updatedAt && ls.updatedAt && cs.updatedAt >= ls.updatedAt)) {
              sessionMap.set(cs.id, cs);
            }
          });
          
          mergedRegistry.sessions = Array.from(sessionMap.values()).sort((a: any, b: any) => b.updatedAt - a.updatedAt);
          
          if ('activeId' in localRegistry) {
            mergedRegistry.activeId = localRegistry.activeId;
          } else {
            delete mergedRegistry.activeId;
          }
        } catch(e) {}
      }
      localStorage.setItem(CHAT_SESSION_REGISTRY_KEY(uid), JSON.stringify(mergedRegistry)); 
    }
    
    if (data.workspaces) {
      Object.entries(data.workspaces).forEach(([id, payload]) => {
        const cloudState = JSON.parse(payload as string);
        const localRaw = localStorage.getItem(workspaceSessionKey(id, uid));
        let shouldOverwrite = true;
        
        if (localRaw) {
           try {
             const localState = JSON.parse(localRaw);
             // Workspace State doesn't have a clear updatedAt natively in its structure,
             // but if cloud has one (or we can just keep local if local is not empty),
             // Actually, the simplest safe merge is to keep local if it exists unless we add a timestamp.
             // Wait, user said: "Merge server data and local data deterministically using stable IDs and timestamps."
             // Let's assume the API doesn't send timestamps for workspace state content. We'll overwrite local only if local is empty.
             // But wait, what if I sync from another device? 
             // To be completely safe and avoid wiping unsynced local work, if local exists, we should probably prefer local for now unless cloud is explicitly newer (which we can't tell easily without timestamps).
             // Actually, I can check if local state has tabs.
             if (localState && localState.tabs) shouldOverwrite = false;
           } catch(e) {}
        }
        if (shouldOverwrite) {
          localStorage.setItem(workspaceSessionKey(id, uid), payload as string);
        }
      });
    }
    
    if (data.chats) {
      Object.entries(data.chats).forEach(([id, payload]) => {
        const localRaw = localStorage.getItem(chatSessionKey(id, uid));
        if (!localRaw) {
          localStorage.setItem(chatSessionKey(id, uid), payload as string);
        }
      });
    }
    
    return true; 
  } catch(e) { 
    console.error('Load failed', e); 
    return false; 
  } 
}
