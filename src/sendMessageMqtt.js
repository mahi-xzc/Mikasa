var utils = require("../utils");
var log = require("npmlog");
var bluebird = require("bluebird");

module.exports = function (defaultFuncs, api, ctx) {
  const emojiSizes = { small: 1, medium: 2, large: 3 };
  let variance = 0;
  const epoch_id = () => Math.floor(Date.now() * (4194304 + (variance = (variance + 0.1) % 5)));

  function uploadAttachment(attachments, callback) {
    callback = callback || function () {};
    var uploads = [];
    for (var i = 0; i < attachments.length; i++) {
      if (!utils.isReadableStream(attachments[i])) {
        throw { error: "Attachment should be a readable stream and not " + utils.getType(attachments[i]) + "." };
      }
      var form = { upload_1024: attachments[i], voice_clip: "true" };
      uploads.push(
        defaultFuncs.postFormData("https://upload.facebook.com/ajax/mercury/upload.php", ctx.jar, form, {})
          .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
          .then(function (resData) {
            if (resData.error) throw resData;
            return resData.payload.metadata[0];
          })
      );
    }
    bluebird.all(uploads)
      .then(function (resData) { callback(null, resData); })
      .catch(function (err) {
        log.error("uploadAttachment", err);
        return callback(err);
      });
  }

  function handleEmoji(msg, form, cb) {
    if (msg.emoji) {
      if (!msg.emojiSize) msg.emojiSize = "small";
      if (!emojiSizes[msg.emojiSize]) return cb({ error: "emojiSize property is invalid" });
      form.payload.tasks[0].payload.send_type = 1;
      form.payload.tasks[0].payload.text = msg.emoji;
      form.payload.tasks[0].payload.hot_emoji_size = emojiSizes[msg.emojiSize];
    }
    cb();
  }

  function handleSticker(msg, form, cb) {
    if (msg.sticker) {
      form.payload.tasks[0].payload.send_type = 2;
      form.payload.tasks[0].payload.sticker_id = msg.sticker;
    }
    cb();
  }

  function handleAttachment(msg, form, cb) {
    if (msg.attachment) {
      form.payload.tasks[0].payload.send_type = 3;
      form.payload.tasks[0].payload.attachment_fbids = [];
      if (utils.getType(msg.attachment) !== "Array") msg.attachment = [msg.attachment];
      uploadAttachment(msg.attachment, function (err, files) {
        if (err) return cb(err);
        files.forEach(function (file) {
          var key = Object.keys(file);
          var type = key[0];
          form.payload.tasks[0].payload.attachment_fbids.push(file[type]);
        });
        cb();
      });
    } else {
      cb();
    }
  }

  function handleMention(msg, form, cb) {
    if (msg.mentions) {
      form.payload.tasks[0].payload.send_type = 1;
      let mentions = [];
      if (Array.isArray(msg.mentions)) {
        mentions = msg.mentions;
      } else {
        for (let id in msg.mentions) {
          mentions.push({ id: id, tag: msg.mentions[id] });
        }
      }
      const mentionData = {
        mention_ids: [],
        mention_offsets: [],
        mention_lengths: [],
        mention_types: []
      };
      for (let i = 0; i < mentions.length; i++) {
        const mention = mentions[i];
        const tag = mention.tag;
        if (typeof tag !== "string") return cb({ error: "Mention tags must be strings." });
        let offset = msg.body.indexOf(tag, mention.fromIndex || 0);
        if (offset < 0) {
          log.warn("handleMention", 'Mention for "' + tag + '" not found in message string.');
          continue;
        }
        if (mention.id == null) {
          log.warn("handleMention", "Mention id should be non-null.");
          continue;
        }
        let mentionId = mention.id;
        if (typeof mentionId === 'string' && mentionId.startsWith("MENTION_")) {
          log.warn("handleMention", `MENTION_ format: ${mentionId}. Using 0.`);
          mentionId = 0;
        }
        mentionData.mention_ids.push(mentionId);
        mentionData.mention_offsets.push(offset);
        mentionData.mention_lengths.push(tag.length);
        mentionData.mention_types.push("p");
      }
      if (mentionData.mention_ids.length > 0) {
        form.payload.tasks[0].payload.mention_data = {
          mention_ids: mentionData.mention_ids.join(","),
          mention_offsets: mentionData.mention_offsets.join(","),
          mention_lengths: mentionData.mention_lengths.join(","),
          mention_types: mentionData.mention_types.join(","),
        };
      }
    }
    cb();
  }

  function handleLocation(msg, form, cb) {
    if (msg.location) {
      if (msg.location.latitude == null || msg.location.longitude == null) return cb({ error: "location property needs both latitude and longitude" });
      form.payload.tasks[0].payload.send_type = 1;
      form.payload.tasks[0].payload.location_data = {
        coordinates: { latitude: msg.location.latitude, longitude: msg.location.longitude },
        is_current_location: !!msg.location.current,
        is_live_location: !!msg.location.live,
      };
    }
    cb();
  }

  function send(form, threadID, callback, replyToMessage) {
    if (replyToMessage) {
      form.payload.tasks[0].payload.reply_metadata = {
        reply_source_id: replyToMessage,
        reply_source_type: 1,
        reply_type: 0,
      };
    }
    if (!form.payload.tasks[0].payload.text && form.payload.tasks[0].payload.send_type === 1) {
        form.payload.tasks[0].payload.text = "";
    }
    form.payload.tasks.forEach((task) => { task.payload = JSON.stringify(task.payload); });
    form.payload = JSON.stringify(form.payload);
    if (ctx.mqttClient) {
        ctx.mqttClient.publish("/ls_req", JSON.stringify(form), function (err, data) {
            callback(err, { messageID: Date.now().toString(), threadID: threadID }); 
        });
    } else {
        callback({ error: "MQTT Client not connected" });
    }
  }

  return function sendMessageMqtt(msg, threadID, callback, replyToMessage) {
    if (!callback && (utils.getType(threadID) === "Function" || utils.getType(threadID) === "AsyncFunction")) return threadID({ error: "Pass a threadID as a second argument." });
    if (!replyToMessage && utils.getType(callback) === "String") { replyToMessage = callback; callback = function () {}; }
    if (!callback) callback = function (err, friendList) {};
    if (typeof msg === "string") msg = { body: msg };
    if (typeof msg !== "object") return callback({ error: "Message should be of type string or object." });
    const timestamp = Date.now();
    const otid = (BigInt(timestamp) << 22n) + BigInt(Math.floor(Math.random() * 4194304));
    const form = {
      app_id: "772021112871879",
      payload: {
        tasks: [{
          label: "464",
          payload: {
            thread_id: threadID.toString(),
            otid: otid.toString(),
            source: 0,
            send_type: 1,
            sync_group: 1,
            text: msg.body || "",
            initiating_source: 1,
            skip_url_preview_gen: 0,
          },
          queue_name: threadID.toString(),
          task_id: 0,
          failure_count: null,
        }],
        epoch_id: epoch_id(),
        version_id: "7165620133496052",
        data_trace_id: null,
      },
      request_id: 1,
      type: 3,
    };
    handleEmoji(msg, form, () => {
      handleLocation(msg, form, () => {
        handleMention(msg, form, () => {
          handleSticker(msg, form, () => {
            handleAttachment(msg, form, () => {
              send(form, threadID, callback, replyToMessage);
            });
          });
        });
      });
    });
  };
};
