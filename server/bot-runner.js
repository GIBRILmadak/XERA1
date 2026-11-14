#!/usr/bin/env node
// Worker simple pour exécuter les actions des bots (poster chaque jour et encourager les posts recents sans doublon)
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node server/bot-runner.js

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const crypto = require("crypto");
const { buildBotPostDraft } = require("./bot-post-generator");
const {
    buildDistributedMinuteSlots,
    buildIsoFromMinuteOfDay,
    getBotDailyEncourageTarget,
    getDeterministicRandom,
} = require("./bot-schedule-utils");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuration des quotas
const MAX_ENCOURAGES_PER_RUN =
    Number(process.env.BOT_MAX_ENCOURAGES_PER_RUN) || 1000;
const MAX_POSTS_PER_RUN = Number(process.env.BOT_MAX_POSTS_PER_RUN) || 1000;
const BOT_DAILY_VIEWS_TARGET = Number(process.env.BOT_DAILY_VIEWS_TARGET) || 30;
const BOT_MIN_POSTS_PER_DAY = Math.max(
    1,
    Number(process.env.BOT_MIN_POSTS_PER_DAY) || 1,
);
const BOT_MIN_ACTIVE_ENCOURAGES_PER_DAY = Math.max(
    15,
    Number(process.env.BOT_MIN_ACTIVE_ENCOURAGES_PER_DAY) || 15,
);
const BOT_POST_WINDOW_START_MINUTE = Math.max(
    0,
    Number(process.env.BOT_POST_WINDOW_START_MINUTE) || 6 * 60,
);
const BOT_POST_WINDOW_END_MINUTE = Math.min(
    23 * 60 + 30,
    Number(process.env.BOT_POST_WINDOW_END_MINUTE) || 22 * 60 + 30,
);
const BOT_ENCOURAGE_WINDOW_START_MINUTE = Math.max(
    0,
    Number(process.env.BOT_ENCOURAGE_WINDOW_START_MINUTE) || 7 * 60,
);
const BOT_ENCOURAGE_WINDOW_END_MINUTE = Math.min(
    23 * 60 + 45,
    Number(process.env.BOT_ENCOURAGE_WINDOW_END_MINUTE) || 23 * 60,
);

let usedVideoUrlsThisRun = new Set();

