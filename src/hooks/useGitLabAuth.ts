import { useState, useCallback, useEffect, useRef } from 'react';
import { AUTH_ENVIRONMENTS, hasRequiredScope } from '../utils/gitlab';

export interface GitLabAuthState {
  token: string | null;
  tokenScope: string | null;
  needsAuth: boolean;
  insufficientScope: boolean;
  isLoading: boolean;
  authError: string | null;
  authEnv: string;
  handleSignIn: () => void;
  retryAuth: () => void;
}

export function useGitLabAuth(): GitLabAuthState {
  const [token, setToken] = useState<string | null>(null);
  const [tokenScope, setTokenScope] = useState<string | null>(null);
  const [authEnv, setAuthEnv] = useState(AUTH_ENVIRONMENTS[0]);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [insufficientScope, setInsufficientScope] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchToken = useCallback(async () => {
    setIsLoading(true);
    setAuthError(null);
    setNeedsAuth(false);
    setInsufficientScope(false);
    setTokenScope(null);

    let lastError: string | null = null;

    for (const env of AUTH_ENVIRONMENTS) {
      try {
        const response = await fetch(`/api/auth/gitlab/refresh?env=${env}`, {
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
        });

        if (response.ok) {
          const data = await response.json();
          const accessToken = data.providerInfo?.accessToken;
          const scope = data.providerInfo?.scope || '';

          if (accessToken) {
            if (!mountedRef.current) return;
            setAuthEnv(env);

            if (!hasRequiredScope(scope)) {
              setTokenScope(scope);
              setInsufficientScope(true);
              setIsLoading(false);
              return;
            }

            setToken(accessToken);
            setTokenScope(scope);
            setIsLoading(false);
            return;
          }
        } else {
          lastError = `Auth endpoint returned ${response.status} for env "${env}"`;
        }
      } catch (err) {
        lastError =
          err instanceof Error ? err.message : 'Network error during auth';
      }
    }

    if (!mountedRef.current) return;
    setNeedsAuth(true);
    if (lastError) setAuthError(lastError);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  const handleSignIn = useCallback(() => {
    const width = 500;
    const height = 700;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;

    const popup = window.open(
      `/api/auth/gitlab/start?env=${authEnv}`,
      'GitLab Sign In',
      `width=${width},height=${height},left=${left},top=${top}`,
    );

    if (!popup) {
      setAuthError('Popup was blocked. Please allow popups for this site.');
      return;
    }

    const checkPopup = setInterval(() => {
      if (!mountedRef.current) {
        clearInterval(checkPopup);
        return;
      }
      if (popup.closed) {
        clearInterval(checkPopup);
        setTimeout(() => {
          if (mountedRef.current) fetchToken();
        }, 1000);
      }
    }, 500);
  }, [authEnv, fetchToken]);

  return {
    token,
    tokenScope,
    needsAuth,
    insufficientScope,
    isLoading,
    authError,
    authEnv,
    handleSignIn,
    retryAuth: fetchToken,
  };
}
