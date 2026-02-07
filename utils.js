"use strict";

var request = require("request").defaults({ jar: true, proxy: process.env.FB_PROXY });
var stream = require("stream");
var log = require("npmlog");
var querystring = require("querystring");
var url = require("url");

function getType(obj) {
    return Object.prototype.toString.call(obj).slice(8, -1);
}

function isReadableStream(obj) {
    return obj instanceof stream.Stream && (getType(obj._read) === "Function" || getType(obj._read) === "AsyncFunction") && getType(obj._readableState) === "Object";
}

function getHeaders(url, options, ctx, customHeader) {
    var headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://www.facebook.com/",
        "Host": url.replace("https://", "").split("/")[0],
        "Origin": "https://www.facebook.com",
        "User-Agent": options.userAgent,
        "Connection": "keep-alive",
        "sec-fetch-site": "same-origin"
    };
    if (customHeader) Object.assign(headers, customHeader);
    if (ctx && ctx.region) headers["X-MSGR-Region"] = ctx.region;
    return headers;
}

function setProxy(url) {
    if (typeof url == "undefined") return request = require("request").defaults({ jar: true });
    return request = require("request").defaults({ jar: true, proxy: url });
}

function get(url, jar, qs, options, ctx) {
    if (getType(qs) === "Object") {
        for (var prop in qs) {
            if (qs.hasOwnProperty(prop) && getType(qs[prop]) === "Object") {
                qs[prop] = JSON.stringify(qs[prop]);
            }
        }
    }
    var op = {
        headers: getHeaders(url, options, ctx),
        timeout: 60000,
        qs: qs,
        url: url,
        method: "GET",
        jar: jar,
        gzip: true
    };
    return new Promise(function(resolve, reject) {
        request(op, function(err, res, body) {
            if (err) return reject(err);
            resolve(res);
        });
    });
}

function post(url, jar, form, options, ctx, customHeader) {
    var op = {
        headers: getHeaders(url, options, ctx, customHeader),
        timeout: 60000,
        url: url,
        method: "POST",
        form: form,
        jar: jar,
        gzip: true
    };
    return new Promise(function(resolve, reject) {
        request(op, function(err, res, body) {
            if (err) return reject(err);
            resolve(res);
        });
    });
}

function postFormData(url, jar, form, qs, options, ctx) {
    var headers = getHeaders(url, options, ctx);
    headers["Content-Type"] = "multipart/form-data";
    var op = {
        headers: headers,
        timeout: 60000,
        url: url,
        method: "POST",
        formData: form,
        qs: qs,
        jar: jar,
        gzip: true
    };
    return new Promise(function(resolve, reject) {
        request(op, function(err, res, body) {
            if (err) return reject(err);
            resolve(res);
        });
    });
}

function padZeros(val, len) {
    val = String(val);
    len = len || 2;
    while (val.length < len) val = "0" + val;
    return val;
}

function generateThreadingID(clientID) {
    var k = Date.now();
    var l = Math.floor(Math.random() * 4294967295);
    var m = clientID;
    return "<" + k + ":" + l + "-" + m + "@mail.projektitan.com>";
}

function binaryToDecimal(data) {
    var ret = "";
    while (data !== "0") {
        var end = 0;
        var fullName = "";
        var i = 0;
        for (; i < data.length; i++) {
            end = 2 * end + parseInt(data[i], 10);
            if (end >= 10) {
                fullName += "1";
                end -= 10;
            } else {
                fullName += "0";
            }
        }
        ret = end.toString() + ret;
        data = fullName.slice(fullName.indexOf("1"));
    }
    return ret;
}

function generateOfflineThreadingID() {
    var ret = Date.now();
    var value = Math.floor(Math.random() * 4294967295);
    var str = ("0000000000000000000000" + value.toString(2)).slice(-22);
    var msgs = ret.toString(2) + str;
    return binaryToDecimal(msgs);
}

function getGUID() {
    var sectionLength = Date.now();
    var id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
        var r = Math.floor((sectionLength + Math.random() * 16) % 16);
        sectionLength = Math.floor(sectionLength / 16);
        var _guid = (c == "x" ? r : (r & 7) | 8).toString(16);
        return _guid;
    });
    return id;
}

