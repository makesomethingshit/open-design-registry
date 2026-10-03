import ProjectShell from "./project-shell";

export default function Layout(props: Omit<Parameters<typeof ProjectShell>[0], "proposalDetail">) { return ProjectShell(props); }
