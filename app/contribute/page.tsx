import Link from "next/link";
import { Badge, StatusBadge, Tag } from "@/src/components/ui/badge";
import { Button, TextLink } from "@/src/components/ui/button";
import { defaultPageSize, pageCursor } from "@/src/lib/pagination";
import { prisma } from "@/src/lib/prisma";
import { projectActivityStatusPresentation } from "@/src/lib/ui/activity-status";
import { publicAssetUrl } from "@/src/lib/storage";
import { RequestCardImage } from "./request-card-image";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const licenseOptions = ["CC BY 4.0", "CC BY-SA 4.0", "CC0 1.0", "MIT"];
type SearchParams = Record<string, string | string[] | undefined>;

export default async function ContributePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = firstValue(params.q);
  const tool = firstValue(params.tool).toLowerCase();
  const tag = firstValue(params.tag).toLowerCase();
  const license = firstValue(params.license);
  const cursor = pageCursor(firstValue(params.cursor));
  const requests = await prisma.issue.findMany({
    where: {
      kind: "DESIGN_REQUEST",
      status: "OPEN",
      project: {
        isPublic: true,
        ...(license ? { license } : {}),
        ...(tool || tag ? { revisions: { some: { isPublished: true, ...(tool ? { tool: { equals: tool } } : {}), ...(tag ? { tags: { hasEvery: [tag] } } : {}) } } } : {}),
      },
      ...(query ? { OR: [
        { title: { contains: query, mode: "insensitive" as const } },
        { body: { contains: query, mode: "insensitive" as const } },
        { project: { title: { contains: query, mode: "insensitive" as const } } },
        { project: { description: { contains: query, mode: "insensitive" as const } } },
      ] } : {}),
    },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: defaultPageSize + 1,
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      revision: {
        select: {
          number: true,
          isPublished: true,
          previews: { orderBy: { position: "asc" }, take: 1, select: { url: true, altText: true } },
        },
      },
      project: {
        select: {
          slug: true,
          title: true,
          coverUrl: true,
          license: true,
          activityStatus: true,
          owner: { select: { name: true } },
          revisions: { where: { isPublished: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { tool: true, tags: true } },
        },
      },
    },
  }).catch(() => null);
  if (!requests) {
    return <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Contribute</p>
        <h1>Open design requests</h1>
        <p>Find a project looking for help, then open its request to understand the context and propose a change.</p>
      </header>
      <div className={styles.empty} role="alert"><p>Requests couldn{"'"}t load. Try again.</p><TextLink href="/contribute">Try again</TextLink></div>
    </div>;
  }
  const hasMore = requests.length > defaultPageSize;
  const items = requests.slice(0, defaultPageSize);
  const nextCursor = hasMore ? items.at(-1)?.id : undefined;
  const nextHref = nextCursor ? pageHref({ query, tool, tag, license, cursor: nextCursor }) : undefined;
  const hasActiveFilter = Boolean(query || tool || tag || license);

  return <div className={styles.page}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>Contribute</p>
      <h1>Open design requests</h1>
      <p>Find a project looking for help, then open its request to understand the context and propose a change.</p>
    </header>
    <section aria-labelledby="requests-heading" className={styles.results}>
      <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>Public projects</p><h2 id="requests-heading">Design requests</h2></div><p>{items.length} {items.length === 1 ? "request" : "requests"} on this page</p></header>
      <form action="/contribute" className={styles.filters} method="get">
        <div className={styles.searchRow}>
          <label className={styles.searchLabel} htmlFor="request-search">Search requests<input defaultValue={query} id="request-search" name="q" placeholder="Request or project name and description" type="search" /></label>
          <Button className={styles.searchButton} type="submit">Search</Button>
        </div>
        <details className={styles.filterGroup} open={hasActiveFilter}>
          <summary>Filters</summary>
          <div className={styles.filterFields}>
            <label>Tool<input defaultValue={tool} name="tool" placeholder="Figma, Penpot" /></label>
            <label>Tag<input defaultValue={tag} name="tag" placeholder="mobile, ui" /></label>
            <label>License<select defaultValue={license} name="license"><option value="">All licenses</option>{licenseOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          </div>
          {hasActiveFilter && <TextLink href="/contribute">Clear filters</TextLink>}
        </details>
      </form>
      {items.length ? <ol aria-label="Open design requests" className={styles.requestList}>{items.map((request) => {
        const project = request.project;
        const latestRevision = project.revisions[0];
        const linkedRevision = request.revision?.isPublished ? request.revision : undefined;
        const linkedPreview = linkedRevision?.previews[0];
        const status = projectActivityStatusPresentation(project.activityStatus);
        const requestHref = `/projects/${project.slug}/issues/${request.id}`;
        const image = linkedPreview
          ? { src: publicAssetUrl(linkedPreview.url), alt: linkedPreview.altText || `${project.title} revision ${linkedRevision?.number} preview`, source: `Revision ${linkedRevision?.number} preview · linked to this request` }
          : { src: publicAssetUrl(project.coverUrl), alt: `${project.title} cover`, source: "Project cover · request image unavailable" };
        return <li key={request.id}>
          <article className={styles.requestCard}>
            <figure className={styles.media}>
              <RequestCardImage alt={image.alt} src={image.src} />
              <figcaption className={styles.source}>{image.source}</figcaption>
            </figure>
            <div className={styles.requestContent}>
              <div className={styles.requestHeading}><Badge>Design request</Badge><time dateTime={request.createdAt.toISOString()}>Opened {formatDate(request.createdAt)}</time></div>
              <h3><Link href={requestHref}>{request.title}</Link></h3>
              <p className={styles.body}>{request.body || "No summary provided"}</p>
              <p className={styles.projectLine}>For <Link href={`/projects/${project.slug}`}>{project.title}</Link> · by {project.owner.name}</p>
              <div className={styles.metadata}>
                <StatusBadge icon={status.icon} tone={status.tone}>{status.label}</StatusBadge>
                <span>{project.license}</span>
                {latestRevision?.tool && <Tag>{latestRevision.tool}</Tag>}
                {latestRevision?.tags.slice(0, 3).map((value) => <Tag key={value}>{value}</Tag>)}
              </div>
              <Link aria-hidden="true" className={styles.requestLink} href={requestHref} tabIndex={-1}>View request <span aria-hidden="true">→</span></Link>
            </div>
          </article>
        </li>;
      })}</ol> : <div className={styles.empty}><p>No open design requests match those filters.</p>{hasActiveFilter && <TextLink href="/contribute">Clear filters</TextLink>}</div>}
      {nextHref && <nav aria-label="Request pages" className={styles.pagination}><Link href={nextHref}>Next page <span aria-hidden="true">→</span></Link></nav>}
    </section>
  </div>;
}

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function pageHref({ query, tool, tag, license, cursor }: { query: string; tool: string; tag: string; license: string; cursor: string }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (tool) params.set("tool", tool);
  if (tag) params.set("tag", tag);
  if (license) params.set("license", license);
  params.set("cursor", cursor);
  return `/contribute?${params}`;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-US", { dateStyle: "medium" });
}
