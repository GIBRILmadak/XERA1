#!/usr/bin/env node
// Supprime les enregistrements dans la table `bots` quand plusieurs bots partagent
// exactement le même `display_name` (comparaison insensible à la casse et aux espaces).
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/dedupe-bots.js

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "xera1-dedupe-bots" } },
});

function normalizeName(raw) {
    if (!raw) return "";
    return String(raw).trim().toLowerCase();
}

async function main() {
    try {
        console.log("Fetching bots...");
        const { data: bots, error } = await supabase
            .from("bots")
            .select("user_id, display_name, meta");
        if (error) throw error;
        if (!bots || bots.length === 0) {
            console.log("No bots found.");
            return;
        }

        const groups = {};
        for (const b of bots) {
            const n = normalizeName(b.display_name || "");
            if (!n) continue;
            groups[n] = groups[n] || [];
            groups[n].push(b);
        }

        const duplicates = Object.entries(groups).filter(
            ([name, arr]) => arr.length > 1,
        );
        if (duplicates.length === 0) {
            console.log("No duplicate display_name groups found.");
            return;
        }

        console.log(`Found ${duplicates.length} duplicate name group(s).`);

        let totalDeleted = 0;
        for (const [name, list] of duplicates) {
            console.log(`Processing group '${name}' (${list.length} bots)`);
            const userIds = list.map((r) => r.user_id).filter(Boolean);
            // Fetch follower counts from users to pick the best to keep
            const { data: users } = await supabase
                .from("users")
                .select("id, followers_count")
                .in("id", userIds);
            const counts = {};
            if (users && Array.isArray(users)) {
                users.forEach(
                    (u) => (counts[u.id] = Number(u.followers_count) || 0),
                );
            }

            // pick keep candidate = max followers_count, fallback to first
            let keep = list[0];
            let maxCount = counts[keep.user_id] || 0;
            for (const item of list) {
                const c = counts[item.user_id] || 0;
                if (c > maxCount) {
                    maxCount = c;
                    keep = item;
                }
            }

            const toDelete = list
                .filter((r) => r.user_id !== keep.user_id)
                .map((r) => r.user_id);
            if (toDelete.length === 0) {
                console.log(`Nothing to delete for group '${name}'.`);
                continue;
            }

            console.log(
                `Keeping ${keep.user_id} and deleting ${toDelete.length} bot(s).`,
            );
            const { error: delErr } = await supabase
                .from("bots")
                .delete()
                .in("user_id", toDelete);
            if (delErr) {
                console.error(
                    `Failed to delete bots for group '${name}':`,
                    delErr,
                );
            } else {
                totalDeleted += toDelete.length;
            }
        }

        console.log(`Done. Total bots deleted: ${totalDeleted}`);
    } catch (e) {
        console.error("dedupe-bots error:", e?.message || e);
        process.exit(1);
    }
}

main();
