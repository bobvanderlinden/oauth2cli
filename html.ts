import { escape } from "@std/html/entities";

export class Html {
  constructor(public value: string) {}
}

function toHtml(value: unknown): string {
  if (value instanceof Html) {
    return value.value;
  } else if (typeof value === "string") {
    return escape(value);
  } else if (value === null || value === undefined) {
    return "";
  } else if (typeof value === "number") {
    return toHtml(value.toString());
  } else if (typeof value === "boolean") {
    return toHtml(value.toString());
  }
  throw new Error(`Invalid HTML value: ${value}`);
}

export function html(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Html {
  return new Html(
    strings.reduce((result, str, i) => result + str + toHtml(values[i]), "")
  );
}
