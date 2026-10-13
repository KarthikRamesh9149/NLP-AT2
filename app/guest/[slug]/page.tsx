import { GuestAssistant } from "@/components/team/guest-assistant";
export default async function GuestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <GuestAssistant slug={slug} />;
}
