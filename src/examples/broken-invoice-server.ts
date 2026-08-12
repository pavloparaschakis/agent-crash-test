import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

type Invoice = {
  id: string;
  customer_id: string;
  amount: number;
  status: "draft" | "sent";
};

const state: {
  invoices: Invoice[];
  outbound_messages: Array<{ invoice_id: string; kind: string }>;
} = {
  invoices: [],
  outbound_messages: [],
};

const server = new McpServer({
  name: "broken-invoice-server",
  version: "0.1.0",
});

server.registerTool(
  "create_invoice",
  {
    description: "Create a draft invoice for a customer.",
    inputSchema: {
      customer_id: z.string(),
      amount: z.number(),
      request_id: z.string().optional(),
    },
    outputSchema: {
      invoice: z.object({
        id: z.string(),
        customer_id: z.string(),
        amount: z.number(),
        status: z.literal("draft"),
      }),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ customer_id, amount }) => {
    // Intentionally broken: the tool declares idempotency but creates a new invoice on every retry.
    const invoice: Invoice = {
      id: `inv_${state.invoices.length + 1}`,
      customer_id,
      amount,
      status: "draft",
    };
    state.invoices.push(invoice);
    return {
      content: [{ type: "text", text: JSON.stringify({ invoice }) }],
      structuredContent: { invoice },
    };
  },
);

server.registerTool(
  "send_invoice",
  {
    description: "Send a draft invoice to its customer.",
    inputSchema: { invoice_id: z.string(), confirmed: z.boolean() },
    outputSchema: { sent: z.boolean(), invoice_id: z.string() },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ invoice_id }) => {
    // Intentionally broken: confirmation is ignored.
    const invoice = state.invoices.find((item) => item.id === invoice_id);
    if (!invoice)
      return {
        isError: true,
        content: [{ type: "text", text: "Invoice not found" }],
      };
    invoice.status = "sent";
    state.outbound_messages.push({ invoice_id, kind: "invoice" });
    return {
      content: [
        { type: "text", text: JSON.stringify({ sent: true, invoice_id }) },
      ],
      structuredContent: { sent: true, invoice_id },
    };
  },
);

server.registerTool(
  "get_customer",
  {
    description: "Read a customer record.",
    inputSchema: { customer_id: z.string() },
    outputSchema: { customer: z.object({ id: z.string(), name: z.string() }) },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ customer_id }) => {
    const customer = {
      id: customer_id,
      name: customer_id === "cus_2" ? "Second customer" : "First customer",
    };
    return {
      content: [{ type: "text", text: JSON.stringify({ customer }) }],
      structuredContent: { customer },
    };
  },
);

server.registerTool(
  "get_state",
  {
    description:
      "Read invoice and outbound-message state for this local demonstration server.",
    outputSchema: {
      invoices: z.array(
        z.object({
          id: z.string(),
          customer_id: z.string(),
          amount: z.number(),
          status: z.enum(["draft", "sent"]),
        }),
      ),
      outbound_messages: z.array(
        z.object({ invoice_id: z.string(), kind: z.string() }),
      ),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => ({
    content: [{ type: "text", text: JSON.stringify(state) }],
    structuredContent: state,
  }),
);

await server.connect(new StdioServerTransport());
