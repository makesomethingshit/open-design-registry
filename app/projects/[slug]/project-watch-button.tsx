"use client";

import { ProjectRelationButton } from "./project-relation-button";

type ProjectWatchButtonProps = { initialWatched: boolean; signedIn: boolean; slug: string };

export function ProjectWatchButton({ initialWatched, signedIn, slug }: ProjectWatchButtonProps) {
  return <ProjectRelationButton initialActive={initialWatched} relation="watch" signedIn={signedIn} slug={slug} />;
}
