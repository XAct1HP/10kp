"use client";

import Link from "next/link";

export default function VerifyEmailPage() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-sm border border-gray-200 text-center">
        <div className="mb-4 text-4xl">📬</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h1>
        <p className="text-sm text-gray-500 mb-6">
          We sent a verification link to your <span className="font-medium">@umich.edu</span> email.
          Click the link to verify your account, then come back and log in.
        </p>
        <Link
          href="/login"
          className="inline-block px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-700 transition-colors"
        >
          Go to Log In
        </Link>
      </div>
    </div>
  );
}
