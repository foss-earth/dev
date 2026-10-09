/** Dev is an explicit view gate, separate from report-only and feature test hooks. */
export const DEV_PARAMETER = "dev";
export const DEV_TAB_ID = "dev";

/** A single exact ?dev=1 activates Dev. Empty, truthy and ambiguous flags do not. */
export function wantsDev(search: string): boolean {
  const values = new URLSearchParams(search).getAll(DEV_PARAMETER);
  return values.length === 1 && values[0] === "1";
}
