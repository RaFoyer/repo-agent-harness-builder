/** Compare semantic token projections produced by the project's own parsers.
 * Import actual runtime token exports or computed CSS values, not source snippets.
 */
export function compareTokens(expected, actual) {
  const valid = (value) => value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length > 0 && Object.values(value).every((item) => typeof item === "string" || typeof item === "number");
  if (!valid(expected) || !valid(actual)) throw new Error("token projections must be nonempty maps of names to scalar values");
  const normalize = (value) => String(value).trim().replace(/\s+/g, " ");
  const findings = [];
  for (const name of Object.keys(expected)) {
    if (!Object.hasOwn(actual, name)) findings.push({ name, reason: "missing-token" });
    else if (normalize(expected[name]) !== normalize(actual[name])) findings.push({ name, reason: "token-mismatch" });
  }
  return { pass: !findings.length, checked: Object.keys(expected).length, findings };
}
