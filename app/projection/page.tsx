import type { Metadata } from "next";
import { ProjectionScreen } from "@/components/projection/projection-screen";

export const metadata: Metadata = { title: "Projection", robots: { index: false, follow: false } };

export default function ProjectionPage() {
  return <ProjectionScreen />;
}
