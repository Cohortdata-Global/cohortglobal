"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/app/use-action";
import { acceptInvitation } from "@/server/actions/invitations";

export function AcceptInvitationButton({ token, label }: { token: string; label: string }) {
  const router = useRouter();
  const { pending, run } = useAction();
  return (
    <Button size="lg" className="w-full" loading={pending} onClick={() => run(() => acceptInvitation(token), { onSuccess: () => router.push("/home") })}>
      {label}
    </Button>
  );
}
