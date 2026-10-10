'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const [role, setRole] = useState<string>('USER');
  const tokenCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;
    let warningGivenForToken = false;

    const checkTokenExpiry = async (currentUser: User) => {
      try {
        const tokenResult = await currentUser.getIdTokenResult(false);
        const expiresAt = new Date(tokenResult.expirationTime).getTime();
        const now = Date.now();
        const timeUntilExpiryMs = expiresAt - now;

        // If less than 5 minutes remain and we haven't warned yet
        if (timeUntilExpiryMs > 0 && timeUntilExpiryMs <= 5 * 60 * 1000 && !warningGivenForToken) {
          warningGivenForToken = true;
          toast.warning('Your session will expire soon. We will refresh it securely.', {
            duration: 5000,
            position: 'top-center'
          });
          // Force refresh
          await currentUser.getIdToken(true);
          warningGivenForToken = false; // Reset after forced refresh
        }
      } catch (err) {
        console.error("Failed to check token expiry", err);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const tokenResult = await currentUser.getIdTokenResult(true);
          if (isMounted) setRole((tokenResult.claims?.role as string) || 'USER');
        } catch (err) {
          console.error("Token refresh error", err);
        }

        // Cleanup previous interval if exists
        if (tokenCheckIntervalRef.current) clearInterval(tokenCheckIntervalRef.current);
        
        // Start checking token expiry every 1 minute
        tokenCheckIntervalRef.current = setInterval(() => checkTokenExpiry(currentUser), 60000);
      } else {
        if (isMounted) setRole('USER');
        if (tokenCheckIntervalRef.current) {
          clearInterval(tokenCheckIntervalRef.current);
          tokenCheckIntervalRef.current = null;
        }
      }

      if (isMounted) {
        setUser(currentUser);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
      if (tokenCheckIntervalRef.current) {
        clearInterval(tokenCheckIntervalRef.current);
      }
    };
  }, []); 

  // Enforce role-based routing on pathname changes
  useEffect(() => {
    if (!loading) {
      // If not logged in and trying to access a protected route
      if (!user && (pathname === '/ide' || pathname === '/pcb-designer' || pathname === '/admin' || pathname === '/profile' || pathname === '/early-access')) {
        router.push('/login?redirect=' + pathname);
      } else if (user) {
        // Only guard privileged routes against unauthorized access
        if (pathname === '/admin' && role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
           router.push('/ide');
        }
      }
    }
  }, [pathname, user, loading, role, router]);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
