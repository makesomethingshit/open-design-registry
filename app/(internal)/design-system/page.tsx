import { notFound } from "next/navigation";
import DesignSystemCatalog from "./catalog";

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignSystemCatalog />;
}
