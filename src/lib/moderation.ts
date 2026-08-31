import { getSession } from "./session";

export async function getAdminSession() {
  const session = await getSession();
  const emails = process.env.ADMIN_EMAILS?.split(",").map((email) => email.trim().toLowerCase()) ?? [];
  if (!session?.user || ((session.user as { role?: string }).role !== "admin" && !emails.includes(session.user.email.toLowerCase()))) return null;
  return session;
}
