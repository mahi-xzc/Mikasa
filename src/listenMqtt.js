"use strict";
var utils = require("../utils");
var log = require("npmlog");
var mqtt = require('mqtt');
var websocket = require('websocket-stream');
var HttpsProxyAgent = require('https-proxy-agent');
const EventEmitter = require('events');

var identity = function () { };
var form = {};
var getSeqID = function () { };

var topics = [
    "/legacy_web", "/webrtc", "/rtc_multi", "/onevc", "/br_sr", "/sr_res", "/t_ms", "/thread_typing",
    "/orca_typing_notifications", "/notify_disconnect", "/orca_presence", "/inbox", "/mercury",
    "/messaging_events", "/orca_message_notifications", "/pp", "/webrtc_response",
];

function listenMqtt(defaultFuncs, api, ctx, globalCallback) {
    var chatOn = ctx.globalOptions.online;
    var foreground = false;
    const sessionID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) + 1;
    const username = {
        u: ctx.userID, s: sessionID, chat_on: chatOn, fg: foreground, d: utils.getGUID(),
        ct: 'websocket', aid: '219994525426954', mqtt_sid: '', cp: 3, ecp: 10, st: [],
        pm: [], dc: '', no_auto_fg: true, gas: null, pack: [], a: ctx.globalOptions.userAgent,
        p: null, aids: null, php_override: ""
    };
    const cookies = ctx.jar.getCookies('https://www.facebook.com').join('; ');
    let host = ctx.mqttEndpoint ? `${ctx.mqttEndpoint}&sid=${sessionID}` : `wss://edge-chat.facebook.com/chat?region=${ctx.region || "prn"}&sid=${sessionID}`;

    const options = {
        clientId: 'mqttwsclient', protocolId: 'MQIsdp', protocolVersion: 3,
        username: JSON.stringify(username), clean: true,
        wsOptions: {
            headers: {
                Cookie: cookies, Origin: 'https://www.facebook.com',
                'User-Agent': ctx.globalOptions.userAgent, Referer: 'https://www.facebook.com/',
                Host: new URL(host).hostname,
            },
            origin: 'https://www.facebook.com', protocolVersion: 13, binaryType: 'arraybuffer',
        },
        keepalive: 60, reschedulePings: true, reconnectPeriod: 3,
    };

    ctx.mqttClient = new mqtt.Client(_ => websocket(host, options.wsOptions), options);
    var mqttClient = ctx.mqttClient;

    mqttClient.on('error', function (err) {
        log.error("listenMqtt", err);
        mqttClient.end();
        if (ctx.globalOptions.autoReconnect) getSeqID();
        else globalCallback({ type: "stop_listen", error: "Connection refused: Server unavailable" }, null);
    });

    mqttClient.on('connect', function () {
        topics.forEach(topicsub => mqttClient.subscribe(topicsub));
        var topic = ctx.syncToken ? "/messenger_sync_get_diffs" : "/messenger_sync_create_queue";
        var queue = {
            sync_api_version: 10, max_deltas_able_to_process: 1000, delta_batch_size: 500,
            encoding: "JSON", entity_fbid: ctx.userID,
            initial_titan_sequence_id: ctx.lastSeqId, device_params: null
        };
        if (ctx.syncToken) {
            queue.last_seq_id = ctx.lastSeqId;
            queue.sync_token = ctx.syncToken;
        }
        mqttClient.publish(topic, JSON.stringify(queue), { qos: 1, retain: false });
        mqttClient.publish("/foreground_state", JSON.stringify({ "foreground": chatOn }), { qos: 1 });
    });

    mqttClient.on('message', function (topic, message, _packet) {
        try { var jsonMessage = JSON.parse(message); } catch (ex) { return log.error("listenMqtt", ex); }
        if (topic === "/t_ms") {
            if (jsonMessage.firstDeltaSeqId && jsonMessage.syncToken) {
                ctx.lastSeqId = jsonMessage.firstDeltaSeqId;
                ctx.syncToken = jsonMessage.syncToken;
            }
            if (jsonMessage.lastIssuedSeqId) ctx.lastSeqId = parseInt(jsonMessage.lastIssuedSeqId);
            for (var i in jsonMessage.deltas) {
                var delta = jsonMessage.deltas[i];
                parseDelta(defaultFuncs, api, ctx, globalCallback, { "delta": delta });
            }
        }
    });
}

