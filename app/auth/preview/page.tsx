import type { Metadata } from "next";
import { EmailAccessPreview } from "@/components/team/email-access-preview";

export const metadata: Metadata = {
  title: "Email access preview · FormBridge",
  description: "Try FormBridge email signup, verification and recovery with a sample inbox.",
  robots: { index: false, follow: false },
};

export default function EmailPreviewPage() {
  return <EmailAccessPreview />;
}
