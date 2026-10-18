# GitHub Actions pre-step failures — evidence and triage (#144)

**Investigative draft; no root cause confirmed.** Do not change workflow permissions, remove essential jobs, introduce blind retries or disable E2E without reproducing a specific failure mechanism.

## Why this exists

Earlier runs reported failures before a runner or steps were assigned, while another execution on the same code could succeed. A pre-step GitHub infrastructure/quota/policy problem is a **hypothesis**, not a proven explanation; a workflow permission failure is a separate hypothesis. New green runs do not retroactively explain old red runs.

Known starting references from #144:
- [main push failure #38056129553](https://github.com/makesomethingshit/open-design-registry/actions/runs/38056129553)
- [same-SHA manual success #38056395434](https://github.com/makesomethingshit/open-design-registry/actions/runs/38056395434)
- [label sync failure #38056038221](https://github.com/makesomethingshit/open-design-registry/actions/runs/38056038221)
- [later main push green #39009753122](https://github.com/makesomethingshit/open-design-registry/actions/runs/39009753122)

## Read-only evidence capture

Use an account authorized to read repository Actions data. `gh api` commands below do not mutate workflow state or trigger jobs.

```sh
REPO=makesomethingshit/open-design-registry
for RUN in 38056129553 38056395434 38056038221 39009753122; do
  gh api "repos/$REPO/actions/runs/$RUN" --jq '{id,event,head_sha,status,conclusion,run_started_at,created_at,updated_at,html_url}'
  gh api "repos/$REPO/actions/runs/$RUN/jobs?per_page=100" --jq '.jobs[] | {id,name,status,conclusion,runner_id,runner_name,started_at,completed_at,steps:[.steps[]? | {name,status,conclusion}]}'
done
```

For each failed job, record the GitHub UI banner, exact job/run URL, event type, checkout SHA (if a runner actually started), `runner_id`, number of reported steps, the first actionable error message and any available quota/billing/permissions hint. If logs are unavailable (for example an object-store `BlobNotFound`), record that absence separately rather than inferring the cause.

## Decision table

| Observed evidence | Classification and next action |
| --- | --- |
| No runner assignment, empty steps, UI quota/runner/policy banner | Pre-step infrastructure/policy *candidate*; confirm repository/organization usage, Actions permissions, runner availability and GitHub status; no app-code patch |
| Runner and steps started; a command/test fails | Code/environment failure candidate; inspect failing step, exact SHA and test setup; reproduce before minimum patch |
| Label-sync job starts but GitHub API returns permission denied | Workflow token/event scope candidate; compare `pull_request_target`, effective token permissions, fork rules, API target; minimal permission edit only after proof |
| Same SHA succeeds on a separate event | Demonstrates non-deterministic/external trigger possibility, **not** root cause or proof that failure is fixed |
| Multiple current runs green | Record recovery as an observation; continue checking original banner/logs before closing #144 |

## Non-regression requirements

- Keep test, typecheck, build, secrets and actual Playwright E2E checks active. Never make CI green by skipping requirements.
- Preserve PR label sync's add-only behavior and its existing `bug` / `enhancement` / `area:*` semantics; do not replace reviewers' labels.
- Do not expose secrets in logs/artifacts. Follow the existing CI security boundary.
- Avoid repeated manual reruns just to manufacture a green state; reuse already completed executions first.

## Investigation log to fill in

| Run / job | SHA / event | Runner? Steps? | UI error evidence | Classification |
| --- | --- | --- | --- | --- |
| 38056129553 | inspect | inspect | not recorded | unresolved |
| 38056395434 | inspect | inspect | not recorded | success comparison |
| 38056038221 | inspect | inspect | not recorded | unresolved |
| 39009753122 | `110cd40c5b3541c35c72eea529158e0198e3e225` / push | inspect | no failure reported | success comparison |

**Next step:** after collecting concrete evidence, implement only a proven targeted fix in this branch or in a follow-up PR. #144 remains open; a triage document alone does not establish resolution.
