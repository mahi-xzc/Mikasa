"use strict";
const https = require("https");
const http = require("http");
const url = require("url");
const Stream = require("stream").Stream;
const fs = require("fs");
const zlib = require("zlib");
const querystring = require("querystring");
var log = require("npmlog");

function set(obj, key, value) {
    var keys = key.split(".");
    var cur = obj;
    keys.slice(0, -1).forEach(function(key) {
        if (cur[key] == null) cur[key] = {};
        cur = cur[key];
    });
    cur[keys.slice(-1)] = value;
}

function get(obj, key) {
    var keys = key.split(".");
    var cur = obj;
    for (var i = 0; i < keys.length; i++) {
        if (cur == null) return null;
        cur = cur[keys[i]];
    }
    return cur;
}

function isReadableStream(obj) {
    return obj instanceof Stream && typeof obj._read === "function" && typeof obj._readableState === "object";
}

function getType(obj) {
    return Object.prototype.toString.call(obj).slice(8, -1);
}

function generateThreadingID(clientID) {
    var k = Date.now();
    var l = 0;
    while (k > 0) {
        l = k % 10;
        k = (k - l) / 10;
    }
    return "196743186849063" + clientID + Date.now();
}

function generateOfflineThreadingID() {
    return Date.now() + Math.floor(Math.random() * 4294967295);
}

function getSignatureID() {
    return Math.floor(Math.random() * 2147483647) + 1;
}

function generateTimestampRelative() {
    var d = new Date();
    return d.getHours() * 60 + d.getMinutes();
}

function makeDefaults() {
    return {
        selfListen: false,
        listenEvents: true,
        pageID: null,
        updatePresence: false,
        forceLogin: false,
        autoMarkDelivery: true,
        autoMarkRead: false,
        autoReconnect: true,
        logRecordSize: 100,
        online: true,
        emitReady: false,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        autoLogAppEvents: true,
        xMsgrRegion: "ATN"
    };
}

var regSrc = /<script[^>]+src=["']?([^>"']+)["']?[^>]*>/g;
var BASE64_MARKER = ';base64,';

function convertDataURIToBinary(dataURI) {
    var base64Index = dataURI.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
    var base64 = dataURI.substring(base64Index);
    var raw = window.atob(base64);
    var rawLength = raw.length;
    var array = new Uint8Array(new ArrayBuffer(rawLength));
    for (var i = 0; i < rawLength; i++) {
        array[i] = raw.charCodeAt(i);
    }
    return array;
}

function _formatAttachment(att) {
    return {
        type: att.attach_type || "unknown",
        ID: att.fbid || att.mid || att.id,
        filename: att.filename || att.name || null,
        previewUrl: att.preview_url || att.preview || null,
        previewWidth: att.preview_width || null,
        previewHeight: att.preview_height || null,
        metadata: att.metadata || {},
        url: att.metadata && att.metadata.url || null,
        width: att.metadata && att.metadata.dimensions && att.metadata.dimensions.width,
        height: att.metadata && att.metadata.dimensions && att.metadata.dimensions.height,
        duration: att.metadata && att.metadata.duration,
        name: att.name || att.filename || null,
        audio: (att.metadata && att.metadata.audio) || false,
        isGif: (att.metadata && att.metadata.animated_image) || false,
        stickerID: (att.metadata && att.metadata.stickerID) || null
    };
}

function formatDeltaMessage(v) {
    var messageMetadata = v.delta.messageMetadata;
    var body = v.delta.body || "";
    var mentions = {};
    if (v.delta.data && v.delta.data.prng) {
        try {
            var prng = JSON.parse(v.delta.data.prng);
            if (Array.isArray(prng)) {
                prng.forEach(function(item) {
                    if (item.i && item.o !== undefined && item.l !== undefined) {
                        mentions[item.i] = body.substring(item.o, item.o + item.l);
                    }
                });
            }
        } catch (e) {}
    }
    if (v.delta.data && v.delta.data.mentionData) {
        try {
            var mentionData = JSON.parse(v.delta.data.mentionData);
            if (Array.isArray(mentionData)) {
                mentionData.forEach(function(mention) {
                    if (mention.offset !== undefined && mention.length !== undefined && mention.id) {
                        mentions[mention.id] = body.substring(mention.offset, mention.offset + mention.length);
                    }
                });
            }
        } catch (e) {}
    }
    var fmtMsg = {
        type: "message",
        senderID: messageMetadata.actorFbId.toString(),
        threadID: (messageMetadata.threadKey.threadFbId || messageMetadata.threadKey.otherUserFbId).toString(),
        messageID: messageMetadata.messageId,
        body: body,
        args: body.split(/\s+/),
        attachments: (v.delta.attachments || []).map(_formatAttachment),
        mentions: mentions,
        timestamp: messageMetadata.timestamp,
        isGroup: !!messageMetadata.threadKey.threadFbId
    };
    if (v.delta.repliedToMessage) {
        var repliedBody = v.delta.repliedToMessage.body || "";
        var rmentions = {};
        if (v.delta.repliedToMessage.data && v.delta.repliedToMessage.data.prng) {
            try {
                var rprng = JSON.parse(v.delta.repliedToMessage.data.prng);
                if (Array.isArray(rprng)) {
                    rprng.forEach(function(item) {
                        if (item.i && item.o !== undefined && item.l !== undefined) {
                            rmentions[item.i] = repliedBody.substring(item.o, item.o + item.l);
                        }
                    });
                }
            } catch (e) {}
        }
        fmtMsg.messageReply = {
            threadID: (v.delta.repliedToMessage.messageMetadata.threadKey.threadFbId || v.delta.repliedToMessage.messageMetadata.threadKey.otherUserFbId).toString(),
            messageID: v.delta.repliedToMessage.messageMetadata.messageId,
            senderID: v.delta.repliedToMessage.messageMetadata.actorFbId.toString(),
            body: repliedBody,
            attachments: (v.delta.repliedToMessage.attachments || []).map(_formatAttachment),
            mentions: rmentions,
            timestamp: v.delta.repliedToMessage.messageMetadata.timestamp
        };
    }
    return fmtMsg;
}

