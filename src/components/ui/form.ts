export function focusFirstInvalid(form: HTMLFormElement) {
  const firstInvalid = form.querySelector<HTMLElement>(":invalid");
  firstInvalid?.focus();
  return Boolean(firstInvalid);
}
