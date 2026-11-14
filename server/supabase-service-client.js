if (typeof global.WebSocket === "undefined") { try { global.WebSocket = require("ws"); } catch (e) {} }
const { createClient } = require("@supabase/supabase-js");

const DEFAULT_SUPABASE_URL = "https://ssbuagqwjptyhavinkxg.supabase.co";

function createSupabaseServiceClient() {
    const supabaseUrl =
        process.env.SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        DEFAULT_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
    }

    return createClient(supabaseUrl, serviceRoleKey);
}

module.exports = { createSupabaseServiceClient };
