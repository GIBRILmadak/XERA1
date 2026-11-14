const assert = require("node:assert/strict");
const {
    sanitizeSupportMessage,
    buildSupportNotificationMessage,
} = require("../server/monetization-server");

const sanitized = sanitizeSupportMessage(
    "\n Bravo pour votre travail! \nMerci pour tout ❤️ ",
);
assert.equal(sanitized, "Bravo pour votre travail! Merci pour tout ❤️");

const message = buildSupportNotificationMessage(
    "Ava",
    10,
    "Merci pour votre travail !",
);
assert.equal(
    message,
    'Ava vous a envoyé $10.00 de soutien. Message: "Merci pour votre travail !"',
);

const messageWithoutText = buildSupportNotificationMessage("Ava", 10, "");
assert.equal(messageWithoutText, "Ava vous a envoyé $10.00 de soutien.");

console.log("support message tests passed");
