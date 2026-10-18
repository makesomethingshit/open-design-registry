# GitHub Actions pre-step failures — evidence and triage (#144)

**Evidence updated 2026-10-19 (KST): GitHub reported an account billing/spending gate before job startup.** Do not change workflow permissions, remove essential jobs, introduce blind retries or disable E2E without reproducing a specific failure mechanism.

## Why this exists

The failed push and label-sync runs have empty steps and no runner assignment. Their check-run failure annotations explicitly report an account payment/spending restriction. The annotations do not distinguish a failed payment from an insufficient spending limit. Account billing history and the operational action that restored execution have not been inspected. Separate successful runs demonstrate later recovery, without proving which account setting changed.

Known starting references from #144:
- [main push failure #38056129553](https://github.com/makesomethingshit/open-design-registry/actions/runs/38056129553)
- [same-SHA manual success #38056395434](https://github.com/makesomethingshit/open-design-registry/actions/runs/38056395434)
- [label sync failure #38056038221](https://github.com/makesomethingshit/open-design-registry/actions/runs/38056038221)
- [later main push green #39009753122](https://github.com/makesomethingshit/open-design-registry/actions/runs/39009753122)

## Read-only evidence capture

Use an account authorized to read repository Actions data. Run the complete block in **Bash**, not plain `sh` or PowerShell. `gh api` commands below do not mutate workflow state or trigger jobs. Authentication, permission, API and pagination errors must stop collection with a nonzero exit status.

```bash
set -euo pipefail
trap 'echo "Evidence capture failed; collection is incomplete." >&2' ERR
REPO=makesomethingshit/open-design-registry
for RUN in 38056129553 38056395434 38056038221 39009753122; do
  gh api "repos/$REPO/actions/runs/$RUN" --jq '{id,event,head_sha,status,conclusion,run_started_at,created_at,updated_at,html_url}'
  gh api --paginate "repos/$REPO/actions/runs/$RUN/jobs?per_page=100" --jq '.jobs[] | {id,name,status,conclusion,runner_id,runner_name,started_at,completed_at,steps:[.steps[]? | {name,status,conclusion}]}'
  gh api --paginate "repos/$REPO/actions/runs/$RUN/jobs?per_page=100" --jq '.jobs[] | select(.conclusion == "failure") | .check_run_url' |
  while IFS= read -r CHECK_URL; do
    gh api --paginate "${CHECK_URL#https://api.github.com/}/annotations?per_page=100" --jq '{annotation_count: length, annotations: map({annotation_level,message})}'
  done
done
```

Successful annotation retrieval prints `annotation_count` and the records for each page; `annotation_count: 0` is a successful empty result, not an API failure or evidence of a particular root cause. A failed job-list or annotation request exits nonzero (including a failed later page); mark the collection incomplete even if earlier records were printed. Do not interpret the absence of annotations after a failed lookup as zero annotations.

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

## Investigation record (API readback, 2026-10-19 KST)

| Run / job | Run head SHA / event | Runner / steps | Observed result |
| --- | --- | --- | --- |
| [38056129553](https://github.com/makesomethingshit/open-design-registry/actions/runs/38056129553) | `cfe5c676b017d17d24c35dcb9f094d2fdb426242` / push | Five failing jobs: `runner_id: 0`, zero steps; PR-title skipped | All five failure annotations report the billing/spending gate below |
| [38056395434](https://github.com/makesomethingshit/open-design-registry/actions/runs/38056395434) | Same SHA / workflow_dispatch | Five runners; build 8, e2e 16, secrets 5, typecheck 9, test 12 steps | All five succeed; PR-title skipped on this event |
| [38056038221 / 114224667421](https://github.com/makesomethingshit/open-design-registry/actions/runs/38056038221/job/114224667421) | `d234f318055cf30c95720a54149eb815f130c50e` / pull_request_target | `runner_id: 0`, zero steps | Same failure annotation; token/API label-copy step never ran |
| [39009753122](https://github.com/makesomethingshit/open-design-registry/actions/runs/39009753122) | `110cd40c5b3541c35c72eea529158e0198e3e225` / push | Five runners; build 8, e2e 17, typecheck 9, test 12, secrets 5 steps | All five succeed; PR-title skipped on push |

GitHub failure annotation (all five failed CI jobs and the failed label job):

> The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings

Read [the test job annotation](https://api.github.com/repos/makesomethingshit/open-design-registry/check-runs/114224928608/annotations) and [label-sync annotation](https://api.github.com/repos/makesomethingshit/open-design-registry/check-runs/114224667421/annotations) with the commands above. `head_sha` is run metadata; a job without steps has no checkout SHA. `pull_request_target` runs the base workflow, so its run head is not evidence that PR code was checked out.

## Recovery and remaining acceptance

- [PR #171 label-sync run 39149594291](https://github.com/makesomethingshit/open-design-registry/actions/runs/39149594291) actually ran its copy step on 2026-10-18 UTC and logged `PR #171: added/kept area:navigation, enhancement`. API readback confirms those labels on both #155 and #171. This establishes a successful real PR event and label API call with `issues: read` / `pull-requests: write`.
- The [base workflow](../.github/workflows/sync-pr-labels.yml) uses POST to add labels, with no remove/replace call, and does not check out PR code. Existing unrelated-label preservation has not been demonstrated by a controlled before/after live mutation; retain that acceptance item rather than infer it from matching final labels.
- No application, permission or workflow change is indicated by these startup failures. No rerun, billing change or permission expansion was performed for this investigation, so this investigation added no Actions compute runs. Historical cost and the account-side recovery action remain unverified.
- #144 remains open pending the account owner's recovery/usage record and the remaining label-preservation evidence. Future failures need their own annotation/step evidence; this classification applies to the recorded jobs.
