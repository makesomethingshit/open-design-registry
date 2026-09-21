export function invalidFieldErrors(form: HTMLFormElement) {
  return Array.from(form.elements).reduce<Record<string, string>>((errors, element) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || element.validity.valid || !element.name) return errors;
    errors[element.name] = element.validationMessage;
    return errors;
  }, {});
}

export function focusFirstInvalid(form: HTMLFormElement) {
  const firstInvalid = form.querySelector<HTMLElement>("input:invalid,select:invalid,textarea:invalid");
  firstInvalid?.focus();
  return Boolean(firstInvalid);
}