function getExtension(original_extension, fullFileName) {
    if (original_extension) return original_extension;
    var extension = fullFileName.split(".").pop();
    if (extension === fullFileName) return "";
    return extension;
}

function _formatAttachment(attachment1, attachment2) {
    var fullFileName = attachment1.filename;
    var fileSize = Number(attachment1.fileSize || 0);
    var durationVideo = attachment1.genericMetadata ? Number(attachment1.genericMetadata.videoLength) : undefined;
    var durationAudio = attachment1.genericMetadata ? Number(attachment1.genericMetadata.duration) : undefined;
    var mimeType = attachment1.mimeType;
    attachment2 = attachment2 || { id: "", image_data: {} };
    attachment1 = attachment1.mercury || attachment1;
    var blob = attachment1.blob_attachment || attachment1.sticker_attachment;
    var type = blob && blob.__typename ? blob.__typename : attachment1.attach_type;
    if (!type && attachment1.sticker_attachment) {
        type = "StickerAttachment";
        blob = attachment1.sticker_attachment;
    } else if (!type && attachment1.extensible_attachment) {
        if (attachment1.extensible_attachment.story_attachment && attachment1.extensible_attachment.story_attachment.target && attachment1.extensible_attachment.story_attachment.target.__typename && attachment1.extensible_attachment.story_attachment.target.__typename === "MessageLocation") type = "MessageLocation";
        else type = "ExtensibleAttachment";
        blob = attachment1.extensible_attachment;
    }
    switch (type) {
        case "sticker":
            return { type: "sticker", ID: attachment1.metadata.stickerID.toString(), url: attachment1.url, packID: attachment1.metadata.packID.toString(), spriteUrl: attachment1.metadata.spriteURI, spriteUrl2x: attachment1.metadata.spriteURI2x, width: attachment1.metadata.width, height: attachment1.metadata.height, caption: attachment2.caption, description: attachment2.description, frameCount: attachment1.metadata.frameCount, frameRate: attachment1.metadata.frameRate, framesPerRow: attachment1.metadata.framesPerRow, framesPerCol: attachment1.metadata.framesPerCol, stickerID: attachment1.metadata.stickerID.toString(), spriteURI: attachment1.metadata.spriteURI, spriteURI2x: attachment1.metadata.spriteURI2x };
        case "file":
            return { type: "file", ID: attachment2.id.toString(), fullFileName: fullFileName, filename: attachment1.name, fileSize: fileSize, original_extension: getExtension(attachment1.original_extension, fullFileName), mimeType: mimeType, url: attachment1.url, isMalicious: attachment2.is_malicious, contentType: attachment2.mime_type, name: attachment1.name };
        case "photo":
            return { type: "photo", ID: attachment1.metadata.fbid.toString(), filename: attachment1.fileName, fullFileName: fullFileName, fileSize: fileSize, original_extension: getExtension(attachment1.original_extension, fullFileName), mimeType: mimeType, thumbnailUrl: attachment1.thumbnail_url, previewUrl: attachment1.preview_url, previewWidth: attachment1.preview_width, previewHeight: attachment1.preview_height, largePreviewUrl: attachment1.large_preview_url, largePreviewWidth: attachment1.large_preview_width, largePreviewHeight: attachment1.large_preview_height, url: attachment1.metadata.url, width: attachment1.metadata.dimensions.split(",")[0], height: attachment1.metadata.dimensions.split(",")[1], name: fullFileName };
        case "animated_image":
            return { type: "animated_image", ID: attachment2.id.toString(), filename: attachment2.filename, fullFileName: fullFileName, original_extension: getExtension(attachment2.original_extension, fullFileName), mimeType: mimeType, previewUrl: attachment1.preview_url, previewWidth: attachment1.preview_width, previewHeight: attachment1.preview_height, url: attachment2.image_data.url, width: attachment2.image_data.width, height: attachment2.image_data.height, name: attachment1.name, facebookUrl: attachment1.url, thumbnailUrl: attachment1.thumbnail_url, rawGifImage: attachment2.image_data.raw_gif_image, rawWebpImage: attachment2.image_data.raw_webp_image, animatedGifUrl: attachment2.image_data.animated_gif_url, animatedGifPreviewUrl: attachment2.image_data.animated_gif_preview_url, animatedWebpUrl: attachment2.image_data.animated_webp_url, animatedWebpPreviewUrl: attachment2.image_data.animated_webp_preview_url };
        case "share":
            return { type: "share", ID: attachment1.share.share_id.toString(), url: attachment2.href, title: attachment1.share.title, description: attachment1.share.description, source: attachment1.share.source, image: attachment1.share.media.image, width: attachment1.share.media.image_size.width, height: attachment1.share.media.image_size.height, playable: attachment1.share.media.playable, duration: attachment1.share.media.duration, subattachments: attachment1.share.subattachments, properties: {}, animatedImageSize: attachment1.share.media.animated_image_size, facebookUrl: attachment1.share.uri, target: attachment1.share.target, styleList: attachment1.share.style_list };
        case "video":
            return { type: "video", ID: attachment1.metadata.fbid.toString(), filename: attachment1.name, fullFileName: fullFileName, original_extension: getExtension(attachment1.original_extension, fullFileName), mimeType: mimeType, duration: durationVideo, previewUrl: attachment1.preview_url, previewWidth: attachment1.preview_width, previewHeight: attachment1.preview_height, url: attachment1.url, width: attachment1.metadata.dimensions.width, height: attachment1.metadata.dimensions.height, videoType: "unknown", thumbnailUrl: attachment1.thumbnail_url };
        case "error":
            return { type: "error", attachment1: attachment1, attachment2: attachment2 };
        case "MessageImage":
            return { type: "photo", ID: blob.legacy_attachment_id, filename: blob.filename, fullFileName: fullFileName, fileSize: fileSize, original_extension: getExtension(blob.original_extension, fullFileName), mimeType: mimeType, thumbnailUrl: blob.thumbnail.uri, previewUrl: blob.preview.uri, previewWidth: blob.preview.width, previewHeight: blob.preview.height, largePreviewUrl: blob.large_preview.uri, largePreviewWidth: blob.large_preview.width, largePreviewHeight: blob.large_preview.height, url: blob.large_preview.uri, width: blob.original_dimensions.x, height: blob.original_dimensions.y, name: blob.filename };
        case "MessageAnimatedImage":
            return { type: "animated_image", ID: blob.legacy_attachment_id, filename: blob.filename, fullFileName: fullFileName, original_extension: getExtension(blob.original_extension, fullFileName), mimeType: mimeType, previewUrl: blob.preview_image.uri, previewWidth: blob.preview_image.width, previewHeight: blob.preview_image.height, url: blob.animated_image.uri, width: blob.animated_image.width, height: blob.animated_image.height, thumbnailUrl: blob.preview_image.uri, name: blob.filename, facebookUrl: blob.animated_image.uri, rawGifImage: blob.animated_image.uri, animatedGifUrl: blob.animated_image.uri, animatedGifPreviewUrl: blob.preview_image.uri, animatedWebpUrl: blob.animated_image.uri, animatedWebpPreviewUrl: blob.preview_image.uri };
        case "MessageVideo":
            return { type: "video", ID: blob.legacy_attachment_id, filename: blob.filename, fullFileName: fullFileName, original_extension: getExtension(blob.original_extension, fullFileName), fileSize: fileSize, duration: durationVideo, mimeType: mimeType, previewUrl: blob.large_image.uri, previewWidth: blob.large_image.width, previewHeight: blob.large_image.height, url: blob.playable_url, width: blob.original_dimensions.x, height: blob.original_dimensions.y, videoType: blob.video_type.toLowerCase(), thumbnailUrl: blob.large_image.uri };
        case "MessageAudio":
            return { type: "audio", ID: blob.url_shimhash, filename: blob.filename, fullFileName: fullFileName, fileSize: fileSize, duration: durationAudio, original_extension: getExtension(blob.original_extension, fullFileName), mimeType: mimeType, audioType: blob.audio_type, url: blob.playable_url, isVoiceMail: blob.is_voicemail };
        case "StickerAttachment":
        case "Sticker":
            return { type: "sticker", ID: blob.id, url: blob.url, packID: blob.pack ? blob.pack.id : null, spriteUrl: blob.sprite_image, spriteUrl2x: blob.sprite_image_2x, width: blob.width, height: blob.height, caption: blob.label, description: blob.label, frameCount: blob.frame_count, frameRate: blob.frame_rate, framesPerRow: blob.frames_per_row, framesPerCol: blob.frames_per_column, stickerID: blob.id, spriteURI: blob.sprite_image, spriteURI2x: blob.sprite_image_2x };
        case "MessageLocation":
            var urlAttach = blob.story_attachment.url;
            var mediaAttach = blob.story_attachment.media;
            var u = querystring.parse(url.parse(urlAttach).query).u;
            var where1 = querystring.parse(url.parse(u).query).where1;
            var address = where1.split(", ");
            var latitude;
            var longitude;
            try { latitude = Number.parseFloat(address[0]); longitude = Number.parseFloat(address[1]); } catch (err) {}
            var imageUrl;
            var width;
            var height;
            if (mediaAttach && mediaAttach.image) { imageUrl = mediaAttach.image.uri; width = mediaAttach.image.width; height = mediaAttach.image.height; }
            return { type: "location", ID: blob.legacy_attachment_id, latitude: latitude, longitude: longitude, image: imageUrl, width: width, height: height, url: u || urlAttach, address: where1, facebookUrl: blob.story_attachment.url, target: blob.story_attachment.target, styleList: blob.story_attachment.style_list };
        case "ExtensibleAttachment":
            return { type: "share", ID: blob.legacy_attachment_id, url: blob.story_attachment.url, title: blob.story_attachment.title_with_entities.text, description: blob.story_attachment.description && blob.story_attachment.description.text, source: blob.story_attachment.source ? blob.story_attachment.source.text : null, image: blob.story_attachment.media && blob.story_attachment.media.image && blob.story_attachment.media.image.uri, width: blob.story_attachment.media && blob.story_attachment.media.image && blob.story_attachment.media.image.width, height: blob.story_attachment.media && blob.story_attachment.media.image && blob.story_attachment.media.image.height, playable: blob.story_attachment.media && blob.story_attachment.media.is_playable, duration: blob.story_attachment.media && blob.story_attachment.media.playable_duration_in_ms, playableUrl: blob.story_attachment.media == null ? null : blob.story_attachment.media.playable_url, subattachments: blob.story_attachment.subattachments, properties: blob.story_attachment.properties.reduce(function(obj, cur) { obj[cur.key] = cur.value.text; return obj; }, {}), facebookUrl: blob.story_attachment.url, target: blob.story_attachment.target, styleList: blob.story_attachment.style_list };
        case "MessageFile":
            return { type: "file", ID: blob.message_file_fbid, fullFileName: fullFileName, filename: blob.filename, fileSize: fileSize, mimeType: blob.mimetype, original_extension: blob.original_extension || fullFileName.split(".").pop(), url: blob.url, isMalicious: blob.is_malicious, contentType: blob.content_type, name: blob.filename };
        default:
            throw new Error("unrecognized attach_file of type " + type + "`" + JSON.stringify(attachment1, null, 4) + " attachment2: " + JSON.stringify(attachment2, null, 4) + "`");
    }
}

