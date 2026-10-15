import React, { createContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_SESSION_KEY = 'USER_SESSION';

const getSessionToken = (session) => {
  const token = session?.access_token ?? session?.token ?? session?.accessToken ?? session?.authToken;
  return typeof token === 'string' && token.split('.').length === 3 ? token : null;
};

// Create and export the Context
export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [userToken, setUserToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const raw = await AsyncStorage.getItem(USER_SESSION_KEY);
        if (raw) {
          const session = JSON.parse(raw);
          const resolvedToken = getSessionToken(session);

          setUserToken(resolvedToken);
          setUser(resolvedToken ? session.user ?? null : null);
          if (!resolvedToken) {
            await AsyncStorage.removeItem(USER_SESSION_KEY);
          }
        } else {
          setUserToken(null);
          setUser(null);
        }
      } catch (error) {
        console.warn('Failed to restore auth session:', error);
        setUserToken(null);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (session = {}) => {
    const token = getSessionToken(
      typeof session === 'string' ? { token: session } : session,
    );
    if (!token) {
      throw new Error('The sign-in response did not include a valid access token.');
    }

    const userPayload = session.user ?? session.userDetails ?? session.user_data ?? session;

    setUserToken(token);
    setUser(userPayload);
    try {
      await AsyncStorage.setItem(
        USER_SESSION_KEY,
        JSON.stringify({ access_token: token, token, user: userPayload }),
      );
    } catch (error) {
      console.warn('Failed to persist auth session:', error);
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem(USER_SESSION_KEY);
    } catch (error) {
      console.warn('Failed to clear auth session:', error);
    } finally {
      // Always reset state regardless of AsyncStorage success/failure
      setUserToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ userToken, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};