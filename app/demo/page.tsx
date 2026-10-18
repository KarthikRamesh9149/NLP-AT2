import type { Metadata } from "next";
import { GuidedDemo } from "@/components/demo/guided-demo";

export const metadata: Metadata = {
  title: "A birthday, beautifully handled · FormBridge guided demo",
  description:
    "Follow a restaurant enquiry from the first hello to a reviewed booking brief and a simulated reservation handoff.",
};
export default function DemoPage() {
  return <GuidedDemo />;
}
