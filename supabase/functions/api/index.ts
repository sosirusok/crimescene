import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleApi } from "./router.ts";

Deno.serve(handleApi);