// Hashtags par topic (cohérents avec le contenu du post)
const TOPIC_HASHTAGS = {
    robotics: [
        "#robotique",
        "#robot",
        "#arduino",
        "#maker",
        "#electronique",
        "#iot",
        "#automates",
        "#mecanique",
        "#cnc",
        "#impression3d",
        "#raspberrypi",
        "#servomoteur",
        "#capteur",
    ],
    ai: [
        "#ai",
        "#ia",
        "#machinelearning",
        "#deeplearning",
        "#pytorch",
        "#tensorflow",
        "#neuralnetwork",
        "#datascience",
        "#chatgpt",
        "#llm",
        "#nlp",
        "#computerVision",
    ],
    diy: [
        "#diy",
        "#bricolage",
        "#faitmain",
        "#tuto",
        "#astuce",
        "#recup",
        "#upcycling",
        "#makers",
        "#homemade",
    ],
    coding: [
        "#coding",
        "#dev",
        "#programmation",
        "#javascript",
        "#python",
        "#nodejs",
        "#webdev",
        "#opensource",
        "#code",
        "#developer",
        "#react",
        "#typescript",
        "#api",
    ],
    entrepreneurship: [
        "#entrepreneur",
        "#startup",
        "#business",
        "#growth",
        "#mvp",
        "#lean",
        "#marketing",
        "#sideproject",
        "#saas",
        "#bootstrapping",
    ],
    mechanics: [
        "#mecanique",
        "#mecanicien",
        "#atelier",
        "#soudure",
        "#usinage",
        "#maintenance",
        "#diagnostic",
        "#technique",
        "#automobile",
    ],
    music: [
        "#music",
        "#musique",
        "#guitar",
        "#piano",
        "#producer",
        "#dj",
        "#spotify",
        "#concert",
        "#spotifywrapped",
        "#beats",
        "#studio",
        "#songwriting",
        "#livemusic",
        "#musicianlife",
    ],
    gaming: [
        "#gaming",
        "#videogames",
        "#twitch",
        "#esports",
        "#streamer",
        "#ps5",
        "#xbox",
        "#nintendo",
        "#pcgaming",
        "#retrogaming",
        "#gamer",
        "#gamingcommunity",
        "#levelup",
    ],
    cooking: [
        "#cooking",
        "#cuisine",
        "#foodie",
        "#recipe",
        "#cheflife",
        "#homemade",
        "#foodporn",
        "#baking",
        "#healthyfood",
        "#mealprep",
        "#delicious",
        "#foodblogger",
        "#yummy",
    ],
    fitness: [
        "#fitness",
        "#gym",
        "#workout",
        "#health",
        "#sport",
        "#training",
        "#motivation",
        "#fitfam",
        "#bodybuilding",
        "#crossfit",
        "#yoga",
        "#wellness",
        "#fitlife",
        "#personaltrainer",
    ],
    photography: [
        "#photography",
        "#photo",
        "#photographer",
        "#camera",
        "#portrait",
        "#landscape",
        "#streetphotography",
        "#nikon",
        "#canon",
        "#sony",
        "#photoshop",
        "#editing",
        "#visualart",
    ],
    travel: [
        "#travel",
        "#voyage",
        "#adventure",
        "#explore",
        "#wanderlust",
        "#travelgram",
        "#vacation",
        "#roadtrip",
        "#backpacking",
        "#nature",
        "#travelphotography",
        "#instatravel",
        "#travelblogger",
    ],
    art: [
        "#art",
        "#artist",
        "#artwork",
        "#drawing",
        "#painting",
        "#sketch",
        "#digitalart",
        "#illustration",
        "#creative",
        "#design",
        "#artistsoninstagram",
        "#artoftheday",
        "#instaart",
        "#artgallery",
    ],
    science: [
        "#science",
        "#scientist",
        "#research",
        "#physics",
        "#chemistry",
        "#biology",
        "#space",
        "#astronomy",
        "#laboratory",
        "#discovery",
        "#stem",
        "#innovation",
        "#scientific",
    ],
    writing: [
        "#writing",
        "#writer",
        "#author",
        "#poetry",
        "#blogging",
        "#storytelling",
        "#creativewriting",
        "#novel",
        "#script",
        "#books",
        "#wordsmith",
        "#writetips",
        "#authorlife",
        "#published",
    ],
    gardening: [
        "#gardening",
        "#garden",
        "#plants",
        "#flowers",
        "#vegetables",
        "#greenthumb",
        "#organic",
        "#plantbased",
        "#horticulture",
        "#growyourown",
        "#homegarden",
        "#permaculture",
        "#botanical",
    ],
    general: [
        "#progres",
        "#quotidien",
        "#perseverance",
        "#motivation",
        "#handmade",
        "#learning",
        "#croissance",
        "#quotidien",
        "#passion",
        "#creation",
    ],
};

function generateHashtags(topic, count = 3) {
    const available = TOPIC_HASHTAGS[topic] || TOPIC_HASHTAGS.general;
    if (!available || available.length === 0) return "";

    // Seed aléatoire basé sur le topic et l'heure pour varier les hashtags
    const seed = topic + Date.now();
    const shuffled = [...available].sort((a, b) => {
        const hashA = parseInt(
            crypto
                .createHash("sha1")
                .update(a + seed)
                .digest("hex")
                .slice(0, 8),
            16,
        );
        const hashB = parseInt(
            crypto
                .createHash("sha1")
                .update(b + seed)
                .digest("hex")
                .slice(0, 8),
            16,
        );
        return hashA - hashB;
    });

    const selected = shuffled.slice(0, count);

    // Ajouter 1 hashtag aléatoire d'un autre topic (diversity)
    if (Math.random() > 0.3) {
        const otherTopics = Object.keys(TOPIC_HASHTAGS).filter(
            (t) => t !== topic,
        );
        const randomTopic =
            otherTopics[Math.floor(Math.random() * otherTopics.length)];
        const extraTag =
            TOPIC_HASHTAGS[randomTopic][
                Math.floor(Math.random() * TOPIC_HASHTAGS[randomTopic].length)
            ];
        if (extraTag && !selected.includes(extraTag)) {
            selected.push(extraTag);
        }
    }

    return selected.join(" ");
}

