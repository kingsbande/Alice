const { timingSafeEqual } = require("crypto");

function checkAccess(req) {
  const expectedCode = process.env.ALICE_ACCESS_CODE;
  if (!expectedCode) {
    return { ok: false, error: "Alice access is not configured on the server." };
  }

  const providedCode = req.headers?.["x-alice-key"];
  const expected = Buffer.from(expectedCode, "utf8");
  const provided = typeof providedCode === "string" ? Buffer.from(providedCode, "utf8") : Buffer.alloc(0);
  const sameLength = provided.length === expected.length;
  const candidate = sameLength ? provided : Buffer.alloc(expected.length);
  const matches = timingSafeEqual(expected, candidate) && sameLength;

  return matches
    ? { ok: true }
    : { ok: false, error: "Invalid or missing access code." };
}

module.exports = { checkAccess };
