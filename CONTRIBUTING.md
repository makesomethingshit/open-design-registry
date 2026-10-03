# Contributing

[Documentation index](docs/README.md) · [Development and operations](docs/operations.md) · [Design system](docs/design-system.md)

These conventions apply to this repository's GitHub issues and pull requests. They do not change the Issue or Proposal states inside the ODR product.

Use one review level and one type in each repository issue and pull request title:

```text
Issue: [P{0-3}][bug|feature] Summary
PR:    [P{0-3}][bug|feature] Summary (#issue)
```

P1–P3 describe the human review needed for the change, rather than urgency, size, or whether it is a bug or feature. The `P` title prefix and `Priority` field are retained for compatibility. P0 remains an exception for incidents requiring immediate attention.

| Level | Meaning | Use when |
| --- | --- | --- |
| P0 | Critical incident | Data loss, a security issue, or the service or core function is unusable. Human incident review is required. |
| P1 | Human decision before implementation | The intended behavior, design direction, scope, or tradeoff still needs a human decision. Prepare alternatives or a draft, record the decision in the issue or PR, then implement the agreed direction. |
| P2 | Human review of the result (default) | The direction is agreed, but acceptance requires human judgment of the implemented result, such as visual quality, readability, or interaction clarity. Identify what the reviewer must inspect and provide evidence. |
| P3 | Automated verification sufficient | The direction and acceptance criteria are explicit, the change has no unresolved judgment, and focused automated checks can establish completion. Name the criteria, checks, and results. |

## Choosing the level

1. Use P0 for a critical incident.
2. If a human must choose the direction or resolve a tradeoff before implementation, use P1.
3. If the direction is agreed but a human must judge the result, use P2.
4. Use P3 only when explicit acceptance criteria and automated evidence are sufficient. If uncertain, use P2 provisionally; uncertainty about the intended outcome requires P1.

A small visual change can be P1 if its direction is undecided. A bug can be P3 if the expected behavior is agreed and a focused regression check proves it. Effort and urgency alone do not determine P1–P3. Permission, privacy, security, data integrity, and irreversible changes still require the applicable human decision or review; passing tests alone does not establish P3 for them.

## Issues and pull requests

An issue's level is an initial estimate for its unresolved work. Include the human decision or result review needed, or the automated acceptance evidence for P3. Reassess it when the direction or scope changes.

Each PR's level is determined by its actual change and remaining review needs. It inherits the issue's type, but does not have to inherit its level. For example, a P1 navigation issue can produce a P2 PR implementing an agreed layout and a P3 PR fixing a separately specified overflow invariant. Explain a different level in the PR's Human review section and link the decision and validation evidence.

For a P1 PR, record the decision before implementing the chosen direction. Once that decision is made, reassess the remaining implementation as P2 or P3. A discussion, mockup, or draft PR may be used to obtain the decision.

When one PR contains changes requiring different levels, use the most demanding applicable level (P0, then P1, P2, P3). Split only when the changes are independently coherent and reviewable; do not split solely to obtain a lower level.

P3 means that this classification does not require human judgment to establish acceptance. It does not authorize pushing, merging, deployment, or bypassing branch protection, required reviewers, or other repository policies.

Use `bug` for broken behavior and `feature` for new capabilities or improvements. Replace `P?` in the issue form's suggested title with the selected level and keep the title and Priority field consistent. Do not combine levels such as `P2/P3`. A PR ends its title with the related issue number.
