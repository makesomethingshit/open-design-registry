"use client";

import { ProjectRelationButton } from "./project-relation-button";

type ProjectStarButtonProps = { initialStarred: boolean; signedIn: boolean; slug: string };

export function ProjectStarButton({ initialStarred, signedIn, slug }: ProjectStarButtonProps) {
  return <ProjectRelationButton initialActive={initialStarred} relation="star" signedIn={signedIn} slug={slug} />;
}