function formatAttachment(attachments, attachmentIds, attachmentMap, shareMap) {
    attachmentMap = shareMap || attachmentMap;
    return attachments ? attachments.map(function(val, i) {
        if (!attachmentMap || !attachmentIds || !attachmentMap[attachmentIds[i]]) return _formatAttachment(val);
        return _formatAttachment(val, attachmentMap[attachmentIds[i]]);
    }) : [];
}

function formatDeltaMessage(m) {
    var md = m.delta.messageMetadata;
    var mdata = m.delta.data === undefined ? [] : m.delta.data.prng === undefined ? (m.delta.data.mn || []) : (typeof m.delta.data.prng === "string" ? JSON.parse(m.delta.data.prng) : m.delta.data.prng);
    var m_id = mdata.map(u => u.i);
    var m_offset = mdata.map(u => u.o);
    var m_length = mdata.map(u => u.l);
    var mentions = {};
    var body = m.delta.body || "";
    var args = body == "" ? [] : body.trim().split(/\s+/);
    for (var i = 0; i < m_id.length; i++) mentions[m_id[i]] = m.delta.body.substring(m_offset[i], m_offset[i] + m_length[i]);
    return { type: "message", senderID: formatID(md.actorFbId.toString()), threadID: formatID((md.threadKey.threadFbId || md.threadKey.otherUserFbId).toString()), args: args, body: body, messageID: md.messageId, attachments: (m.delta.attachments || []).map(v => _formatAttachment(v)), mentions: mentions, timestamp: md.timestamp, isGroup: !!md.threadKey.threadFbId, participantIDs: m.delta.participants || [] };
}