function decodeClientPayload(payload) {
    try {
        var buffer = Buffer.from(payload, "base64");
        var data = JSON.parse(buffer.toString());
        return data;
    } catch (e) {
        return null;
    }
}

function parseAndCheckLogin(ctx, defaultFuncs) {
    return function(res) {
        return defaultFuncs.parseAndCheckLogin(ctx, res);
    };
}

function getGUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

let lastApiCallTime = 0;
const minCallInterval = 2000;

function safeApiCall(api, method, ...args) {
    return new Promise((resolve) => {
        const now = Date.now();
        const timeSinceLastCall = now - lastApiCallTime;
        const delayTime = timeSinceLastCall < minCallInterval ? minCallInterval - timeSinceLastCall : 0;
        setTimeout(() => {
            lastApiCallTime = Date.now() + delayTime;
            api[method](...args).then(resolve).catch(resolve);
        }, delayTime);
    });
}

function loadFullThreadData(api, threadID) {
    return new Promise((resolve) => {
        setTimeout(() => {
            api.getThreadInfo(threadID).then((threadInfo) => {
                if (!threadInfo) return resolve({});
                const userMap = {};
                const participants = threadInfo.participantIDs || [];
                if (participants.length > 0) {
                    api.getUserInfo(participants).then((userInfos) => {
                        for (const id in userInfos) {
                            if (userInfos[id]) {
                                const userName = userInfos[id].name || '';
                                const normalizedName = userName
                                    .toLowerCase()
                                    .normalize('NFD')
                                    .replace(/[\u0300-\u036f]/g, '')
                                    .replace(/[^\w\s]/g, ' ')
                                    .replace(/\s+/g, ' ')
                                    .trim();
                                userMap[normalizedName] = id;
                                userMap[id] = { id, name: userName, normalizedName };
                            }
                        }
                        resolve(userMap);
                    }).catch(() => resolve({}));
                } else {
                    resolve({});
                }
            }).catch(() => resolve({}));
        }, 2000);
    });
}

function parseMentions(text) {
    const mentions = [];
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
        mentions.push({
            tag: match[1],
            id: match[2],
            index: match.index
        });
    }
    return mentions;
}

function extractUrlImage(url, callback) {
    https.get(url, function(res) {
        var data = [];
        res.on('data', function(chunk) {
            data.push(chunk);
        }).on('end', function() {
            var buffer = Buffer.concat(data);
            callback(null, buffer);
        });
    }).on('error', function(err) {
        callback(err);
    });
}

function normalizeName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

module.exports = {
    set: set,
    get: get,
    isReadableStream: isReadableStream,
    getType: getType,
    generateThreadingID: generateThreadingID,
    generateOfflineThreadingID: generateOfflineThreadingID,
    getSignatureID: getSignatureID,
    generateTimestampRelative: generateTimestampRelative,
    makeDefaults: makeDefaults,
    convertDataURIToBinary: convertDataURIToBinary,
    _formatAttachment: _formatAttachment,
    formatDeltaMessage: formatDeltaMessage,
    decodeClientPayload: decodeClientPayload,
    parseAndCheckLogin: parseAndCheckLogin,
    getGUID: getGUID,
    safeApiCall: safeApiCall,
    loadFullThreadData: loadFullThreadData,
    parseMentions: parseMentions,
    extractUrlImage: extractUrlImage,
    normalizeName: normalizeName
};
