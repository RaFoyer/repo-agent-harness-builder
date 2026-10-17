# Install the optional kit

The kit is part of the repository harness builder. This skill supplies the
workflow; it does not silently install the CLI, a framework or a browser.

## Order

1. Inspect the target's instructions, CLI, component package, provider, token
   authority, browser tests, backend contracts and existing design workflow.
   Preserve existing owners and commands. Agree the installation diff first.
2. For a new harness, use the builder's scaffold and verification scripts. For
   an existing harness, adapt only the needed source templates from the reviewed
   builder checkout:
   - `assets/templates/cli-skeleton/apps/cli/src/design/` and its CLI registration;
   - `design-workflow.test.mjs` and the existing QA evidence verifier;
   - `ops/design-workflow.json`, `ops/design-visual-policy.json`, `ops/design-evidence.json`;
   - `ops/protocols/DESIGN-IN-CODE.md` and `scripts/design/`.
   Keep the module inactive. Do not overwrite a working CLI or root instructions.
3. Set `componentLibrary` and `tokenSourceRef` to canonical repository-relative
   paths. Register actual views, not guessed inventories. Each row has `id`,
   `name`, `audience`, `module`, `route`, `page`, `status`, and `preview`.
   `preview` is either null, or `{path, port, cwd, argv}`. Use a concrete synthetic
   route and a unique explicit port. `cwd` is `.` or a safe repository path.
   The public argv may contain `{host}` and `{port}`; never put credentials in it.
   Optional `designUrl` and `prUrl` are HTTPS pointers, not authority.
4. Review a local preview lane. It must bind to loopback, prove synthetic data
   and isolate live credentials and writes. The CLI only prints the command plan.
   Check port availability at launch, retain ownership of the process, and stop
   only that process. Use the project's existing runtime/version pin.
5. Wire project adapters described below. Configure the visual matrix, narrow
   exceptions, real-state assertions and evidence producer. Then activate the
   workflow, visual policy and a nonempty design evidence policy through review.
   Align the design protocol front matter and harness checklist in the same
   change. `design status` reports design-system and workflow declarations
   separately; neither declaration verifies source authority or visual readiness.
6. Run generated CLI tests, `design views --json`, `design session <id> --json`,
   `design preview <id> --json`, and `design tracker` without writes. Prove no
   launch occurred. Regenerate the tracker explicitly, then add a CI test that
   compares it with the pure renderer's output.
7. Run one real view through all selected widths/states, a known-bad layout,
   missing fixture, token mismatch and incomplete evidence. `design check`
   must reject the incomplete manifest. Disable one rule in a disposable fixture
   and prove a negative test fails. Run the target's normal repository checks.

## Adapter interfaces

### Token checks

Import `compareTokens` from `scripts/design/compare-tokens.mjs`. Supply two
nonempty scalar maps produced by project-owned parsers or runtime exports: the
canonical expected tokens and their actual CSS/runtime projection. A mismatch
or missing declaration must fail the CI command. Do not use source substring
matches as proof. The helper validates the declared projection, not every token
the application might use.

### Real-component rendering

Compile previews through the project's existing toolchain. A trusted compiled
module exports an async or sync `renderPreviews()` returning:

```js
{
  css: "the full actual component stylesheet, fonts and required reset",
  previews: [
    { name: "option-a", width: 640, html: "markup returned by the project's server renderer" }
  ]
}
```

For React, compose the actual components inside their actual provider and use
`renderToStaticMarkup`. For another framework, use its own server renderer.
Resolve assets and fonts so artifact pages can load them. This module is
executable repository code, not untrusted content or an isolation boundary.

```bash
node scripts/design/render-previews.mjs path/to/compiled-previews.mjs artifacts/design/new-run
```

The renderer requires a new output directory, validates every preview before
writing, preserves the CSS and labels the result static-only. Run each emitted
page in a browser at its stated width. Do not paste its unscoped CSS into a
decision form. Use captures or isolated frames. Hydration, portals and event
behavior require the running app; static fragments cannot replace them.

### Measured browser matrix

Import `measureMatrix` from `scripts/design/measure-matrix.mjs` in an existing
approved Playwright journey. Load `ops/design-visual-policy.json`. Pass the page,
policy and an async `prepare(page, {viewport, sidebar, state})` callback. The
callback reaches the appropriate synthetic state, asserts its visible state
marker and returns exactly true. Missing fixtures must return false or throw.
The helper sets viewport size and collects measurements; it does not start a
server or decide how to reach a page. Record the resulting content width as
well as the viewport width, so sidebar loss is visible.

Keep the complete matrix report and separate contrast, keyboard, actual browser
zoom and interaction results. Write QA-EVIDENCE receipts with the full tested
revision, view ID, run/attempt IDs, outcome and SHA-256 proof references. Select
all required check IDs in the fixed `ops/design-evidence.json` policy, not in the
result file. The `design check` command verifies these local receipts only.

## Synchronization and rollback

Optional design-tool adapters declare their package entry, provider, CSS,
fonts, docs, previews, output location and source revision. Authentication and
publishing need separate approval. Rebuild mirrors after shared changes and
verify import fidelity rather than editing their copies by hand.

Use project-namespaced local skills for project-specific adapters. Shared skill
names are distribution-owned; an instruction to keep copies identical does not
authorize a downstream repository to overwrite global fleet skills.

To disable, mark all three policies inactive, remove the optional CI jobs after
review, stop only owned previews and revoke optional external grants. Preserve
canonical UI sources and evidence. No uninstall requires deleting product code.