function parseDelta(defaultFuncs, api, ctx, globalCallback, v) {
    if (v.delta.class == "NewMessage") {
        if (ctx.globalOptions.pageID && ctx.globalOptions.pageID != v.queue) return;
        (function resolveAttachmentUrl(i) {
            if (v.delta.attachments && (i == v.delta.attachments.length)) {
                var fmtMsg;
                try { fmtMsg = utils.formatDeltaMessage(v); } catch (err) { return log.error("parseDelta", err); }
                if (fmtMsg && ctx.globalOptions.autoMarkDelivery) markDelivery(ctx, api, fmtMsg.threadID, fmtMsg.messageID);
                return !ctx.globalOptions.selfListen && fmtMsg.senderID === ctx.userID ? undefined : globalCallback(null, fmtMsg);
            } else {
                if (v.delta.attachments && (v.delta.attachments[i].mercury.attach_type == "photo")) {
                    api.resolvePhotoUrl(v.delta.attachments[i].fbid, (err, url) => {
                        if (!err) v.delta.attachments[i].mercury.metadata.url = url;
                        return resolveAttachmentUrl(i + 1);
                    });
                } else return resolveAttachmentUrl(i + 1);
            }
        })(0);
    }

    if (v.delta.class == "ClientPayload") {
        var clientPayload = utils.decodeClientPayload(v.delta.payload);
        if (clientPayload && clientPayload.deltas) {
            for (var i in clientPayload.deltas) {
                var delta = clientPayload.deltas[i];
                if (delta.deltaMessageReaction && !!ctx.globalOptions.listenEvents) {
                    globalCallback(null, {
                        type: "message_reaction",
                        threadID: (delta.deltaMessageReaction.threadKey.threadFbId || delta.deltaMessageReaction.threadKey.otherUserFbId).toString(),
                        messageID: delta.deltaMessageReaction.messageId,
                        reaction: delta.deltaMessageReaction.reaction,
                        senderID: delta.deltaMessageReaction.senderId.toString(),
                        userID: delta.deltaMessageReaction.userId.toString()
                    });
                } else if (delta.deltaMessageReply) {
                    var mentions = {};
                    var replyBody = delta.deltaMessageReply.message?.body || "";
                    var dataMentions = {};

                    if (delta.deltaMessageReply.message?.data) {
                        var msgData = delta.deltaMessageReply.message.data;

                        if (msgData.mentionData) {
                            try {
                                dataMentions = typeof msgData.mentionData === "string" 
                                    ? JSON.parse(msgData.mentionData) 
                                    : msgData.mentionData;
                            } catch (e) {
                                log.error("parseDelta", "Error parsing mentionData:", e);
                            }
                        }

                        if (msgData.prng) {
                            try {
                                var prngData = typeof msgData.prng === "string" 
                                    ? JSON.parse(msgData.prng) 
                                    : msgData.prng;
                                if (Array.isArray(prngData)) {
                                    prngData.forEach(function(item) {
                                        if (item.i && item.o !== undefined && item.l !== undefined) {
                                            var mentionText = replyBody.substring(item.o, item.o + item.l);
                                            mentions[item.i] = mentionText;
                                        }
                                    });
                                }
                            } catch (e) {
                                log.error("parseDelta", "Error parsing prng:", e);
                            }
                        }

                        if (msgData.mn && Array.isArray(msgData.mn)) {
                            try {
                                msgData.mn.forEach(function(item) {
                                    if (item.i && item.o !== undefined && item.l !== undefined) {
                                        var mentionText = replyBody.substring(item.o, item.o + item.l);
                                        mentions[item.i] = mentionText;
                                    }
                                });
                            } catch (e) {
                                log.error("parseDelta", "Error parsing mn:", e);
                            }
                        }

                        if (msgData.mentions && Array.isArray(msgData.mentions)) {
                            try {
                                msgData.mentions.forEach(function(mention) {
                                    if (mention.id && mention.offset !== undefined && mention.length !== undefined) {
                                        var mentionText = replyBody.substring(mention.offset, mention.offset + mention.length);
                                        mentions[mention.id] = mentionText;
                                    }
                                });
                            } catch (e) {
                                log.error("parseDelta", "Error parsing mentions:", e);
                            }
                        }
                    }

                    if (Array.isArray(dataMentions)) {
                        dataMentions.forEach(function(mention) {
                            if (mention.offset !== undefined && mention.length !== undefined && mention.userId) {
                                var mentionText = replyBody.substring(mention.offset, mention.offset + mention.length);
                                mentions[mention.userId] = mentionText;
                            }
                        });
                    } else if (dataMentions && typeof dataMentions === 'object') {
                        Object.keys(dataMentions).forEach(function(userId) {
                            var mentionInfo = dataMentions[userId];
                            if (mentionInfo && mentionInfo.o !== undefined && mentionInfo.l !== undefined) {
                                var mentionText = replyBody.substring(mentionInfo.o, mentionInfo.o + mentionInfo.l);
                                mentions[userId] = mentionText;
                            }
                        });
                    }

                    if (delta.deltaMessageReply.message?.messageMetadata?.mentions) {
                        try {
                            var metadataMentions = delta.deltaMessageReply.message.messageMetadata.mentions;
                            if (Array.isArray(metadataMentions)) {
                                metadataMentions.forEach(function(mention) {
                                    if (mention.offset !== undefined && mention.length !== undefined && mention.userId) {
                                        var mentionText = replyBody.substring(mention.offset, mention.offset + mention.length);
                                        mentions[mention.userId] = mentionText;
                                    }
                                });
                            }
                        } catch (e) {
                            log.error("parseDelta", "Error parsing metadata mentions:", e);
                        }
                    }

                    console.log("MESSAGE REPLY DEBUG");
                    console.log("Body:", replyBody);
                    console.log("Mentions object:", mentions);

                    var callbackToReturn = {
                        type: "message_reply",
                        threadID: (delta.deltaMessageReply.message.messageMetadata.threadKey.threadFbId || delta.deltaMessageReply.message.messageMetadata.threadKey.otherUserFbId).toString(),
                        messageID: delta.deltaMessageReply.message.messageMetadata.messageId,
                        senderID: delta.deltaMessageReply.message.messageMetadata.actorFbId.toString(),
                        attachments: delta.deltaMessageReply.message.attachments ? delta.deltaMessageReply.message.attachments.map(function (att) {
                            try {
                                var mercury = att.mercuryJSON ? JSON.parse(att.mercuryJSON) : att;
                                Object.assign(att, mercury);
                                return att;
                            } catch (e) {
                                return att;
                            }
                        }).map(att => {
                            var x;
                            try { x = utils._formatAttachment(att); } catch (ex) { x = att; x.error = ex; x.type = "unknown"; }
                            return x;
                        }) : [],
                        args: replyBody.trim().split(/\s+/),
                        body: replyBody,
                        isGroup: !!delta.deltaMessageReply.message.messageMetadata.threadKey.threadFbId,
                        mentions: mentions,
                        timestamp: delta.deltaMessageReply.message.messageMetadata.timestamp,
                        participantIDs: (delta.deltaMessageReply.message.participants || []).map(e => e.toString())
                    };

                    if (delta.deltaMessageReply.repliedToMessage) {
                        var rmentions = {};
                        var repliedBody = delta.deltaMessageReply.repliedToMessage?.body || "";

                        if (delta.deltaMessageReply.repliedToMessage?.data) {
                            var rMsgData = delta.deltaMessageReply.repliedToMessage.data;

                            if (rMsgData.mentionData) {
                                try {
                                    var rMentionData = typeof rMsgData.mentionData === "string" 
                                        ? JSON.parse(rMsgData.mentionData) 
                                        : rMsgData.mentionData;
                                    if (Array.isArray(rMentionData)) {
                                        rMentionData.forEach(function(mention) {
                                            if (mention.offset !== undefined && mention.length !== undefined && mention.id) {
                                                var mentionText = repliedBody.substring(mention.offset, mention.offset + mention.length);
                                                rmentions[mention.id] = mentionText;
                                            }
                                        });
                                    }
                                } catch (e) {
                                    log.error("parseDelta", "Error parsing replied mentionData:", e);
                                }
                            }

                            if (rMsgData.prng) {
                                try {
                                    var rPrngData = typeof rMsgData.prng === "string" 
                                        ? JSON.parse(rMsgData.prng) 
                                        : rMsgData.prng;
                                    if (Array.isArray(rPrngData)) {
                                        rPrngData.forEach(function(item) {
                                            if (item.i && item.o !== undefined && item.l !== undefined) {
                                                var mentionText = repliedBody.substring(item.o, item.o + item.l);
                                                rmentions[item.i] = mentionText;
                                            }
                                        });
                                    }
                                } catch (e) {
                                    log.error("parseDelta", "Error parsing replied prng:", e);
                                }
                            }

                            if (rMsgData.mn && Array.isArray(rMsgData.mn)) {
                                try {
                                    rMsgData.mn.forEach(function(item) {
                                        if (item.i && item.o !== undefined && item.l !== undefined) {
                                            var mentionText = repliedBody.substring(item.o, item.o + item.l);
                                            rmentions[item.i] = mentionText;
                                        }
                                    });
                                } catch (e) {
                                    log.error("parseDelta", "Error parsing replied mn:", e);
                                }
                            }
                        }

                        callbackToReturn.messageReply = {
                            threadID: (delta.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.threadFbId || delta.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.otherUserFbId).toString(),
                            messageID: delta.deltaMessageReply.repliedToMessage.messageMetadata.messageId,
                            senderID: delta.deltaMessageReply.repliedToMessage.messageMetadata.actorFbId.toString(),
                            attachments: delta.deltaMessageReply.repliedToMessage.attachments ? delta.deltaMessageReply.repliedToMessage.attachments.map(function (att) {
                                try {
                                    var mercury = att.mercuryJSON ? JSON.parse(att.mercuryJSON) : att;
                                    Object.assign(att, mercury);
                                    return att;
                                } catch (e) {
                                    return att;
                                }
                            }).map(att => {
                                var x;
                                try { x = utils._formatAttachment(att); } catch (ex) { x = att; x.error = ex; x.type = "unknown"; }
                                return x;
                            }) : [],
                            args: repliedBody.trim().split(/\s+/),
                            body: repliedBody,
                            isGroup: !!delta.deltaMessageReply.repliedToMessage.messageMetadata.threadKey.threadFbId,
                            mentions: rmentions,
                            timestamp: delta.deltaMessageReply.repliedToMessage.messageMetadata.timestamp,
                            participantIDs: (delta.deltaMessageReply.repliedToMessage.participants || []).map(e => e.toString())
                        };
                    }

                    if (ctx.globalOptions.autoMarkDelivery) markDelivery(ctx, api, callbackToReturn.threadID, callbackToReturn.messageID);
                    return !ctx.globalOptions.selfListen && callbackToReturn.senderID === ctx.userID ? undefined : globalCallback(null, callbackToReturn);
                }
            }
        }
    }
}

