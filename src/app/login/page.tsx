'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { authenticatedFetch } from '@/lib/api-client';
import { LogIn, Mail, Lock, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate inputs before making request
      if (!email || !email.trim()) {
        setError('Please enter your email address');
        setLoading(false);
        return;
      }

      if (!password || !password.trim()) {
        setError('Please enter your password');
        setLoading(false);
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setError('Please enter a valid email address');
        setLoading(false);
        return;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (authError) {
        // Log the full error for debugging
        console.error('Supabase auth error:', {
          message: authError.message,
          status: authError.status,
          name: authError.name,
          error: authError
        });

        // Provide more specific error messages
        if (authError.message.includes('Invalid login credentials') || authError.message.includes('Invalid credentials')) {
          throw new Error('Invalid email or password. Please check your credentials and try again.');
        } else if (authError.message.includes('Email not confirmed')) {
          throw new Error('Please verify your email address before logging in.');
        } else if (authError.message.includes('User not found')) {
          throw new Error('No account found with this email address.');
        } else if (authError.status === 400) {
          // 400 Bad Request - usually means invalid input format
          const errorMsg = authError.message || 'Invalid request format. Please check your email and password.';
          throw new Error(errorMsg);
        }
        throw authError;
      }

      if (data.session) {
        // Check user's role - only allow Store Manager and Shift In Charge to login
        try {
          const response = await authenticatedFetch(`/api/users/${data.session.user.id}`);
          
          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
              const userRole = result.data.role?.name;
              
              // Only allow Store Manager and Shift In Charge to login
              if (userRole !== 'Store Manager' && userRole !== 'Shift In Charge') {
                // Sign out the user
                await supabase.auth.signOut();
                setError('Access denied. Only Store Managers and Shift In Charge can access this system.');
                return;
              }
              
              // Role is valid, proceed to dashboard
              router.push('/dashboard');
              return;
            }
          }
          
          // If we can't fetch user data, deny access
          await supabase.auth.signOut();
          setError('Unable to verify your role. Access denied.');
        } catch (roleError: any) {
          // If role check fails, sign out and show error
          await supabase.auth.signOut();
          setError('Unable to verify your role. Access denied.');
        }
      }
    } catch (err: any) {
      console.error('Login error:', err);
      // Extract error message from various error formats
      let errorMessage = 'Login failed';
      if (err.message) {
        errorMessage = err.message;
      } else if (err.error?.message) {
        errorMessage = err.error.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordMessage(null);
    setForgotPasswordLoading(true);

    try {
      // Use environment variable for production, fallback to window.location.origin for dev
      // This ensures password reset links work correctly in production
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || window.location.origin;
      
      // First, check if user exists by trying to sign in (this validates the email exists)
      // Note: We don't actually sign them in, we just check if the email is valid
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotPasswordEmail, {
        redirectTo: `${baseUrl}/reset-password`,
      });

      if (resetError) {
        // Provide more helpful error messages
        if (resetError.message.includes('User not found') || resetError.message.includes('Invalid login credentials')) {
          throw new Error('No account found with this email address. Please check your email or contact your administrator.');
        } else if (resetError.message.includes('rate limit') || resetError.message.includes('too many')) {
          throw new Error('Too many password reset requests. Please wait a few minutes and try again.');
        } else if (resetError.message.includes('email')) {
          throw new Error('Invalid email address. Please check and try again.');
        }
        throw resetError;
      }

      setForgotPasswordMessage('Password reset email sent! Please check your inbox (and spam folder). If you don\'t receive it within a few minutes, check your Supabase email settings.');
      setForgotPasswordEmail('');
    } catch (err: any) {
      console.error('Password reset error:', err);
      setForgotPasswordMessage(err.message || 'Failed to send reset email. Please check your email address and try again.');
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl border border-gray-200/60 shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-xl mb-4">
            <LogIn className="w-8 h-8 text-slate-700" />
          </div>
          <h1 className="text-2xl font-bold mb-1 text-gray-900">Staff Roster Dashboard</h1>
          <p className="text-sm text-gray-500">Sign in to your account</p>
        </div>
        
        {!showForgotPassword ? (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 pl-11 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 text-gray-900 bg-white transition-all outline-none text-sm"
                  required
                  placeholder="Enter your email"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pl-11 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 text-gray-900 bg-white transition-all outline-none text-sm"
                  required
                  placeholder="Enter your password"
                />
              </div>
            </div>
            {error && (
              <div className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
            >
              {loading ? (
                'Logging in...'
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Login
                </>
              )}
            </button>
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                Forgot your password?
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                <input
                  type="email"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  className="w-full px-4 py-3 pl-11 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500 text-gray-900 bg-white transition-all outline-none text-sm"
                  required
                  placeholder="Enter your email"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                We'll send you a link to reset your password
              </p>
            </div>
            {forgotPasswordMessage && (
              <div className={`text-sm p-3 rounded-lg border ${
                forgotPasswordMessage.includes('sent') 
                  ? 'bg-green-50 text-green-700 border-green-200' 
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {forgotPasswordMessage}
              </div>
            )}
            <button
              type="submit"
              disabled={forgotPasswordLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
            >
              {forgotPasswordLoading ? 'Sending...' : (
                <>
                  <Mail className="w-4 h-4" />
                  Send Reset Link
                </>
              )}
            </button>
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(false);
                  setForgotPasswordMessage(null);
                  setForgotPasswordEmail('');
                }}
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-1 justify-center"
              >
                <ArrowRight className="w-3 h-3 rotate-180" />
                Back to login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
