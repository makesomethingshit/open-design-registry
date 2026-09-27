# Contributing

Use one priority and one type in each repository issue and pull request title:

```text
Issue: [P{0-3}][bug|feature] Summary
PR:    [P{0-3}][bug|feature] Summary (#issue)
```

| Priority | Meaning | Use when |
| --- | --- | --- |
| P0 | Critical | Data loss, a security issue, or the service or core function is unusable. |
| P1 | High | A core user flow is broken, a major regression exists, and there is no practical workaround. |
| P2 | Normal (default) | An ordinary bug or planned feature. |
| P3 | Low | Polish, a small UX improvement, or a lower-priority enhancement. |

Use `bug` for broken behavior and `feature` for new capabilities or improvements. Replace `P?` in the issue form's suggested title with the selected priority. Do not combine priorities such as `P2/P3`; choose P2 if unsure and revise it later if needed. A PR inherits the related issue's priority and type, and ends its title with that issue number.
