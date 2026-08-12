# Guided capture example

`invoice-capture.json` is a small, credential-free capture fixture for the
guided capture-to-contract API. The API deliberately separates deterministic
proposal generation from human confirmation:

```ts
import fs from "node:fs";
import {
  confirmGuidedCapture,
  proposeGuidedCapture,
} from "../../dist/guided-capture.js";

const capture = JSON.parse(fs.readFileSync("invoice-capture.json", "utf8"));
const proposal = proposeGuidedCapture(capture);

// A parent CLI should render proposal, collect these confirmations, and only
// then call confirmGuidedCapture. Never pre-check these decisions for a user.
const review = confirmGuidedCapture(proposal, {
  target: {
    confirmed: true,
    tool: "create_invoice",
    sideEffecting: true,
  },
  mutationProfile: { confirmed: true, value: "ambiguous-commit" },
  observer: {
    confirmed: true,
    id: "invoice-count",
    source: "tool",
    tool: "get_state",
    path: "invoices.length",
  },
  effect: {
    confirmed: true,
    class: "create",
    expected: 1,
    description: "Exactly one invoice must exist after creation.",
  },
  cardinality: { confirmed: true, value: "exactly_once" },
  forbidden: {
    confirmed: true,
    value: [{ expected: 2, description: "A retry must not duplicate state." }],
  },
  ordering: { confirmed: true, value: [] },
});

console.log(review.summary);
console.log(review.pack);
```

Only tools carrying `annotations.readOnlyHint: true` in the captured MCP
manifest are offered as observers. Command observers and tools with missing or
unsafe metadata are refused and must go through a separate manual review path.
