/** Whether the document is scrolled away from its top. False where there is no window. */
export function pageIsScrolled(): boolean {
  return typeof window !== "undefined" && window.scrollY > 0;
}
