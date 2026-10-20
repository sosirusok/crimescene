import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCustomer } from "./handler.ts";

Deno.serve(handleCustomer);
