'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authenticatedFetch } from '@/lib/api-client';

interface TestEnvironmentContextType {
  isTestMode: boolean;
  isLoading: boolean;
  startTestSession: () => Promise<void>;
  endTestSession: () => Promise<void>;
  testSessionData: {
    userIds: string[];
    startTime: Date | null;
  } | null;
}

const TestEnvironmentContext = createContext<TestEnvironmentContextType | undefined>(undefined);

export function TestEnvironmentProvider({ children }: { children: ReactNode }) {
  const [isTestMode, setIsTestMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [testSessionData, setTestSessionData] = useState<{
    userIds: string[];
    startTime: Date | null;
  } | null>(null);

  // Load test mode state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('testEnvironmentSession');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setIsTestMode(data.active);
        setTestSessionData(data);
      } catch (e) {
        console.error('Failed to parse test environment session data', e);
        localStorage.removeItem('testEnvironmentSession');
      }
    }
    setIsLoading(false);
  }, []);

  const startTestSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await authenticatedFetch('/api/test-environment/start', {
        method: 'POST',
      });

      const result = await response.json();
      if (result.success) {
        const sessionData = {
          userIds: result.data.userIds || [],
          startTime: new Date(),
        };
        setIsTestMode(true);
        setTestSessionData(sessionData);
        localStorage.setItem('testEnvironmentSession', JSON.stringify({
          active: true,
          ...sessionData,
        }));
        
        // Refresh the page to ensure all components are aware of test mode
        window.location.reload();
      } else {
        console.error('Failed to start test session:', result.error);
        alert(`Failed to start test session: ${result.error?.message || 'Unknown error'}`);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error starting test session:', error);
      alert('Failed to start test session. Please try again.');
      setIsLoading(false);
    }
  }, []);

  const endTestSession = useCallback(async () => {
    if (!confirm('End test session? All test data will be permanently deleted.')) {
      return;
    }

    try {
      setIsLoading(true);
      const response = await authenticatedFetch('/api/test-environment/end', {
        method: 'POST',
      });

      const result = await response.json();
      if (result.success) {
        setIsTestMode(false);
        setTestSessionData(null);
        localStorage.removeItem('testEnvironmentSession');
        
        // Refresh the page to ensure all components are aware of test mode being off
        window.location.reload();
      } else {
        console.error('Failed to end test session:', result.error);
        alert(`Failed to end test session: ${result.error?.message || 'Unknown error'}`);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error ending test session:', error);
      alert('Failed to end test session. Please try again.');
      setIsLoading(false);
    }
  }, []);

  // Keyboard shortcut handler: Control + Option + Command + T
  // Mac: Ctrl + Option + Cmd + T
  // Windows/Linux: Ctrl + Alt + T (since Command key doesn't exist)
  useEffect(() => {
    if (isLoading) {
      console.log('Test environment: Skipping keyboard shortcut setup, still loading...');
      return;
    }

    console.log('Test environment: Setting up keyboard shortcut handler');

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input field
      const target = e.target as HTMLElement;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }

      const isMeta = e.metaKey; // Command on Mac
      const isCtrl = e.ctrlKey; // Control
      const isAlt = e.altKey; // Option on Mac, Alt on Windows/Linux

      // Check for T key - On macOS, Ctrl+Option+Cmd+T produces "þ" character
      const isTKey = e.key === 't' || e.key === 'T' || e.key === 'þ' || e.code === 'KeyT';
      
      if (isTKey) {
        // Mac: All three modifiers (Cmd + Option + Ctrl)
        // Windows/Linux: Ctrl + Alt (since Cmd doesn't exist)
        const allModifiersPressed = isMeta && isCtrl && isAlt; // Mac
        const windowsModifiersPressed = isCtrl && isAlt && !isMeta; // Windows/Linux

        // Debug logging
        console.log('Test environment shortcut detected:', {
          key: e.key,
          code: e.code,
          allModifiersPressed,
          windowsModifiersPressed,
          isMeta,
          isCtrl,
          isAlt,
          isTestMode
        });

        if (allModifiersPressed || windowsModifiersPressed) {
          e.preventDefault();
          e.stopPropagation();
          
          console.log('Triggering test environment toggle, isTestMode:', isTestMode);
          
          if (isTestMode) {
            endTestSession();
          } else {
            startTestSession();
          }
        }
      }
    };

    // Use capture phase to catch the event early, and attach to both window and document
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keydown', handleKeyDown, true);

    console.log('Test environment: Keyboard shortcut handler attached');

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      console.log('Test environment: Keyboard shortcut handler removed');
    };
  }, [isTestMode, isLoading, startTestSession, endTestSession]);

  return (
    <TestEnvironmentContext.Provider
      value={{
        isTestMode,
        isLoading,
        startTestSession,
        endTestSession,
        testSessionData,
      }}
    >
      {children}
    </TestEnvironmentContext.Provider>
  );
}

export function useTestEnvironment() {
  const context = useContext(TestEnvironmentContext);
  if (context === undefined) {
    throw new Error('useTestEnvironment must be used within a TestEnvironmentProvider');
  }
  return context;
}

