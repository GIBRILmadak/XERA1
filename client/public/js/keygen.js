const crypto = require("crypto");

const curve = crypto.createECDH("prime256v1");
curve.generateKeys();

console.log("Public Key:", curve.getPublicKey().toString("base64"));
console.log("Private Key:", curve.getPrivateKey().toString("base64"));