function formatID(id) {
    if (id != undefined && id != null) return id.replace(/(fb)?id[:.]/, "");
    return id;
}

function formatMessage(m) {
    var originalMessage = m.message ? m.message : m;
    var obj = { type: "message", senderName: originalMessage.sender_name, senderID: formatID(originalMessage.sender_fbid.toString()), participantNames: originalMessage.group_thread_info ? originalMessage.group_thread_info.participant_names : [originalMessage.sender_name.split(" ")[0]], participantIDs: originalMessage.group_thread_info ? originalMessage.group_thread_info.participant_ids.map(function(v) { return formatID(v.toString()); }) : [formatID(originalMessage.sender_fbid)], body: originalMessage.body || "", threadID: formatID((originalMessage.thread_fbid || originalMessage.other_user_fbid).toString()), threadName: originalMessage.group_thread_info ? originalMessage.group_thread_info.name : originalMessage.sender_name, location: originalMessage.coordinates ? originalMessage.coordinates : null, messageID: originalMessage.mid ? originalMessage.mid.toString() : originalMessage.message_id, attachments: formatAttachment(originalMessage.attachments, originalMessage.attachmentIds, originalMessage.attachment_map, originalMessage.share_map), timestamp: originalMessage.timestamp, timestampAbsolute: originalMessage.timestamp_absolute, timestampRelative: originalMessage.timestamp_relative, timestampDatetime: originalMessage.timestamp_datetime, tags: originalMessage.tags, reactions: originalMessage.reactions ? originalMessage.reactions : [], isUnread: originalMessage.is_unread };
    if (m.type === "pages_messaging") obj.pageID = m.realtime_viewer_fbid.toString();
    obj.isGroup = obj.participantIDs.length > 2;
    return obj;
}

