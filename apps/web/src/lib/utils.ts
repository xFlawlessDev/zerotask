import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Class merging that understands this app's custom type scale.
 *
 * `text-compact` and `text-meta` are font sizes, but `twMerge` cannot tell a
 * custom `text-*` size from a colour, so it treats `text-on-accent` and
 * `text-compact` as conflicting and drops the colour. The result was white button
 * text becoming dark text on a dark button. Declaring the sizes here keeps the
 * colour and the size independent.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["label", "meta", "compact", "body", "section", "title", "figure"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
