"use strict";
const utils = require("../utils");
const log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  return function setThreadTheme(threadID, themeData, callback) {
    if (!threadID || !utils.isValidThreadID(threadID)) {
      const error = { error: "Valid threadID is required" };
      if (callback) return callback(error);
      return Promise.reject(error);
    }

    let resolveFunc, rejectFunc;
    const promise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = function (err, data) {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };
    }

    (async function () {
      try {
        const now = Date.now();
        const form = {
          av: ctx.userID,
          fb_api_caller_class: "RelayModern",
          fb_api_req_friendly_name: "MWThreadThemeUpdateMutation",
          variables: JSON.stringify({
            input: {
              actor_id: ctx.userID,
              client_mutation_id: Math.floor(Math.random() * 1000000).toString(),
              source: "SETTINGS",
              theme_id: null,
              thread_id: threadID.toString(),
              custom_emoji: "👍"
            }
          }),
          server_timestamps: true,
          doc_id: "9734829906576883"
        };

        let themeId = null;
        let customEmoji = "👍";

        if (typeof themeData === "string") {
          const themeStr = themeData.trim().toLowerCase();
          if (/^\d+$/.test(themeStr)) {
            themeId = themeStr;
          } else {
            const colorMap = {
              'blue': '196241301102133',
              'purple': '370940413392601',
              'green': '169463077092846',
              'pink': '230032715012014',
              'orange': '175615189761153',
              'red': '2136751179887052',
              'yellow': '2058653964378557',
              'teal': '417639218648241',
              'black': '539927563794799',
              'white': '2873642392710980',
              'default': '196241301102133',
              'null': null,
              'none': null,
              'reset': null,
              'remove': null,
              'clear': null
            };
            themeId = colorMap[themeStr] || '196241301102133';
          }
        } else if (typeof themeData === 'object' && themeData !== null) {
          themeId = themeData.themeId || themeData.theme_id || themeData.id || null;
          customEmoji = themeData.emoji || themeData.customEmoji || '👍';
        } else if (themeData === null || themeData === undefined) {
          themeId = null;
        }

        form.variables = JSON.stringify({
          input: {
            actor_id: ctx.userID,
            client_mutation_id: Math.floor(Math.random() * 1000000).toString(),
            source: "SETTINGS",
            theme_id: themeId,
            thread_id: threadID.toString(),
            custom_emoji: customEmoji
          }
        });

        const additionalFields = {
          __user: ctx.userID,
          __a: 1,
          __req: utils.getGUID(),
          __hs: utils.getGUID(),
          dpr: 1,
          __ccg: "GOOD",
          __rev: utils.getGUID(),
          __s: utils.getGUID(),
          __hsi: utils.getGUID(),
          __comet_req: 1,
          fb_dtsg: ctx.fb_dtsg || utils.getGUID(),
          jazoest: ctx.jazoest || "2",
          lsd: ctx.lsd || utils.getGUID(),
          __spin_r: utils.getGUID(),
          __spin_b: "trunk",
          __spin_t: now,
          __crn: utils.getGUID()
        };

        Object.assign(form, additionalFields);

        let result;
        try {
          const response = await defaultFuncs
            .post("https://www.facebook.com/api/graphql/", ctx.jar, form)
            .then(utils.parseAndCheckLogin(ctx, defaultFuncs));
          result = response;
        } catch (gqlErr) {
          log.warn("setThreadTheme", "GraphQL endpoint failed, trying batch endpoint");
          const batchForm = {
            av: ctx.userID,
            queries: JSON.stringify({
              o0: {
                doc_id: "9734829906576883",
                query_params: {
                  fb_api_caller_class: "RelayModern",
                  fb_api_req_friendly_name: "MWThreadThemeUpdateMutation",
                  variables: JSON.stringify({
                    input: {
                      actor_id: ctx.userID,
                      client_mutation_id: Math.floor(Math.random() * 1000000).toString(),
                      source: "SETTINGS",
                      theme_id: themeId,
                      thread_id: threadID.toString(),
                      custom_emoji: customEmoji
                    }
                  })
                }
              }
            })
          };

          const batchResponse = await defaultFuncs
            .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, batchForm)
            .then(utils.parseAndCheckLogin(ctx, defaultFuncs));
          result = batchResponse;
        }

        if (result && result.errors && result.errors.length > 0) {
          const errorMsg = result.errors.map(e => e.message || e).join(', ');
          throw new Error(`Facebook API Error: ${errorMsg}`);
        }

        let success = false;
        if (result && result.data && result.data.messenger_thread_theme_update) {
          const updateData = result.data.messenger_thread_theme_update;
          success = !updateData.errors || updateData.errors.length === 0;
        } else if (Array.isArray(result) && result[0] && result[0].o0) {
          const batchData = result[0].o0;
          if (batchData.data && batchData.data.messenger_thread_theme_update) {
            success = true;
          } else if (batchData.errors && batchData.errors.length > 0) {
            const errorMsg = batchData.errors.map(e => e.message || e).join(', ');
            throw new Error(`Batch API Error: ${errorMsg}`);
          }
        } else if (result && result.success !== false) {
          success = true;
        }

        if (!success) {
          throw new Error("Failed to update thread theme");
        }

        const responseData = {
          threadID: threadID,
          themeId: themeId,
          customEmoji: customEmoji,
          timestamp: now,
          success: true
        };

        callback(null, responseData);
        return responseData;
      } catch (err) {
        log.error("setThreadTheme", err.message || err);
        let errorMessage = err.message || "Unknown error";
        if (err.message && err.message.includes("login")) {
          errorMessage = "Not logged in or session expired";
        } else if (err.message && err.message.includes("permission")) {
          errorMessage = "No permission to change theme in this thread";
        } else if (err.message && err.message.includes("theme")) {
          errorMessage = "Invalid theme ID or theme not found";
        } else if (err.message && err.message.includes("thread")) {
          errorMessage = "Thread not found or invalid thread ID";
        }

        const errorObj = {
          error: errorMessage,
          details: err.message || err.toString(),
          threadID: threadID
        };
        callback(errorObj);
        throw errorObj;
      }
    })();
    return promise;
  };
};