function formatEvent(m) {
    var originalMessage = m.message ? m.message : m;
    var logMessageType = originalMessage.log_message_type;
    var logMessageData;
    if (logMessageType === "log:generic-admin-text") {
        logMessageData = originalMessage.log_message_data.untypedData;
        logMessageType = getAdminTextMessageType(originalMessage.log_message_data.message_type);
    } else {
        logMessageData = originalMessage.log_message_data;
    }
    return Object.assign(formatMessage(originalMessage), { type: "event", logMessageType: logMessageType, logMessageData: logMessageData, logMessageBody: originalMessage.log_message_body });
}

function formatHistoryMessage(m) {
    switch (m.action_type) {
        case "ma-type:log-message":
            return formatEvent(m);
        default:
            return formatMessage(m);
    }
}

function getAdminTextMessageType(type) {
    switch (type) {
        case "change_thread_theme":
            return "log:thread-color";
        case "change_thread_quick_reaction":
            return "log:thread-icon";
        case "change_thread_nickname":
            return "log:user-nickname";
        case "change_thread_admins":
            return "log:thread-admins";
        case "group_poll":
            return "log:thread-poll";
        case "change_thread_approval_mode":
            return "log:thread-approval-mode";
        case "messenger_call_log":
        case "participant_joined_group_call":
            return "log:thread-call";
        default:
            return type;
    }
}

function formatDeltaEvent(m) {
    var logMessageType;
    var logMessageData;
    switch (m.class) {
        case "AdminTextMessage":
            logMessageType = getAdminTextMessageType(m.type);
            logMessageData = m.untypedData;
            break;
        case "ThreadName":
            logMessageType = "log:thread-name";
            logMessageData = { name: m.name };
            break;
        case "ParticipantsAddedToGroupThread":
            logMessageType = "log:subscribe";
            logMessageData = { addedParticipants: m.addedParticipants };
            break;
        case "ParticipantLeftGroupThread":
            logMessageType = "log:unsubscribe";
            logMessageData = { leftParticipantFbId: m.leftParticipantFbId };
            break;
    }
    return { type: "event", threadID: formatID((m.messageMetadata.threadKey.threadFbId || m.messageMetadata.threadKey.otherUserFbId).toString()), logMessageType: logMessageType, logMessageData: logMessageData, logMessageBody: m.messageMetadata.adminText, author: m.messageMetadata.actorFbId, participantIDs: m.participants || [] };
}