function markDelivery(ctx, api, threadID, messageID) {
    if (threadID && messageID) {
        api.markAsDelivered(threadID, messageID, (err) => {
            if (err) log.error("markAsDelivered", err);
            else {
                if (ctx.globalOptions.autoMarkRead) {
                    api.markAsRead(threadID, (err) => { if (err) log.error("markAsDelivered", err); });
                }
            }
        });
    }
}

module.exports = function (defaultFuncs, api, ctx) {
    var globalCallback = identity;
    getSeqID = function getSeqID() {
        ctx.t_mqttCalled = false;
        defaultFuncs
            .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
            .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
            .then((resData) => {
                if (utils.getType(resData) != "Array") throw { error: "Not logged in", res: resData };
                if (resData && resData[resData.length - 1].error_results > 0) throw resData[0].o0.errors;
                if (resData[0].o0.data.viewer.message_threads.sync_sequence_id) {
                    ctx.lastSeqId = resData[0].o0.data.viewer.message_threads.sync_sequence_id;
                    listenMqtt(defaultFuncs, api, ctx, globalCallback);
                }
            })
            .catch((err) => {
                log.error("getSeqId", err);
                if (utils.getType(err) == "Object" && err.error === "Not logged in") ctx.loggedIn = false;
                return globalCallback(err);
            });
    };

    return async function (callback) {
        class MessageEmitter extends EventEmitter {
            stopListening(callback) {
                callback = callback || (() => { });
                globalCallback = identity;
                if (ctx.mqttClient) {
                    ctx.mqttClient.unsubscribe("/webrtc");
                    ctx.mqttClient.unsubscribe("/rtc_multi");
                    ctx.mqttClient.unsubscribe("/onevc");
                    ctx.mqttClient.publish("/browser_close", "{}");
                    ctx.mqttClient.end(false, function (...data) {
                        callback(data);
                        ctx.mqttClient = undefined;
                    });
                }
            }
        }
        var msgEmitter = new MessageEmitter();
        globalCallback = (callback || function (error, message) {
            if (error) return msgEmitter.emit("error", error);
            msgEmitter.emit("message", message);
        });
        if (!ctx.firstListen) ctx.lastSeqId = null;
        ctx.syncToken = undefined;
        ctx.t_mqttCalled = false;
        form = {
            "av": ctx.globalOptions.pageID,
            "queries": JSON.stringify({
                "o0": {
                    "doc_id": "3336396659757871",
                    "query_params": {
                        "limit": 1, "before": null, "tags": ["INBOX"], "includeDeliveryReceipts": false, "includeSeqID": true
                    }
                }
            })
        };
        if (!ctx.firstListen || !ctx.lastSeqId) getSeqID();
        else listenMqtt(defaultFuncs, api, ctx, globalCallback);
        ctx.firstListen = false;
        return msgEmitter;
    };
};