"use client";

import { useAuth } from "../lib/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProtectedRoute({ children, returnTo }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      // returnTo sends the student back here after signing in (opt-in, so
      // existing pages keep the login page's default landing).
      router.push(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
    }
  }, [user, loading, router, returnTo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-5rem)]">
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
