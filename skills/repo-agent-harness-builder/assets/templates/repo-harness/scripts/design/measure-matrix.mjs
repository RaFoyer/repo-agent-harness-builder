import { measureLayout } from "./measure-layout.mjs";

/** The repository owns prepare(): reach a real, synthetic app state and assert
 * its marker. Missing fixtures must block instead of quietly testing the home page.
 */
export async function measureMatrix(page, policy, prepare) {
  if (policy?.schemaVersion !== 1 || policy.status !== "active" || typeof prepare !== "function"
    || !Array.isArray(policy.viewports) || !policy.viewports.length || policy.viewports.length > 12
    || !policy.viewports.every((value) => Number.isInteger(value.width) && value.width >= 240 && value.width <= 4096 && Number.isInteger(value.height) && value.height >= 240 && value.height <= 4096)
    || ![policy.states, policy.sidebarStates].every((values) => Array.isArray(values) && values.length > 0 && values.length <= 10 && new Set(values).size === values.length && values.every((value) => typeof value === "string" && value))) throw new Error("invalid-visual-matrix-policy");
  const samples = [];
  for (const viewport of policy.viewports) {
    await page.setViewportSize(viewport);
    for (const sidebar of policy.sidebarStates) for (const state of policy.states) {
      const sample = { viewport, sidebar, state };
      if (await prepare(page, sample) !== true) throw new Error("design fixture not proven ready");
      samples.push({ ...sample, measurement: await measureLayout(page, policy.measurement) });
    }
  }
  return { schemaVersion: 1, pass: samples.every((sample) => sample.measurement.pass), samples, scope: "measured layout samples only; record manual accessibility and interaction evidence separately" };
}