function formatTyp(event) {
    return { isTyping: !!event.st, from: event.from.toString(), threadID: formatID((event.to || event.thread_fbid || event.from).toString()), fromMobile: event.hasOwnProperty("from_mobile") ? event.from_mobile : true, userID: (event.realtime_viewer_fbid || event.from).toString(), type: "typ" };
}

function formatDeltaReadReceipt(delta) {
    return { reader: (delta.threadKey.otherUserFbId || delta.actorFbId).toString(), time: delta.actionTimestampMs, threadID: formatID((delta.threadKey.otherUserFbId || delta.threadKey.threadFbId).toString()), type: "read_receipt" };
}

function formatReadReceipt(event) {
    return { reader: event.reader.toString(), time: event.time, threadID: formatID((event.thread_fbid || event.reader).toString()), type: "read_receipt" };
}

function formatRead(event) {
    return { threadID: formatID(((event.chat_ids && event.chat_ids[0]) || (event.thread_fbids && event.thread_fbids[0])).toString()), time: event.timestamp, type: "read" };
}

function getFrom(str, startToken, endToken) {
    var start = str.indexOf(startToken) + startToken.length;
    if (start < startToken.length) return "";
    var lastHalf = str.substring(start);
    var end = lastHalf.indexOf(endToken);
    if (end === -1) throw new Error("Could not find endTime `" + endToken + "` in the given string.");
    return lastHalf.substring(0, end);
}

function makeParsable(html) {
    var withoutForLoop = html.replace(/for\s*\(\s*;\s*;\s*\)\s*;\s*/, "");
    var maybeMultipleObjects = withoutForLoop.split(/\}\r\n *\{/);
    if (maybeMultipleObjects.length === 1) return maybeMultipleObjects;
    return "[" + maybeMultipleObjects.join("},{") + "]";
}

function arrToForm(form) {
    return arrayToObject(form, function(v) { return v.name; }, function(v) { return v.val; });
}

function arrayToObject(arr, getKey, getValue) {
    return arr.reduce(function(acc, val) {
        acc[getKey(val)] = getValue(val);
        return acc;
    }, {});
}

function getSignatureID() {
    return Math.floor(Math.random() * 2147483648).toString(16);
}

function generateTimestampRelative() {
    var d = new Date();
    return d.getHours() + ":" + padZeros(d.getMinutes());
}

function makeDefaults(html, userID, ctx) {
    var reqCounter = 1;
    var fb_dtsg = getFrom(html, 'name="fb_dtsg" value="', '"');
    var ttstamp = "2";
    for (var i = 0; i < fb_dtsg.length; i++) {
        ttstamp += fb_dtsg.charCodeAt(i);
    }
    var revision = getFrom(html, 'revision":', ",");

    function mergeWithDefaults(obj) {
        var newObj = {
            __user: userID,
            __req: (reqCounter++).toString(36),
            __rev: revision,
            __a: 1,
            fb_dtsg: ctx.fb_dtsg ? ctx.fb_dtsg : fb_dtsg,
            jazoest: ctx.ttstamp ? ctx.ttstamp : ttstamp
        };
        if (!obj) return newObj;
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                if (!newObj[prop]) {
                    newObj[prop] = obj[prop];
                }
            }
        }
        return newObj;
    }

    function postWithDefaults(url, jar, form, ctxx, customHeader) {
        return post(url, jar, mergeWithDefaults(form), ctx.globalOptions, ctxx || ctx, customHeader);
    }

    function getWithDefaults(url, jar, qs, ctxx, customHeader) {
        return get(url, jar, mergeWithDefaults(qs), ctx.globalOptions, ctxx || ctx, customHeader);
    }

    function postFormDataWithDefault(url, jar, form, qs, ctxx) {
        return postFormData(url, jar, mergeWithDefaults(form), mergeWithDefaults(qs), ctx.globalOptions, ctxx || ctx);
    }
    return { get: getWithDefaults, post: postWithDefaults, postFormData: postFormDataWithDefault };
}

