import ProjectScreen from "../project-screen";

export const dynamic = "force-dynamic";

export default async function Page(props: Omit<Parameters<typeof ProjectScreen>[0], "view">) { return ProjectScreen({ ...props, view: "issues" }); }
