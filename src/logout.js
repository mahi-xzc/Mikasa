"use strict";
const utils = require("../utils");
const log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  return function logout(callback) {
    let resolveFunc, rejectFunc;
    const returnPromise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = (err) => err ? rejectFunc(err) : resolveFunc();
    }

    (async () => {
      try {
        ctx.loggedIn = false;
        ctx.mqttClient?.end();
        ctx.mqttClient = null;

        const jar = ctx.jar;
        jar.setCookie("c_user=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.facebook.com", "https://www.facebook.com");
        jar.setCookie("xs=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.facebook.com", "https://www.facebook.com");
        jar.setCookie("fr=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.facebook.com", "https://www.facebook.com");
        jar.setCookie("datr=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.facebook.com", "https://www.facebook.com");
        jar.setCookie("sb=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.facebook.com", "https://www.facebook.com");

        await defaultFuncs.get("https://www.facebook.com/logout", jar)
          .then(utils.saveCookies(jar))
          .catch(() => {});

        log.info("logout", "Logged out successfully");
        callback(null);
      } catch (err) {
        log.error("logout", err);
        callback(err);
      }
    })();

    return returnPromise;
  };
};