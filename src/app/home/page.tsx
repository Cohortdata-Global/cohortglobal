import { redirect } from "next/navigation";
import { getViewer, homeFor } from "@/server/auth/viewer";

/** After sign-in: send each person to the workspace for their role. */
export default async function HomeRouter() {
  const viewer = await getViewer();
  redirect(homeFor(viewer));
}