// Version retournant un tableau pour insertion en base
function generateHashtagsArray(topic, count = 3) {
    const available = TOPIC_HASHTAGS[topic] || TOPIC_HASHTAGS.general;
    if (!available || available.length === 0) return [];

    const seed = topic + "array" + Date.now();
    const shuffled = [...available].sort((a, b) => {
        const hashA = parseInt(
            crypto
                .createHash("sha1")
                .update(a + seed)
                .digest("hex")
                .slice(0, 8),
            16,
        );
        const hashB = parseInt(
            crypto
                .createHash("sha1")
                .update(b + seed)
                .digest("hex")
                .slice(0, 8),
            16,
        );
        return hashA - hashB;
    });

    const selected = shuffled.slice(0, count);

    if (Math.random() > 0.3) {
        const otherTopics = Object.keys(TOPIC_HASHTAGS).filter(
            (t) => t !== topic,
        );
        const randomTopic =
            otherTopics[Math.floor(Math.random() * otherTopics.length)];
        const extraTag =
            TOPIC_HASHTAGS[randomTopic][
                Math.floor(Math.random() * TOPIC_HASHTAGS[randomTopic].length)
            ];
        if (extraTag && !selected.includes(extraTag)) {
            selected.push(extraTag);
        }
    }

    return selected;
}

async function getActiveCount() {
    try {
        const { data } = await supabase
            .from("bot_control")
            .select("value")
            .eq("key", "bots.active_count")
            .maybeSingle();
        return (data?.value?.count && Number(data.value.count)) || 0;
    } catch (e) {
        console.warn("getActiveCount error", e?.message || e);
        return 0;
    }
}

async function fetchActiveBots(limit) {
    try {
        const q = supabase
            .from("bots")
            .select(
                "id,user_id,display_name,avatar_url,schedule_hour,active,last_action_at,encourage_days,meta",
            )
            .eq("active", true)
            .order("last_action_at", { ascending: true });
        if (limit && Number.isFinite(limit) && limit > 0) q.limit(limit);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.warn("fetchActiveBots error", e?.message || e);
        return [];
    }
}

