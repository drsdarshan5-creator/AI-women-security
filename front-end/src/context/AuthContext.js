import React, { createContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_SESSION_KEY = 'USER_SESSION';

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
          // Ensure we extract a valid token or fallback string
          const resolvedToken =
            session.token ??
            session.access_token ??
            (session.user ? 'authenticated_user' : null);

          setUserToken(resolvedToken);
          setUser(session.user ?? null);
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
    const token =
      session.access_token ??
      session.token ??
      session.accessToken ??
      session.authToken ??
      (typeof session === 'string' ? session : 'authenticated_user');

    const userPayload = session.user ?? session.userDetails ?? session.user_data ?? session;

    setUserToken(token);
    setUser(userPayload);
    try {
      await AsyncStorage.setItem(
        USER_SESSION_KEY,
        JSON.stringify({ token, user: userPayload }),
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