function parseAndCheckLogin(ctx, defaultFuncs, retryCount, sourceCall) {
    if (retryCount == undefined) retryCount = 0;
    if (sourceCall == undefined) sourceCall = new Error();
    return function(data) {
        return new Promise(function(resolve, reject) {
            if (data.statusCode === 404) return resolve({ error: "404_IGNORED", body: null });
            if (data.statusCode >= 500 && data.statusCode < 600) {
                if (retryCount >= 5) {
                    var err = new Error("Request retry failed. Check the `res` and `statusCode` property on this error.");
                    err.statusCode = data.statusCode;
                    err.res = data.body;
                    err.sourceCall = sourceCall;
                    return reject(err);
                }
                retryCount++;
                var retryTime = Math.floor(Math.random() * 5000);
                var url = data.request.uri.protocol + "//" + data.request.uri.hostname + data.request.uri.pathname;
                if (data.request.headers["Content-Type"].split(";")[0] === "multipart/form-data") {
                    return setTimeout(function() {
                        defaultFuncs.postFormData(url, ctx.jar, data.request.formData, {}).then(parseAndCheckLogin(ctx, defaultFuncs, retryCount, sourceCall)).then(resolve).catch(reject);
                    }, retryTime);
                } else {
                    return setTimeout(function() {
                        defaultFuncs.post(url, ctx.jar, data.request.formData).then(parseAndCheckLogin(ctx, defaultFuncs, retryCount, sourceCall)).then(resolve).catch(reject);
                    }, retryTime);
                }
            }
            if (data.statusCode !== 200) {
                var err = new Error("parseAndCheckLogin got status code: " + data.statusCode + ". Bailing out of trying to parse response.");
                err.statusCode = data.statusCode;
                err.res = data.body;
                err.sourceCall = sourceCall;
                return reject(err);
            }
            var res = null;
            try {
                res = JSON.parse(makeParsable(data.body));
            } catch (e) {
                var err = new Error("JSON.parse error. Check the `detail` property on this error.");
                err.detail = e;
                err.res = data.body;
                err.sourceCall = sourceCall;
                return reject(err);
            }
            if (res.redirect && data.request.method === "GET") {
                return defaultFuncs.get(res.redirect, ctx.jar).then(parseAndCheckLogin(ctx, defaultFuncs, undefined, sourceCall)).then(resolve).catch(reject);
            }
            if (res.jsmods && res.jsmods.require && Array.isArray(res.jsmods.require[0]) && res.jsmods.require[0][0] === "Cookie") {
                res.jsmods.require[0][3][0] = res.jsmods.require[0][3][0].replace("_js_", "");
                var cookie = formatCookie(res.jsmods.require[0][3], "facebook");
                var cookie2 = formatCookie(res.jsmods.require[0][3], "messenger");
                ctx.jar.setCookie(cookie, "https://www.facebook.com");
                ctx.jar.setCookie(cookie2, "https://www.messenger.com");
            }
            if (res.jsmods && Array.isArray(res.jsmods.require)) {
                var arr = res.jsmods.require;
                for (var i in arr) {
                    if (arr[i][0] === "DTSG" && arr[i][1] === "setToken") {
                        ctx.fb_dtsg = arr[i][3][0];
                        ctx.ttstamp = "2";
                        for (var j = 0; j < ctx.fb_dtsg.length; j++) {
                            ctx.ttstamp += ctx.fb_dtsg.charCodeAt(j);
                        }
                    }
                }
            }
            if (res.error === 1357001) {
                var err = new Error("Facebook blocked login. Please visit https://facebook.com and check your account.");
                err.res = res;
                err.statusCode = data.statusCode;
                err.sourceCall = sourceCall;
                return reject(err);
            }
            resolve(res);
        });
    };
}

function saveCookies(jar) {
    return function(res) {
        var cookies = res.headers["set-cookie"] || [];
        cookies.forEach(function(c) {
            if (c.indexOf(".facebook.com") > -1) {
                jar.setCookie(c, "https://www.facebook.com");
            }
            var c2 = c.replace(/domain=\.facebook\.com/, "domain=.messenger.com");
            jar.setCookie(c2, "https://www.messenger.com");
        });
        return res;
    };
}

function formatCookie(arr, url) {
    return arr[0] + "=" + arr[1] + "; Path=" + arr[3] + "; Domain=" + url + ".com";
}

