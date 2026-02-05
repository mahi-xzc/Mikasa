"use strict";
const utils = require("../utils");
const log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  function uploadAttachment(attachments, callback) {
    const uploads = [];
    for (let i = 0; i < attachments.length; i++) {
      if (!utils.isReadableStream(attachments[i])) {
        throw { error: "Attachment should be a readable stream" };
      }

      const form = {
        upload_1024: attachments[i],
        voice_clip: "true"
      };

      uploads.push(
        defaultFuncs
          .postFormData("https://upload.facebook.com/ajax/mercury/upload.php", ctx.jar, form, {})
          .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
          .then(resData => {
            if (resData.error) throw resData;
            return resData.payload.metadata[0];
          })
      );
    }

    Promise.all(uploads).then(resData => callback(null, resData)).catch(err => {
      log.error("uploadAttachment", err);
      callback(err);
    });
  }

  function sendEncryptedMessageAPI(form, threadID, callback) {
    defaultFuncs
      .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then(resData => {
        if (!resData) return callback({ error: "Encrypted send failed" });
        
        if (Array.isArray(resData) && resData[0]?.o0?.errors) {
          return callback({ error: resData[0].o0.errors });
        }

        const messageInfo = {
          threadID: threadID,
          messageID: utils.generateOfflineThreadingID(),
          timestamp: Date.now(),
          encrypted: true
        };
        callback(null, messageInfo);
      })
      .catch(err => {
        log.error("sendEncryptedMessage", err);
        if (err.error === "Not logged in.") ctx.loggedIn = false;
        callback(err);
      });
  }

  return function sendMessage(msg, threadID, callback, replyToMessage, isGroup) {
    if (!callback && typeof threadID === "function") {
      return threadID({ error: "Pass threadID as second argument" });
    }

    if (!replyToMessage && typeof callback === "string") {
      replyToMessage = callback;
      callback = undefined;
    }

    let resolveFunc, rejectFunc;
    const returnPromise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = (err, data) => err ? rejectFunc(err) : resolveFunc(data);
    }

    const msgType = utils.getType(msg);
    const threadIDType = utils.getType(threadID);

    if (msgType !== "String" && msgType !== "Object") {
      return callback({ error: "Message should be string or object" });
    }

    if (threadIDType !== "Array" && threadIDType !== "Number" && threadIDType !== "String") {
      return callback({ error: "ThreadID should be array, number or string" });
    }

    if (msgType === "String") msg = { body: msg };

    const messageAndOTID = utils.generateOfflineThreadingID();
    const isEncrypted = msg.encrypted || ctx.globalOptions.encryptedMode;
    
    if (isEncrypted) {
      const encryptedForm = {
        av: ctx.userID,
        queries: JSON.stringify({
          o0: {
            doc_id: "2826142347169314",
            query_params: {
              data: {
                actor_id: ctx.userID,
                client_mutation_id: Math.floor(Math.random() * 1000000).toString(),
                message: {
                  text: msg.body || "",
                  ranges: [],
                  attachment: null
                },
                offline_threading_id: messageAndOTID,
                message_id: messageAndOTID,
                thread_id: threadID.toString(),
                timestamp: Date.now(),
                skip_url_preview_gen: false
              }
            }
          }
        })
      };

      if (msg.attachment && Array.isArray(msg.attachment)) {
        uploadAttachment(msg.attachment, (err, files) => {
          if (err) return callback(err);
          
          if (files[0]?.image_id) {
            encryptedForm.queries = JSON.stringify({
              o0: {
                doc_id: "2826142347169314",
                query_params: {
                  data: {
                    actor_id: ctx.userID,
                    client_mutation_id: Math.floor(Math.random() * 1000000).toString(),
                    message: {
                      text: msg.body || "",
                      ranges: [],
                      attachment: {
                        image_id: files[0].image_id,
                        media_type: "PHOTO"
                      }
                    },
                    offline_threading_id: messageAndOTID,
                    message_id: messageAndOTID,
                    thread_id: threadID.toString(),
                    timestamp: Date.now(),
                    skip_url_preview_gen: false
                  }
                }
              }
            });
          }
          
          sendEncryptedMessageAPI(encryptedForm, threadID, callback);
        });
      } else {
        sendEncryptedMessageAPI(encryptedForm, threadID, callback);
      }
      
      return returnPromise;
    }

    const form = {
      client: "mercury",
      action_type: "ma-type:user-generated-message",
      author: "fbid:" + ctx.userID,
      timestamp: Date.now(),
      timestamp_absolute: "Today",
      timestamp_relative: utils.generateTimestampRelative(),
      is_unread: false,
      is_cleared: false,
      is_forward: false,
      source: "source:chat:web",
      body: msg.body ? msg.body.toString() : "",
      html_body: false,
      ui_push_phase: "V3",
      offline_threading_id: messageAndOTID,
      message_id: messageAndOTID,
      threading_id: utils.generateThreadingID(ctx.clientID),
      has_attachment: !!(msg.attachment || msg.url || msg.sticker),
      signatureID: utils.getSignatureID(),
      replied_to_message_id: replyToMessage || null
    };

    if (utils.getType(threadID) === "Array") {
      threadID.forEach((id, i) => form["specific_to_list[" + i + "]"] = "fbid:" + id);
      form["specific_to_list[" + threadID.length + "]"] = "fbid:" + ctx.userID;
      form["client_thread_id"] = "root:" + messageAndOTID;
    } else {
      const singleUser = (isGroup === null) ? threadID.toString().length <= 15 : !isGroup;
      if (singleUser) {
        form["specific_to_list[0]"] = "fbid:" + threadID;
        form["specific_to_list[1]"] = "fbid:" + ctx.userID;
        form["other_user_fbid"] = threadID;
      } else {
        form["thread_fbid"] = threadID;
      }
    }

    if (ctx.globalOptions.pageID) {
      form["author"] = "fbid:" + ctx.globalOptions.pageID;
      form["specific_to_list[1]"] = "fbid:" + ctx.globalOptions.pageID;
      form["creator_info[creatorID]"] = ctx.userID;
      form["creator_info[creatorType]"] = "direct_admin";
      form["creator_info[pageID]"] = ctx.globalOptions.pageID;
    }

    if (msg.attachment) {
      if (!Array.isArray(msg.attachment)) msg.attachment = [msg.attachment];
      
      uploadAttachment(msg.attachment, (err, files) => {
        if (err) return callback(err);
        
        form["image_ids"] = [];
        form["gif_ids"] = [];
        form["file_ids"] = [];
        form["video_ids"] = [];
        form["audio_ids"] = [];

        files.forEach(file => {
          const key = Object.keys(file)[0];
          form[key + "s"].push(file[key]);
        });

        if (msg.url) {
          const urlForm = {
            image_height: 960,
            image_width: 960,
            uri: msg.url
          };
          
          defaultFuncs
            .post("https://www.facebook.com/message_share_attachment/fromURI/", ctx.jar, urlForm)
            .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
            .then(resData => {
              if (!resData.error && resData.payload) {
                form["shareable_attachment[share_type]"] = "100";
                form["shareable_attachment[share_params]"] = resData.payload.share_data.share_params;
              }
              sendNormalMessage(form, threadID, callback);
            })
            .catch(() => sendNormalMessage(form, threadID, callback));
        } else {
          sendNormalMessage(form, threadID, callback);
        }
      });
    } else if (msg.url) {
      const urlForm = {
        image_height: 960,
        image_width: 960,
        uri: msg.url
      };
      
      defaultFuncs
        .post("https://www.facebook.com/message_share_attachment/fromURI/", ctx.jar, urlForm)
        .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
        .then(resData => {
          if (!resData.error && resData.payload) {
            form["shareable_attachment[share_type]"] = "100";
            form["shareable_attachment[share_params]"] = resData.payload.share_data.share_params;
          }
          sendNormalMessage(form, threadID, callback);
        })
        .catch(() => sendNormalMessage(form, threadID, callback));
    } else {
      sendNormalMessage(form, threadID, callback);
    }

    function sendNormalMessage(form, threadID, callback) {
      if (msg.sticker) form["sticker_id"] = msg.sticker;
      if (msg.location) {
        if (msg.location.latitude && msg.location.longitude) {
          form["location_attachment[coordinates][latitude]"] = msg.location.latitude;
          form["location_attachment[coordinates][longitude]"] = msg.location.longitude;
          form["location_attachment[is_current_location]"] = !!msg.location.current;
        }
      }
      if (msg.mentions) {
        for (let i = 0; i < msg.mentions.length; i++) {
          const mention = msg.mentions[i];
          if (!mention.tag) continue;
          const offset = (form["body"] || "").indexOf(mention.tag);
          if (offset < 0) continue;
          
          form["body"] = '\u200E' + (form["body"] || "");
          form["profile_xmd[" + i + "][offset]"] = offset + 1;
          form["profile_xmd[" + i + "][length]"] = mention.tag.length;
          form["profile_xmd[" + i + "][id]"] = mention.id || 0;
          form["profile_xmd[" + i + "][type]"] = "p";
        }
      }

      defaultFuncs
        .post("https://www.facebook.com/messaging/send/", ctx.jar, form)
        .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
        .then(resData => {
          if (!resData) return callback({ error: "Send failed" });
          if (resData.error) {
            if (resData.error === 1545012) log.warn("sendMessage", "Not in conversation");
            return callback(resData);
          }

          const messageInfo = resData.payload.actions.reduce((p, v) => ({
            threadID: v.thread_fbid,
            messageID: v.message_id,
            timestamp: v.timestamp
          }), null);
          callback(null, messageInfo);
        })
        .catch(err => {
          log.error("sendMessage", err);
          if (err.error === "Not logged in.") ctx.loggedIn = false;
          callback(err);
        });
    }

    return returnPromise;
  };
};