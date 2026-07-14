import "./globals.css";
import Navbar from "../components/Navbar";
import { AuthProvider } from "../lib/AuthContext";

export const metadata = {
  title: "10KP",
  description: "10KP Pitch Submission Platform",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0B1A3B",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ background: "#0B1A3B" }}>
      <body className="min-h-screen bg-navy" style={{ background: "#0B1A3B" }}>
        <AuthProvider>
          <Navbar />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
