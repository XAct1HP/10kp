import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center gap-5 min-h-[calc(100vh-4rem)] px-4 text-center">
      <h1 className="text-4xl font-bold text-gray-900">10KP Base</h1>
      <p className="text-sm text-gray-500 max-w-xl">
        Submit your pitch, then explore the gallery to preview all submissions.
      </p>
      <Link
        href="/gallery"
        className="inline-flex px-5 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-700 transition-colors"
      >
        View Gallery
      </Link>
    </div>
  );
}