function pickRandom(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

function getCurrentUtcMinute(now = new Date()) {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
}

function getElapsedWindowEnd(currentMinutes, startMinute, endMinute) {
    return Math.max(startMinute, Math.min(endMinute, currentMinutes));
}

function clampMinute(value, min, max) {
    const v = Math.floor(Number(value) || 0);
    return Math.max(min, Math.min(max, v));
}

function getBotScheduledPostMinute(bot, dayKey, fallbackMinute = 0) {
    const rawHour = Number(bot?.schedule_hour);
    const hour = Number.isFinite(rawHour)
        ? clampMinute(rawHour, 0, 23)
        : getDeterministicRandom(`${bot?.user_id}:${dayKey}:postHour`, 24);
    const minuteInHour = getDeterministicRandom(
        `${bot?.user_id}:${dayKey}:postMinute`,
        60,
    );
    const minuteOfDay = hour * 60 + minuteInHour;
    return clampMinute(
        Number.isFinite(minuteOfDay) ? minuteOfDay : fallbackMinute,
        BOT_POST_WINDOW_START_MINUTE,
        BOT_POST_WINDOW_END_MINUTE,
    );
}

async function fetchAlreadyEncouragedIds(botUserId, contentIds = []) {
    const uniqueIds = Array.from(new Set((contentIds || []).filter(Boolean)));
    if (!botUserId || uniqueIds.length === 0) return new Set();

    try {
        const { data, error } = await supabase
            .from("content_encouragements")
            .select("content_id")
            .eq("user_id", botUserId)
            .in("content_id", uniqueIds);
        if (error) throw error;
        return new Set((data || []).map((row) => String(row.content_id)));
    } catch (error) {
        console.warn(
            `fetchAlreadyEncouragedIds error for ${botUserId}:`,
            error?.message || error,
        );
        return new Set();
    }
}

function resolveDailyPostCreatedAt(bot, postMinuteMap, now) {
    const dayKey = now.toISOString().slice(0, 10);
    const fallbackMinute = getElapsedWindowEnd(
        getCurrentUtcMinute(now),
        BOT_POST_WINDOW_START_MINUTE,
        BOT_POST_WINDOW_END_MINUTE,
    );
    const assignedMinute = Number.isFinite(Number(bot?.schedule_hour))
        ? getBotScheduledPostMinute(bot, dayKey, fallbackMinute)
        : (postMinuteMap.get(String(bot.user_id)) ?? fallbackMinute);
    return buildIsoFromMinuteOfDay(
        dayKey,
        assignedMinute,
        `${bot.user_id}:post`,
    );
}

function getBotEncouragementBacklog(bot, meta, todayStr, currentMinutes) {
    const dailyTarget = getBotDailyEncourageTarget(
        bot,
        BOT_MIN_ACTIVE_ENCOURAGES_PER_DAY,
    );
    if (
        dailyTarget <= 0 ||
        currentMinutes < BOT_ENCOURAGE_WINDOW_START_MINUTE
    ) {
        return 0;
    }

    const encouragedToday =
        meta.last_action_date === todayStr
            ? Number(meta.encouraged_today) || 0
            : 0;
    if (encouragedToday >= dailyTarget) return 0;

    const elapsedEnd = getElapsedWindowEnd(
        currentMinutes,
        BOT_ENCOURAGE_WINDOW_START_MINUTE,
        BOT_ENCOURAGE_WINDOW_END_MINUTE,
    );
    const fullSpan = Math.max(
        1,
        BOT_ENCOURAGE_WINDOW_END_MINUTE - BOT_ENCOURAGE_WINDOW_START_MINUTE + 1,
    );
    const elapsedSpan = Math.max(
        1,
        elapsedEnd - BOT_ENCOURAGE_WINDOW_START_MINUTE + 1,
    );
    const targetByNow = Math.min(
        dailyTarget,
        Math.max(1, Math.ceil((elapsedSpan / fullSpan) * dailyTarget)),
    );

    return Math.max(0, targetByNow - encouragedToday);
}

function parseBotMeta(metaValue) {
    try {
        if (!metaValue) return {};
        if (typeof metaValue === "object" && !Array.isArray(metaValue)) {
            return { ...metaValue };
        }
        return JSON.parse(metaValue);
    } catch (_error) {
        return {};
    }
}

async function fetchCurrentBotMeta(userId, fallbackMeta = null) {
    try {
        const { data, error } = await supabase
            .from("bots")
            .select("meta")
            .eq("user_id", userId)
            .maybeSingle();
        if (error) throw error;
        return parseBotMeta(data?.meta);
    } catch (_error) {
        return parseBotMeta(fallbackMeta);
    }
}

async function persistMergedBotMeta(userId, metaUpdater, extraPayload = {}) {
    const currentMeta = await fetchCurrentBotMeta(userId);
    const nextMeta =
        typeof metaUpdater === "function"
            ? metaUpdater({ ...currentMeta })
            : { ...currentMeta, ...(metaUpdater || {}) };
    await supabase
        .from("bots")
        .update({
            meta: nextMeta,
            ...extraPayload,
        })
        .eq("user_id", userId);
    return nextMeta;
}

async function postAsBot(bot, options = {}) {
    try {
        const createdAt = options.createdAt || new Date().toISOString();
        const dayKey = createdAt.slice(0, 10);
        const todayStartIso = `${dayKey}T00:00:00Z`;
        const nextDayIso = new Date(
            Date.parse(`${dayKey}T00:00:00Z`) + 24 * 60 * 60 * 1000,
        ).toISOString();

        const { count: todayCount } = await supabase
            .from("content")
            .select("*", { count: "exact", head: true })
            .eq("author_type", "USER")
            .eq("author_id", bot.user_id)
            .gte("created_at", todayStartIso)
            .lt("created_at", nextDayIso);

        const postIndex = (todayCount || 0) + 1;

        const { data: recentPosts } = await supabase
            .from("content")
            .select("title, description, media_url")
            .eq("author_type", "USER")
            .eq("author_id", bot.user_id)
            .order("created_at", { ascending: false })
            .limit(20);

        const draft = await buildBotPostDraft({
            bot,
            dayKey,
            postIndex,
            recentPosts: recentPosts || [],
            recentMediaUrls: [
                ...(recentPosts || [])
                    .map((row) => row?.media_url)
                    .filter(Boolean),
                ...Array.from(usedVideoUrlsThisRun),
            ],
        });

        let nextDayNumber = 1;
        try {
            const { data: lastRow, error: lastErr } = await supabase
                .from("content")
                .select("day_number")
                .eq("author_type", "USER")
                .eq("author_id", bot.user_id)
                .order("day_number", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (
                !lastErr &&
                lastRow &&
                Number.isFinite(Number(lastRow.day_number))
            ) {
                nextDayNumber = Number(lastRow.day_number) + 1;
            }
        } catch (_error) {
            // ignore and fallback to 1
        }

        const payload = {
            user_id: bot.user_id,
            day_number: nextDayNumber,
            type: draft.mediaType || "image",
            state: "success",
            title: draft.title,
            description: draft.description,
            hashtags: draft.hashtags,
            media_url: draft.mediaUrl,
            created_at: createdAt,
        };

        const { data, error } = await supabase
            .from("content")
            .insert(payload)
            .select()
            .single();
        if (error) throw error;

        if (draft.mediaType === "video" && draft.mediaUrl) {
            usedVideoUrlsThisRun.add(String(draft.mediaUrl));
        }

        await supabase
            .from("bots")
            .update({
                last_posted_at: createdAt,
                last_action_at: new Date().toISOString(),
            })
            .eq("user_id", bot.user_id);
        console.log(
            `Bot ${bot.user_id} posted content ${data?.id || "(no-id)"}`,
        );
        return data;
    } catch (e) {
        console.warn(`postAsBot error for ${bot.user_id}:`, e?.message || e);
        return null;
    }
}

async function encourageAsBot(bot) {
    try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const { data: candidates, error } = await supabase
            .from("content")
            .select("id, user_id, created_at")
            .neq("user_id", bot.user_id)
            .order("created_at", { ascending: false })
            .limit(800);
        if (error) throw error;
        if (!candidates || candidates.length === 0) return null;

        const alreadyEncouragedIds = await fetchAlreadyEncouragedIds(
            bot.user_id,
            candidates.map((item) => item.id),
        );
        const availableCandidates = candidates.filter(
            (item) => item?.id && !alreadyEncouragedIds.has(String(item.id)),
        );
        if (availableCandidates.length === 0) return null;

        const userIds = Array.from(
            new Set(availableCandidates.map((c) => c.user_id).filter(Boolean)),
        );
        const usersMap = {};
        if (userIds.length > 0) {
            const { data: users } = await supabase
                .from("users")
                .select("id, is_bot")
                .in("id", userIds);
            if (users && users.length) {
                users.forEach((user) => {
                    usersMap[user.id] = !!user.is_bot;
                });
            }
        }

        const prioritized = availableCandidates.filter(
            (item) => !usersMap[item.user_id],
        );
        const pickFrom =
            prioritized.length > 0 ? prioritized : availableCandidates;
        const freshnessPool = pickFrom.slice(0, Math.min(40, pickFrom.length));
        const target =
            freshnessPool[
                getDeterministicRandom(
                    `${bot.user_id}:${todayStr}:encourage:${freshnessPool.length}`,
                    freshnessPool.length,
                )
            ];
        if (!target) return null;

        try {
            await supabase.rpc("increment_views", { row_id: target.id });
        } catch (incErr) {
            console.warn(
                `increment_views rpc error for ${target.id}:`,
                incErr?.message || incErr,
            );
        }

        const { data: rpcData, error: rpcErr } = await supabase.rpc(
            "toggle_courage",
            { row_id: target.id, user_id_param: bot.user_id },
        );
        if (rpcErr) throw rpcErr;

        try {
            const serverCount =
                rpcData &&
                (Number(rpcData.count) || Number(rpcData.count) === 0
                    ? Number(rpcData.count)
                    : null);
            if (Number.isFinite(serverCount)) {
                await supabase
                    .from("content")
                    .update({ encouragements_count: serverCount })
                    .eq("id", target.id);
            } else {
                const { data: row } = await supabase
                    .from("content")
                    .select("encouragements_count")
                    .eq("id", target.id)
                    .maybeSingle();
                const newCount =
                    row && Number(row.encouragements_count)
                        ? Number(row.encouragements_count) + 1
                        : 1;
                await supabase
                    .from("content")
                    .update({ encouragements_count: newCount })
                    .eq("id", target.id);
            }
        } catch (err) {
            console.warn(
                `update encouragements_count error for ${target.id}:`,
                err?.message || err,
            );
        }

        const nowIso = new Date().toISOString();
        await persistMergedBotMeta(
            bot.user_id,
            (meta) => {
                if (meta.last_action_date !== todayStr) {
                    meta.last_action_date = todayStr;
                    meta.encouraged_today = 1;
                } else {
                    meta.encouraged_today =
                        (Number(meta.encouraged_today) || 0) + 1;
                }
                return meta;
            },
            {
                last_encouraged_at: nowIso,
                last_action_at: nowIso,
            },
        );
        // Notifications pour encouragements faits par de vrais utilisateurs
        // sont gérées côté client. Les bots n'envoient pas de notifications.

        logger.debug(`Bot ${bot.user_id} encouraged content ${target.id}`);
        return rpcData;
    } catch (e) {
        console.warn(
            `encourageAsBot error for ${bot.user_id}:`,
            e?.message || e,
        );
        return null;
    }
}

async function viewAsBot(bot, dailyTarget = BOT_DAILY_VIEWS_TARGET) {
    try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const meta = await fetchCurrentBotMeta(bot.user_id, bot.meta);
        const viewedToday =
            meta.last_viewed_date === todayStr
                ? Number(meta.viewed_today) || 0
                : 0;
        const remaining = Math.max(0, Number(dailyTarget) - viewedToday);
        if (remaining <= 0) return 0;

        const seenIds =
            meta.last_viewed_date === todayStr &&
            Array.isArray(meta.viewed_content_ids)
                ? meta.viewed_content_ids.map(String)
                : [];
        const seenSet = new Set(seenIds);

        const { data: candidates, error } = await supabase
            .from("content")
            .select("id, user_id, created_at")
            .neq("user_id", bot.user_id)
            .order("created_at", { ascending: false })
            .limit(1000);
        if (error) throw error;

        const available = (candidates || []).filter(
            (item) => item?.id && !seenSet.has(String(item.id)),
        );
        if (available.length === 0) return 0;

        // Seeded shuffle for deterministic variety per bot/day
        const shuffled = [...available].sort((a, b) => {
            const av = getDeterministicRandom(
                `${bot.user_id}:${todayStr}:view:${a.id}`,
                2147483646,
            );
            const bv = getDeterministicRandom(
                `${bot.user_id}:${todayStr}:view:${b.id}`,
                2147483646,
            );
            return av - bv;
        });

        const targets = shuffled.slice(0, Math.min(remaining, 30));
        let viewed = 0;
        const viewedIds = [];
        for (const target of targets) {
            try {
                await supabase.rpc("increment_views", { row_id: target.id });
                viewed += 1;
                viewedIds.push(String(target.id));
                await sleep(20 + Math.random() * 50);
            } catch (_error) {
                // ignore per-view errors
            }
        }

        if (viewed > 0) {
            const nowIso = new Date().toISOString();
            await persistMergedBotMeta(
                bot.user_id,
                (latestMeta) => {
                    const baseViewed =
                        latestMeta.last_viewed_date === todayStr
                            ? Number(latestMeta.viewed_today) || 0
                            : 0;
                    const baseIds =
                        latestMeta.last_viewed_date === todayStr &&
                        Array.isArray(latestMeta.viewed_content_ids)
                            ? latestMeta.viewed_content_ids.map(String)
                            : [];
                    const mergedIds = Array.from(
                        new Set([...baseIds, ...viewedIds]),
                    ).slice(-180);
                    latestMeta.last_viewed_date = todayStr;
                    latestMeta.viewed_today = baseViewed + viewed;
                    latestMeta.viewed_content_ids = mergedIds;
                    return latestMeta;
                },
                { last_action_at: nowIso },
            );
            console.log(`Bot ${bot.user_id} viewed ${viewed} post(s)`);
        }

        return viewed;
    } catch (e) {
        console.warn(`viewAsBot error for ${bot.user_id}:`, e?.message || e);
        return 0;
    }
}

