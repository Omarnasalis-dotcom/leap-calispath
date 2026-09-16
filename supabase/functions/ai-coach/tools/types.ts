import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";

// Direct Build incremental staging (2026-09-16, see addProgramDay.ts): a
// per-REQUEST scratch space, not persisted anywhere — a fresh empty one is
// created once per HTTP request (index.ts) and only lives as long as that
// request's tool-calling loop does. Lets add_program_day accumulate
// validated days and propose_new_program assemble them, without either
// tool needing its own copy of the whole program's state.
export interface ProgramDraft {
  days: Map<string, unknown[]>;
}
export interface RequestContext {
  programDraft: ProgramDraft;
}

// Every tool handler receives a client authenticated AS THE CALLING USER
// (their own JWT forwarded from the request, never the service-role key) —
// every RPC these tools call trusts auth.uid() internally, so the client
// identity has to actually be the user for that to resolve correctly. See
// index.ts for how this client is constructed once per request.
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  // `context` is optional to USE, not optional to receive — index.ts passes
  // it to every handler, but a function declared with only 2 params (the
  // vast majority of tools, which don't need request-scoped state) is still
  // a valid ToolDefinition["handler"] under normal JS/TS call semantics, so
  // nothing else needed to change when this parameter was added.
  handler: (userClient: SupabaseClient, input: Record<string, unknown>, context: RequestContext) => Promise<unknown>;
}
