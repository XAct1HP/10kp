"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);

  const getSiteUrl = () =>
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : window.location.origin);

  // Ask the server whether the current session belongs to an admin.
  // Combines the ADMIN_EMAILS env list with the dynamic admin_users
  // table so admins added through the Settings tab get treated the same
  // as env-hardcoded ones (Admin nav link, /admin routing, etc.).
  const refreshIsAdmin = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setIsAdmin(false);
        setAdminChecked(true);
        return;
      }
      const res = await fetch("/api/auth/is-admin", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => ({}));
      setIsAdmin(!!data?.isAdmin);
    } catch {
      setIsAdmin(false);
    } finally {
      setAdminChecked(true);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Re-run the admin check whenever the signed-in user changes so
  // sign-out clears it and a fresh login re-fetches.
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setAdminChecked(true);
      return;
    }
    setAdminChecked(false);
    refreshIsAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const signUp = async (email, password) => {
    // Enforce @umich.edu domain
    if (!email.endsWith("@umich.edu")) {
      return { error: { message: "You must use a @umich.edu email address." } };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      },
    });
    return { data, error };
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const requestPasswordReset = async (email) => {
    if (!email.endsWith("@umich.edu")) {
      return { error: { message: "You must use a @umich.edu email address." } };
    }

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getSiteUrl()}/reset-password`,
    });
    return { data, error };
  };

  const updatePassword = async (password) => {
    const { data, error } = await supabase.auth.updateUser({ password });
    return { data, error };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        adminChecked,
        refreshIsAdmin,
        signUp,
        signIn,
        signOut,
        requestPasswordReset,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