function isSameDayUTC(a, b) {
    if (!a || !b) return false;
    const da = new Date(a);
    const db = new Date(b);
    return (
        da.getUTCFullYear() === db.getUTCFullYear() &&
        da.getUTCMonth() === db.getUTCMonth() &&
        da.getUTCDate() === db.getUTCDate()
    );
}

async function loopOnce() {
    try {
        const activeCount = await getActiveCount();
        const bots = await fetchActiveBots(activeCount || undefined);
        if (!bots || bots.length === 0) return;
        usedVideoUrlsThisRun = new Set();

        const now = new Date();
        const currentMinutes = getCurrentUtcMinute(now);
        const todayStart = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
        const todayStr = todayStart.toISOString().slice(0, 10);

        const botUserIds = bots.map((bot) => bot.user_id).filter(Boolean);
        const { data: postsToday } = await supabase
            .from("content")
            .select("user_id")
            .in("user_id", botUserIds)
            .gte("created_at", todayStart.toISOString());

        const postsCountMap = {};
        (postsToday || []).forEach((post) => {
            postsCountMap[post.user_id] =
                (postsCountMap[post.user_id] || 0) + 1;
        });

        const postMinuteMap = buildDistributedMinuteSlots(bots, {
            dayKey: todayStr,
            actionKey: "post",
            startMinute: BOT_POST_WINDOW_START_MINUTE,
            endMinute: getElapsedWindowEnd(
                currentMinutes,
                BOT_POST_WINDOW_START_MINUTE,
                BOT_POST_WINDOW_END_MINUTE,
            ),
        });

        let postsProcessed = 0;
        let encouragesProcessed = 0;

        for (const bot of bots) {
            try {
                const meta = parseBotMeta(bot.meta);
                const currentPosts = postsCountMap[bot.user_id] || 0;

                if (
                    postsProcessed < MAX_POSTS_PER_RUN &&
                    currentPosts < BOT_MIN_POSTS_PER_DAY
                ) {
                    const scheduledMinute = Number.isFinite(
                        Number(bot?.schedule_hour),
                    )
                        ? getBotScheduledPostMinute(bot, todayStr)
                        : postMinuteMap.get(String(bot.user_id));
                    if (
                        Number.isFinite(Number(scheduledMinute)) &&
                        currentMinutes < Number(scheduledMinute)
                    ) {
                        continue;
                    }
                    const postResult = await postAsBot(bot, {
                        createdAt: resolveDailyPostCreatedAt(
                            bot,
                            postMinuteMap,
                            now,
                        ),
                    });
                    if (postResult) {
                        postsCountMap[bot.user_id] = currentPosts + 1;
                        postsProcessed += 1;
                        await sleep(300 + Math.random() * 600);
                    }
                }

                const encouragementBacklog = getBotEncouragementBacklog(
                    bot,
                    meta,
                    todayStr,
                    currentMinutes,
                );
                const encourageAttempts = Math.min(3, encouragementBacklog);
                for (let i = 0; i < encourageAttempts; i += 1) {
                    if (encouragesProcessed >= MAX_ENCOURAGES_PER_RUN) break;
                    const encourageResult = await encourageAsBot(bot);
                    if (!encourageResult) break;
                    encouragesProcessed += 1;
                    await sleep(150 + Math.random() * 350);
                }

                const viewed = await viewAsBot(bot, BOT_DAILY_VIEWS_TARGET);
                if (viewed > 0) {
                    await sleep(120 + Math.random() * 220);
                }
            } catch (botErr) {
                console.warn(
                    `Error in loopOnce for bot ${bot.user_id}:`,
                    botErr?.message || botErr,
                );
            }
        }
    } catch (e) {
        console.error("loopOnce error:", e?.message || e);
    }
}

async function main() {
    logger.debug(
        "🛑 Bot runner is DISABLED. All existing bot posts remain in the database but no new activities will be generated.",
    );
    logger.debug("To re-enable: uncomment the loop below and rebuild.");
    process.exit(0);
    /* DISABLED: Bot loop stopped to minimize Egress
    while (true) {
        await loopOnce();
        await sleep(60 * 1000);
    }
    */
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
