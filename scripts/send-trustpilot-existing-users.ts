#!/usr/bin/env node

require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const TRUSTPILOT_AFS_EMAIL = "xera1.xyz+f82ea4b552@invite.trustpilot.com";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY =
    process.env.RESEND_API_KEY || process.env.RETURN_REMINDER_EMAIL_API_KEY;
const EMAIL_FROM =
    process.env.RETURN_REMINDER_EMAIL_FROM || "XERA1 <hello@xera1.xyz>";
const isDryRun = process.argv.includes("--dry-run");
const isConfirmed = process.argv.includes("--confirm");

if (!SUPABASE_URL || !SUPABASE_KEY || !RESEND_API_KEY) {
    console.error(
        "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et une clé Resend sont requis.",
    );
    process.exit(1);
}

if (!isDryRun && !isConfirmed) {
    console.error(
        "Envoi massif bloqué. Utilisez --confirm, ou --dry-run pour prévisualiser.",
    );
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
});

async function listExistingUsers() {
    const { data, error } = await supabase.from("users").select("id");
    if (error) throw error;
    return new Set((data || []).map((user) => user.id).filter(Boolean));
}

async function listAuthUsers(publicUserIds) {
    const users = [];
    for (let page = 1; ; page += 1) {
        const { data, error } = await supabase.auth.admin.listUsers({
            page,
            perPage: 1000,
        });
        if (error) throw error;

        const pageUsers = data?.users || [];
        users.push(
            ...pageUsers.filter(
                (user) =>
                    publicUserIds.has(user.id) &&
                    String(user.email || "").trim(),
            ),
        );
        if (pageUsers.length < 1000) break;
    }
    return users;
}

async function sendTrustpilotNotification(user) {
    const email = String(user.email || "")
        .trim()
        .toLowerCase();
    const payload = {
        from: EMAIL_FROM,
        to: [email],
        bcc: [TRUSTPILOT_AFS_EMAIL],
        subject: "Mise à jour de votre compte XERA1",
        html: "<p>Votre compte XERA1 continue d'évoluer. Merci de faire partie de la communauté.</p>",
        text: "Votre compte XERA1 continue d'évoluer. Merci de faire partie de la communauté.",
    };

    if (isDryRun) {
        console.log(`[dry-run] ${email}`);
        return;
    }

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`${response.status} ${await response.text()}`);
    }
}

async function main() {
    const publicUserIds = await listExistingUsers();
    const users = await listAuthUsers(publicUserIds);
    console.log(`${users.length} utilisateur(s) ciblé(s).`);

    let sent = 0;
    for (const user of users) {
        try {
            await sendTrustpilotNotification(user);
            sent += 1;
        } catch (error) {
            console.error(`Échec pour ${user.email}:`, error.message);
        }
    }

    console.log(`${sent}/${users.length} email(s) traité(s).`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
