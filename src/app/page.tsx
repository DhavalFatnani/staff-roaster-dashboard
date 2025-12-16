'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { authenticatedFetch } from '@/lib/api-client';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    // Check if this is a password recovery link (has hash with access_token and type=recovery)
    if (typeof window !== 'undefined' && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const type = hashParams.get('type');
      
      if (accessToken && type === 'recovery') {
        // Redirect to reset-password page with the hash
        router.push(`/reset-password${window.location.hash}`);
        return;
      }
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      // Check user's role - only allow Store Manager and Shift In Charge
      try {
        const response = await authenticatedFetch(`/api/users/${session.user.id}`);
        
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            const userRole = result.data.role?.name;
            
            // Only allow Store Manager and Shift In Charge to access dashboard
            if (userRole !== 'Store Manager' && userRole !== 'Shift In Charge') {
              // Sign out and redirect to login
              await supabase.auth.signOut();
              router.push('/login');
              return;
            }
            
            // Role is valid, proceed to dashboard
            router.push('/dashboard');
            return;
          }
        }
        
        // If we can't verify role, sign out
        await supabase.auth.signOut();
        router.push('/login');
      } catch (error) {
        // If role check fails, sign out
        await supabase.auth.signOut();
        router.push('/login');
      }
    } else {
      router.push('/login');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-lg">Loading...</div>
    </div>
  );
}
