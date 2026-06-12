import "./globals.css";
import Navbar from "../components/Navbar";
import { AuthProvider } from "../lib/AuthContext";

export const metadata = {
  title: "10KP",
  description: "10KP Pitch Submission Platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <AuthProvider>
          <Navbar />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
