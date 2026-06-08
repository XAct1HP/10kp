"use client";

import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="w-full bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Home */}
          <div className="flex-shrink-0">
            <Link
              href="/"
              className="text-xl font-bold text-gray-900 hover:text-gray-700 transition-colors"
            >
              10KP
            </Link>
          </div>

          {/* Nav Links */}
          <div className="flex items-center space-x-4">
            <button
              className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              disabled
            >
              Gallery
            </button>
            <button
              className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
              disabled
            >
              Sign Up
            </button>
            <button
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-700 transition-colors"
              disabled
            >
              Log In
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
