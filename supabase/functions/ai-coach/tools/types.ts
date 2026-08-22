import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";

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
  handler: (userClient: SupabaseClient, input: Record<string, unknown>) => Promise<unknown>;
}
