'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const tokenResult = await currentUser.getIdTokenResult(true);
          setRole((tokenResult.claims?.role as string) || 'USER');
        } catch (err) {
          console.error("Token refresh error", err);
        }
      } else {
        setRole('USER');
      }

      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []); 

  // Enforce role-based routing on pathname changes
  useEffect(() => {
    if (!loading) {
      // If not logged in and trying to access a protected route
      if (!user && (pathname === '/ide' || pathname === '/pcb-designer' || pathname === '/finance' || pathname === '/admin' || pathname === '/profile' || pathname === '/support')) {
        router.push('/login?redirect=' + pathname);
      } else if (user) {
        // Only guard privileged routes against unauthorized access
        if (pathname === '/finance' && role !== 'FINANCE' && role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
           router.push('/ide');
        } else if (pathname === '/admin' && role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
           router.push('/ide');
        } else if (pathname === '/support' && role !== 'SUPPORT' && role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
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
