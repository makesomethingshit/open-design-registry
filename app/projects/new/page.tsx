import { redirect } from "next/navigation";
import { getSession } from "@/src/lib/session";
import NewProjectForm from "./new-project-form";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  if (!await getSession()) redirect("/login?next=%2Fprojects%2Fnew");
  return <NewProjectForm />;
}
