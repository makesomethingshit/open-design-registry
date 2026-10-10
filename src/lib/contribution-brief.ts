/** Format optional Design Request prompts as plain text for the existing Issue.body. */
export function composeContributionBrief(input: {
  purpose?: string;
  scope?: string;
  references?: string;
  deliverables?: string;
  criteria?: string;
  notes?: string;
}) {
  const sections: Array<[string, string | undefined]> = [
    ["Purpose", input.purpose],
    ["Scope and constraints", input.scope],
    ["References", input.references],
    ["Expected deliverables", input.deliverables],
    ["Review criteria", input.criteria],
    ["Additional details", input.notes],
  ];
  return sections
    .map(([label, value]) => {
      const text = value?.trim();
      return text ? `${label}:\n${text}` : null;
    })
    .filter((section): section is string => section !== null)
    .join("\n\n");
}
