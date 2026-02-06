"use strict";

const utils = require("../utils");
const log = require("npmlog");

function formatData(data) {
  return {
    userID: utils.formatID(data.uid.toString()),
    photoUrl: data.photo,
    indexRank: data.index_rank,
    name: data.text,
    isVerified: data.is_verified,
    profileUrl: data.path,
    category: data.category,
    score: data.score,
    type: data.type,
  };
}

module.exports = function (defaultFuncs, api, ctx) {
  return function getUserID(name, callback) {
    if (!name || typeof name !== "string") {
      const err = new Error("getUserID: name must be a non-empty string");
      log.error("getUserID", err);
      return callback ? callback(err) : Promise.reject(err);
    }

    let resolveFunc = () => {};
    let rejectFunc = () => {};
    const returnPromise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    callback = callback || ((err, data) => {
      if (err) return rejectFunc(err);
      resolveFunc(data);
    });

    const form = {
      value: name.trim(),               // ← no .toLowerCase() — fixes many non-ASCII names
      viewer: ctx.i_userID || ctx.userID,
      rsp: "search",
      context: "search",
      path: "/home.php",
      request_id: utils.getGUID(),
    };

    defaultFuncs
      .get("https://www.facebook.com/ajax/typeahead/first_degree.php", ctx.jar, form)  // ← try this first (often better for friends/known)
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then(resData => {
        if (resData.error || !resData.payload?.entries?.length) {
          // Fallback to old endpoint if first fails
          return defaultFuncs
            .get("https://www.facebook.com/ajax/typeahead/search.php", ctx.jar, form)
            .then(utils.parseAndCheckLogin(ctx, defaultFuncs));
        }
        return resData;
      })
      .then(resData => {
        if (resData.error) {
          throw resData.error;
        }

        const entries = resData.payload?.entries || [];

        if (entries.length === 0) {
          log.warn("getUserID", `No results for "${name}"`);
          return callback(null, []); // or null if you prefer single
        }

        const formatted = entries.map(formatData);

        // Most bots want the FIRST/best match (highest score/rank)
        const best = formatted[0];

        // Return single object (common pattern in many FCA forks)
        // If you want full list → callback(null, formatted);
        callback(null, {
          userID: best.userID,
          name: best.name,
          // add more fields if needed
        });
      })
      .catch(err => {
        log.error("getUserID", `Failed to resolve "${name}":`, err);
        callback(err);
      });

    return returnPromise;
  };
};