function formatThread(data) {
    return {
        threadID: formatID(data.thread_fbid.toString()),
        participants: data.participants.map(formatID),
        participantIDs: data.participants.map(formatID),
        name: data.name,
        nicknames: data.custom_nickname,
        snippet: data.snippet,
        snippetAttachments: data.snippet_attachments,
        snippetSender: formatID((data.snippet_sender || "").toString()),
        unreadCount: data.unread_count,
        messageCount: data.message_count,
        imageSrc: data.image_src,
        timestamp: data.timestamp,
        serverTimestamp: data.server_timestamp,
        muteUntil: data.mute_until,
        isCanonicalUser: data.is_canonical_user,
        isCanonical: data.is_canonical,
        isSubscribed: data.is_subscribed,
        folder: data.folder,
        isArchived: data.is_archived,
        recipientsLoadable: data.recipients_loadable,
        hasEmailParticipant: data.has_email_participant,
        readOnly: data.read_only,
        canReply: data.can_reply,
        cannotReplyReason: data.cannot_reply_reason,
        lastMessageTimestamp: data.last_message_timestamp,
        lastReadTimestamp: data.last_read_timestamp,
        lastMessageType: data.last_message_type,
        emoji: data.custom_like_icon,
        color: data.custom_color,
        adminIDs: data.admin_ids,
        threadType: data.thread_type
    };
}

function formatProxyPresence(presence, userID) {
    if (presence.lat === undefined || presence.p === undefined) return null;
    return {
        type: "presence",
        timestamp: presence.lat * 1000,
        userID: userID,
        statuses: presence.p
    };
}

function formatPresence(presence, userID) {
    return {
        type: "presence",
        timestamp: presence.la * 1000,
        userID: userID,
        statuses: presence.a
    };
}

function generatePresence(userID) {
    var time = Date.now();
    return "E" + encodeURIComponent(JSON.stringify({
        v: 3,
        time: parseInt(time / 1000, 10),
        user: userID,
        state: {
            ut: 0,
            t2: [],
            lm2: null,
            uct2: time,
            tr: null,
            tw: Math.floor(Math.random() * 4294967295) + 1,
            at: time
        },
        ch: {
            ["p_" + userID]: 0
        }
    }));
}

function generateAccessiblityCookie() {
    var time = Date.now();
    return encodeURIComponent(JSON.stringify({
        sr: 0,
        "sr-ts": time,
        jk: 0,
        "jk-ts": time,
        kb: 0,
        "kb-ts": time,
        hcm: 0,
        "hcm-ts": time
    }));
}

function getFroms(str, startToken, endToken) {
    var results = [];
    var currentIndex = 0;
    while (true) {
        var start = str.indexOf(startToken, currentIndex);
        if (start === -1) break;
        start += startToken.length;
        var lastHalf = str.substring(start);
        var end = lastHalf.indexOf(endToken);
        if (end === -1) {
            if (results.length === 0) throw Error("Could not find endToken `" + endToken + "` in the given string.");
            break;
        }
        results.push(lastHalf.substring(0, end));
        currentIndex = start + end + endToken.length;
    }
    return results.length === 0 ? "" : results.length === 1 ? results[0] : results;
}

function getAppState(jar) {
    return jar.getCookies("https://www.facebook.com").concat(jar.getCookies("https://facebook.com")).concat(jar.getCookies("https://www.messenger.com"));
}

module.exports = {
    getType,
    isReadableStream,
    get,
    post,
    postFormData,
    generateThreadingID,
    generateOfflineThreadingID,
    getGUID,
    getFrom,
    makeParsable,
    arrToForm,
    getSignatureID,
    getJar: request.jar,
    generateTimestampRelative,
    makeDefaults,
    parseAndCheckLogin,
    saveCookies,
    formatHistoryMessage,
    formatID,
    formatMessage,
    formatDeltaEvent,
    formatDeltaMessage,
    formatProxyPresence,
    formatPresence,
    formatTyp,
    formatDeltaReadReceipt,
    formatCookie,
    formatThread,
    formatReadReceipt,
    formatRead,
    generatePresence,
    generateAccessiblityCookie,
    formatDate: function(date) { return date.toUTCString(); },
    decodeClientPayload: function(payload) { return JSON.parse(String.fromCharCode.apply(null, payload)); },
    getAppState,
    getAdminTextMessageType,
    setProxy,
    getFroms,
    _formatAttachment, // Ensure this is exported for listenMqtt.js
    formatAttachment   // And this one too
};
