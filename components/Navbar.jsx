"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "../lib/AuthContext";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const { user, signOut, loading } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = user && adminEmails.includes(user.email?.toLowerCase());

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    router.push("/");
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav className="w-full bg-navy">
      <div className="px-4 sm:px-6 lg:px-10">
        <div className="flex items-center justify-between h-20">
          {/* Logo / Home */}
          <div className="flex-shrink-0">
            <Link
              href="/"
              className="flex items-center"
              onClick={closeMenu}
            >
              <Image
                src="/10kp_tspnt.png"
                alt="10KP Logo"
                width={144}
                height={48}
                className="h-12 w-auto"
                priority
              />
            </Link>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center space-x-4">
            <Link
              href="/gallery"
              className="px-3 py-2 text-sm font-medium text-white hover:text-gray-300 transition-colors"
            >
              Gallery
            </Link>
            <Link
              href="/announcements"
              className="px-3 py-2 text-sm font-medium text-white hover:text-gray-300 transition-colors"
            >
              Announcements
            </Link>

            {loading ? null : user ? (
              <>
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="px-3 py-2 text-sm font-medium text-white hover:text-gray-300 transition-colors"
                  >
                    Admin
                  </Link>
                )}
                <Link
                  href="/intake"
                  className="px-3 py-2 text-sm font-medium text-white hover:text-gray-300 transition-colors"
                >
                  Submit Pitch
                </Link>
                <span className="text-sm text-gray-300 truncate max-w-[180px]">{user.email}</span>
                <button
                  onClick={handleSignOut}
                  className="px-4 py-2 text-sm font-medium text-white hover:text-gray-300 transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/signup"
                  className="px-4 py-2 text-sm font-medium text-black bg-maize rounded-md hover:bg-yellow-400 transition-colors"
                >
                  Sign Up
                </Link>
                <Link
                  href="/login"
                  className="px-4 py-2 text-sm font-medium text-black bg-maize rounded-md hover:bg-yellow-400 transition-colors"
                >
                  Log In
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger button */}
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 active:scale-95"
            style={{
              background: menuOpen ? "rgba(242,181,23,0.15)" : "rgba(255,255,255,0.08)",
              border: menuOpen ? "1px solid rgba(242,181,23,0.4)" : "1px solid rgba(255,255,255,0.18)",
              color: menuOpen ? "#F2B517" : "#ffffff",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
          >
            {menuOpen ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-white/20 bg-navy max-h-[calc(100vh-5rem)] overflow-y-auto">
          <div className="px-4 py-3 space-y-1">
            <Link
              href="/gallery"
              onClick={closeMenu}
              className="block px-3 py-2 text-sm font-medium text-white hover:text-gray-300 hover:bg-white/10 rounded-md transition-colors"
            >
              Gallery
            </Link>
            <Link
              href="/announcements"
              onClick={closeMenu}
              className="block px-3 py-2 text-sm font-medium text-white hover:text-gray-300 hover:bg-white/10 rounded-md transition-colors"
            >
              Announcements
            </Link>

            {loading ? null : user ? (
              <>
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={closeMenu}
                    className="block px-3 py-2 text-sm font-medium text-white hover:text-gray-300 hover:bg-white/10 rounded-md transition-colors"
                  >
                    Admin
                  </Link>
                )}
                <Link
                  href="/intake"
                  onClick={closeMenu}
                  className="block px-3 py-2 text-sm font-medium text-white hover:text-gray-300 hover:bg-white/10 rounded-md transition-colors"
                >
                  Submit Pitch
                </Link>
                <div className="px-3 py-2 text-sm text-gray-300 truncate">{user.email}</div>
                <button
                  onClick={handleSignOut}
                  className="block w-full text-left px-3 py-2 text-sm font-medium text-white hover:text-gray-300 hover:bg-white/10 rounded-md transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/signup"
                  onClick={closeMenu}
                  className="block px-3 py-2 text-sm font-medium text-black bg-maize hover:bg-yellow-400 rounded-md transition-colors text-center"
                >
                  Sign Up
                </Link>
                <Link
                  href="/login"
                  onClick={closeMenu}
                  className="block px-3 py-2 text-sm font-medium text-black bg-maize hover:bg-yellow-400 rounded-md transition-colors text-center"
                >
                  Log In
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
