import { Field, Textarea } from "@/src/components/ui/field";
import { Stack } from "@/src/components/ui/layout";

export default function ContributionBriefFields({ hidden, idPrefix, onChange }: { hidden: boolean; idPrefix: string; onChange: () => void }) {
  return <section aria-labelledby={`${idPrefix}-heading`} hidden={hidden} onChange={onChange}>
    <Stack gap={3}>
      <h4 id={`${idPrefix}-heading`}>Contribution brief (optional)</h4>
      <p className="meta">Describe the work without filling every field. Only completed sections are saved in the request description.</p>
      <Field id={`${idPrefix}-purpose`} label="Purpose" description="Why is this contribution needed?"><Textarea name="briefPurpose" maxLength={2000} /></Field>
      <Field id={`${idPrefix}-scope`} label="Scope and constraints" description="What should change, and what should stay as it is?"><Textarea name="briefScope" maxLength={2000} /></Field>
      <Field id={`${idPrefix}-references`} label="References" description="Relevant revisions, references or source materials."><Textarea name="briefReferences" maxLength={2000} /></Field>
      <Field id={`${idPrefix}-deliverables`} label="Expected deliverables" description="What should contributors submit?"><Textarea name="briefDeliverables" maxLength={2000} /></Field>
      <Field id={`${idPrefix}-criteria`} label="Review criteria" description="How will you evaluate the proposed work?"><Textarea name="briefCriteria" maxLength={2000} /></Field>
    </Stack>
  </section>;
}
