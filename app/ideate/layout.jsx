import "./ideate.css";

// /ideate is unlisted while it's being built: no navbar link, and search
// engines are asked not to index it. Remove `robots` when it goes public.
export const metadata = {
  title: "Ideate | 10K Pitches",
  description: "Build an idea worth pitching, step by step.",
  robots: { index: false, follow: false },
};

export default function IdeateLayout({ children }) {
  return children;
}
