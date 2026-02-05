"use strict";

var utils = require("../utils");
var log = require("npmlog");
var mqtt = require('mqtt');
var websocket = require('websocket-stream');
var HttpsProxyAgent = require('https-proxy-agent');
const EventEmitter = require('events');

var identity = function () { };
var getSeqID = function () { };

var topics = [
    "/legacy_web",
    "/webrtc",
    "/rtc_multi",
    "/onevc",
    "/br_sr",
    "/sr_res",
    "/t_ms",
    "/thread_typing",
    "/orca_typing_notifications",
    "/notify_disconnect",
    "/orca_presence",
    "/inbox",
    "/mercury",
    "/messaging_events",
    "/orca_message_notifications",
    "/pp",
    "/webrtc_response",
];

function listenMqtt(defaultFuncs, api, ctx, globalCallback) {
    var chatOn = ctx.globalOptions.online;
    var foreground = false;

    const sessionID = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) + 1;
    const GUID = utils.getGUID();
    const username = {
        u: ctx.userID,
        s: sessionID,
        chat_on: chatOn,
        fg: foreground,
        d: GUID,
        ct: 'websocket',
        aid: '219994525426954',
        mqtt_sid: '',
        cp: 3,
        ecp: 10,
        st: [],
        pm: [],
        dc: '',
        no_auto_fg: true,
        gas: null,
        pack: [],
        a: ctx.globalOptions.userAgent,
        p: null,
        php_override: ""
    };

    const cookies = ctx.jar.getCookies('https://www.facebook.com').join('; ');

    let host;
    if (ctx.mqttEndpoint) {
        host = `${ctx.mqttEndpoint}&sid=${sessionID}`;
    } else if (ctx.region) {
        host = `wss://edge-chat.facebook.com/chat?region=${ctx.region.toLowerCase()}&sid=${sessionID}`;
    } else {
        host = `wss://edge-chat.facebook.com/chat?sid=${sessionID}`;
    }

    const options = {
        clientId: 'mqttwsclient',
        protocolId: 'MQIsdp',
        protocolVersion: 3,
        username: JSON.stringify(username),
        clean: true,
        wsOptions: {
            headers: {
                Cookie: cookies,
                Origin: 'https://www.facebook.com',
                'User-Agent': ctx.globalOptions.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.64 Safari/537.36',
                Referer: 'https://www.facebook.com/',
                Host: new URL(host).hostname,
            },
            origin: 'https://www.facebook.com',
            protocolVersion: 13,
            binaryType: 'arraybuffer',
        },
        keepalive: 60,
        reschedulePings: true,
        reconnectPeriod: 3000,
    };

    if (ctx.globalOptions.proxy) {
        var agent = new HttpsProxyAgent(ctx.globalOptions.proxy);
        options.wsOptions.agent = agent;
    }

    ctx.mqttClient = new mqtt.Client(function () {
        return websocket(host, options.wsOptions);
    }, options);

    var mqttClient = ctx.mqttClient;

    mqttClient.on('error', function (err) {
        log.error("listenMqtt", err);
        mqttClient.end();
        if (ctx.globalOptions.autoReconnect) {
            getSeqID();
        } else {
            globalCallback({ 
                type: "stop_listen", 
                error: "Connection refused: Server unavailable" 
            }, null);
        }
    });

    mqttClient.on('connect', function () {
        topics.forEach(topic => mqttClient.subscribe(topic));

        var topic;
        var queue = {
            sync_api_version: 10,
            max_deltas_able_to_process: 1000,
            delta_batch_size: 500,
            encoding: "JSON",
            entity_fbid: ctx.userID,
        };

        if (ctx.syncToken) {
            topic = "/messenger_sync_get_diffs";
            queue.last_seq_id = ctx.lastSeqId;
            queue.sync_token = ctx.syncToken;
        } else {
            topic = "/messenger_sync_create_queue";
            queue.initial_titan_sequence_id = ctx.lastSeqId;
            queue.device_params = null;
        }

        mqttClient.publish(topic, JSON.stringify(queue), { qos: 1, retain: false });
        mqttClient.publish("/foreground_state", JSON.stringify({ "foreground": chatOn }), { qos: 1 });
        
        var rTimeout = setTimeout(function () {
            mqttClient.end();
            getSeqID();
        }, 3000);

        ctx.tmsWait = function () {
            clearTimeout(rTimeout);
            if (ctx.globalOptions.emitReady) {
                globalCallback({
                    type: "ready",
                    error: null
                });
            }
            delete ctx.tmsWait;
        };
    });

    mqttClient.on('message', function (topic, message) {
        var jsonMessage;
        try {
            jsonMessage = JSON.parse(message);
        } catch (ex) {
            log.error("listenMqtt", ex);
            return;
        }
        
        if (topic === "/t_ms") {
            if (ctx.tmsWait && typeof ctx.tmsWait == "function") {
                ctx.tmsWait();
            }

            if (jsonMessage.firstDeltaSeqId && jsonMessage.syncToken) {
                ctx.lastSeqId = jsonMessage.firstDeltaSeqId;
                ctx.syncToken = jsonMessage.syncToken;
            }

            if (jsonMessage.lastIssuedSeqId) {
                ctx.lastSeqId = parseInt(jsonMessage.lastIssuedSeqId);
            }

            if (jsonMessage.deltas && Array.isArray(jsonMessage.deltas)) {
                jsonMessage.deltas.forEach(function (delta) {
                    parseDelta(defaultFuncs, api, ctx, globalCallback, { "delta": delta });
                });
            }
        } else if (topic === "/thread_typing" || topic === "/orca_typing_notifications") {
            var typ = {
                type: "typ",
                isTyping: !!jsonMessage.state,
                from: jsonMessage.sender_fbid ? jsonMessage.sender_fbid.toString() : null,
                threadID: utils.formatID((jsonMessage.thread || jsonMessage.sender_fbid || "").toString())
            };
            globalCallback(null, typ);
        } else if (topic === "/orca_presence") {
            if (!ctx.globalOptions.updatePresence && jsonMessage.list) {
                jsonMessage.list.forEach(function (data) {
                    var presence = {
                        type: "presence",
                        userID: data.u ? data.u.toString() : null,
                        timestamp: data.l ? data.l * 1000 : null,
                        statuses: data.p || {}
                    };
                    globalCallback(null, presence);
                });
            }
        }
    });

    mqttClient.on('close', function () {
        log.info("listenMqtt", "MQTT connection closed");
    });
}

function parseDelta(defaultFuncs, api, ctx, globalCallback, v) {
    if (!v.delta) return;

    if (v.delta.class == "NewMessage") {
        if (ctx.globalOptions.pageID && ctx.globalOptions.pageID != v.queue) return;

        function resolveAttachmentUrl(i) {
            if (!v.delta.attachments || i >= v.delta.attachments.length) {
                var fmtMsg;
                try {
                    fmtMsg = utils.formatDeltaMessage(v);
                } catch (err) {
                    return globalCallback({
                        error: "Problem parsing message object.",
                        detail: err,
                        res: v,
                        type: "parse_error"
                    });
                }
                
                if (fmtMsg) {
                    if (ctx.globalOptions.autoMarkDelivery) {
                        markDelivery(ctx, api, fmtMsg.threadID, fmtMsg.messageID);
                    }
                    
                    if (!(ctx.globalOptions.selfListen === false && fmtMsg.senderID === ctx.userID)) {
                        globalCallback(null, fmtMsg);
                    }
                }
                return;
            }
            
            if (v.delta.attachments[i].mercury && v.delta.attachments[i].mercury.attach_type == "photo") {
                api.resolvePhotoUrl(v.delta.attachments[i].fbid, function (err, url) {
                    if (!err && v.delta.attachments[i].mercury) {
                        v.delta.attachments[i].mercury.metadata = v.delta.attachments[i].mercury.metadata || {};
                        v.delta.attachments[i].mercury.metadata.url = url;
                    }
                    resolveAttachmentUrl(i + 1);
                });
            } else {
                resolveAttachmentUrl(i + 1);
            }
        }
        
        resolveAttachmentUrl(0);
        return;
    }

    if (v.delta.class == "ClientPayload") {
        var clientPayload = utils.decodeClientPayload(v.delta.payload);
        if (clientPayload && clientPayload.deltas) {
            clientPayload.deltas.forEach(function (delta) {
                if (delta.deltaMessageReaction && ctx.globalOptions.listenEvents) {
                    var threadKey = delta.deltaMessageReaction.threadKey || {};
                    globalCallback(null, {
                        type: "message_reaction",
                        threadID: (threadKey.threadFbId || threadKey.otherUserFbId || "").toString(),
                        messageID: delta.deltaMessageReaction.messageId,
                        reaction: delta.deltaMessageReaction.reaction,
                        senderID: (delta.deltaMessageReaction.senderId || "").toString(),
                        userID: (delta.deltaMessageReaction.userId || "").toString()
                    });
                } else if (delta.deltaRecallMessageData && ctx.globalOptions.listenEvents) {
                    var threadKey = delta.deltaRecallMessageData.threadKey || {};
                    globalCallback(null, {
                        type: "message_unsend",
                        threadID: (threadKey.threadFbId || threadKey.otherUserFbId || "").toString(),
                        messageID: delta.deltaRecallMessageData.messageID,
                        senderID: (delta.deltaRecallMessageData.senderID || "").toString(),
                        deletionTimestamp: delta.deltaRecallMessageData.deletionTimestamp,
                        timestamp: delta.deltaRecallMessageData.timestamp
                    });
                } else if (delta.deltaMessageReply) {
                    handleMessageReply(defaultFuncs, api, ctx, globalCallback, delta);
                }
            });
            return;
        }
    }

    if (v.delta.class !== "NewMessage" && !ctx.globalOptions.listenEvents) return;
    
    switch (v.delta.class) {
        case "ReadReceipt":
            var fmtMsg;
            try {
                fmtMsg = utils.formatDeltaReadReceipt(v.delta);
            } catch (err) {
                return globalCallback({
                    error: "Problem parsing read receipt.",
                    detail: err,
                    res: v.delta,
                    type: "parse_error"
                });
            }
            globalCallback(null, fmtMsg);
            break;
            
        case "AdminTextMessage":
            var allowedTypes = [
                "change_thread_theme",
                "change_thread_nickname",
                "change_thread_admins",
                "change_thread_approval_mode",
                "joinable_group_link_mode_change",
                "rtc_call_log",
                "group_poll",
                "update_vote",
                "magic_words",
                "messenger_call_log",
                "participant_joined_group_call"
            ];
            
            if (allowedTypes.includes(v.delta.type)) {
                var fmtMsg;
                try {
                    fmtMsg = utils.formatDeltaEvent(v.delta);
                } catch (err) {
                    return globalCallback({
                        error: "Problem parsing admin message.",
                        detail: err,
                        res: v.delta,
                        type: "parse_error"
                    });
                }
                globalCallback(null, fmtMsg);
            }
            break;
            
        case "ForcedFetch":
            handleForcedFetch(defaultFuncs, api, ctx, globalCallback, v.delta);
            break;
            
        case "ThreadName":
        case "ParticipantsAddedToGroupThread":
        case "ParticipantLeftGroupThread":
            var formattedEvent;
            try {
                formattedEvent = utils.formatDeltaEvent(v.delta);
            } catch (err) {
                return globalCallback({
                    error: "Problem parsing thread event.",
                    detail: err,
                    res: v.delta,
                    type: "parse_error"
                });
            }
            
            if (!(ctx.globalOptions.selfListen === false && formattedEvent.author && formattedEvent.author.toString() === ctx.userID) && ctx.loggedIn) {
                globalCallback(null, formattedEvent);
            }
            break;
    }
}

function handleMessageReply(defaultFuncs, api, ctx, globalCallback, delta) {
    var replyData = delta.deltaMessageReply;
    if (!replyData || !replyData.message || !replyData.message.messageMetadata) return;

    var messageMeta = replyData.message.messageMetadata;
    var threadKey = messageMeta.threadKey || {};
    
    // Parse mentions for the reply message
    var mdata = [];
    if (replyData.message.data && replyData.message.data.prng) {
        try {
            mdata = JSON.parse(replyData.message.data.prng);
        } catch (e) {
            log.error("parseDelta", "Error parsing mentions:", e);
        }
    }
    
    var mentions = {};
    mdata.forEach(function (u) {
        if (u.i && u.o !== undefined && u.l) {
            mentions[u.i] = (replyData.message.body || "").substring(u.o, u.o + u.l);
        }
    });

    var callbackToReturn = {
        type: "message_reply",
        threadID: (threadKey.threadFbId || threadKey.otherUserFbId || "").toString(),
        messageID: messageMeta.messageId,
        senderID: (messageMeta.actorFbId || "").toString(),
        attachments: [],
        args: (replyData.message.body || "").trim().split(/\s+/),
        body: replyData.message.body || "",
        isGroup: !!threadKey.threadFbId,
        mentions: mentions,
        timestamp: messageMeta.timestamp || Date.now(),
        participantIDs: (replyData.message.participants || []).map(function (e) {
            return e ? e.toString() : "";
        })
    };

    // Format attachments
    if (replyData.message.attachments && Array.isArray(replyData.message.attachments)) {
        callbackToReturn.attachments = replyData.message.attachments.map(function (att) {
            try {
                if (att.mercuryJSON) {
                    var mercury = JSON.parse(att.mercuryJSON);
                    Object.assign(att, mercury);
                }
                return utils._formatAttachment(att);
            } catch (ex) {
                log.error("parseDelta", "Error formatting attachment:", ex);
                return {
                    type: "unknown",
                    error: ex,
                    raw: att
                };
            }
        });
    }

    // Handle replied to message
    if (replyData.repliedToMessage) {
        processRepliedMessage(replyData.repliedToMessage, callbackToReturn);
        finalizeMessageReply(ctx, api, globalCallback, callbackToReturn);
    } else if (replyData.replyToMessageId && replyData.replyToMessageId.id) {
        fetchMessageInfo(defaultFuncs, ctx, replyData.replyToMessageId.id, callbackToReturn.threadID)
            .then(function (replyMessage) {
                callbackToReturn.messageReply = replyMessage;
                finalizeMessageReply(ctx, api, globalCallback, callbackToReturn);
            })
            .catch(function (err) {
                log.error("fetchMessageInfo", err);
                callbackToReturn.delta = delta;
                finalizeMessageReply(ctx, api, globalCallback, callbackToReturn);
            });
    } else {
        callbackToReturn.delta = delta;
        finalizeMessageReply(ctx, api, globalCallback, callbackToReturn);
    }
}

function processRepliedMessage(repliedMessage, callbackToReturn) {
    if (!repliedMessage || !repliedMessage.messageMetadata) return;

    var replyThreadKey = repliedMessage.messageMetadata.threadKey || {};
    
    // Parse mentions for replied message
    var rmdata = [];
    if (repliedMessage.data && repliedMessage.data.prng) {
        try {
            rmdata = JSON.parse(repliedMessage.data.prng);
        } catch (e) {
            log.error("processRepliedMessage", "Error parsing mentions:", e);
        }
    }
    
    var rmentions = {};
    rmdata.forEach(function (u) {
        if (u.i && u.o !== undefined && u.l) {
            rmentions[u.i] = (repliedMessage.body || "").substring(u.o, u.o + u.l);
        }
    });

    callbackToReturn.messageReply = {
        threadID: (replyThreadKey.threadFbId || replyThreadKey.otherUserFbId || "").toString(),
        messageID: repliedMessage.messageMetadata.messageId,
        senderID: (repliedMessage.messageMetadata.actorFbId || "").toString(),
        attachments: [],
        args: (repliedMessage.body || "").trim().split(/\s+/),
        body: repliedMessage.body || "",
        isGroup: !!replyThreadKey.threadFbId,
        mentions: rmentions,
        timestamp: repliedMessage.messageMetadata.timestamp || Date.now(),
        participantIDs: (repliedMessage.participants || []).map(function (e) {
            return e ? e.toString() : "";
        })
    };

    // Format attachments for replied message
    if (repliedMessage.attachments && Array.isArray(repliedMessage.attachments)) {
        callbackToReturn.messageReply.attachments = repliedMessage.attachments.map(function (att) {
            try {
                if (att.mercuryJSON) {
                    var mercury = JSON.parse(att.mercuryJSON);
                    Object.assign(att, mercury);
                }
                return utils._formatAttachment(att);
            } catch (ex) {
                log.error("processRepliedMessage", "Error formatting attachment:", ex);
                return {
                    type: "unknown",
                    error: ex,
                    raw: att
                };
            }
        });
    }
}

function fetchMessageInfo(defaultFuncs, ctx, messageId, threadId) {
    var form = {
        "av": ctx.globalOptions.pageID || ctx.userID,
        "queries": JSON.stringify({
            "o0": {
                "doc_id": "2848441488556444",
                "query_params": {
                    "thread_and_message_id": {
                        "thread_id": threadId,
                        "message_id": messageId,
                    }
                }
            }
        })
    };

    return defaultFuncs
        .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
        .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
        .then(function (resData) {
            if (!resData || !Array.isArray(resData) || resData.length === 0) {
                throw new Error("Invalid response from server");
            }
            
            var lastRes = resData[resData.length - 1];
            if (lastRes.error_results > 0) {
                throw new Error("GraphQL error");
            }
            
            if (lastRes.successful_results === 0) {
                throw new Error("No successful results");
            }
            
            var fetchData = resData[0] && resData[0].o0 && resData[0].o0.data && resData[0].o0.data.message;
            if (!fetchData) {
                throw new Error("No message data found");
            }
            
            var mobj = {};
            if (fetchData.message && fetchData.message.ranges) {
                fetchData.message.ranges.forEach(function (range) {
                    if (range.entity && range.entity.id && range.offset !== undefined && range.length) {
                        mobj[range.entity.id] = (fetchData.message.text || "").substr(range.offset, range.length);
                    }
                });
            }
            
            return {
                threadID: threadId,
                messageID: fetchData.message_id,
                senderID: (fetchData.message_sender && fetchData.message_sender.id || "").toString(),
                attachments: (fetchData.message && fetchData.message.blob_attachment || []).map(function (att) {
                    try {
                        return utils._formatAttachment({ blob_attachment: att });
                    } catch (ex) {
                        return {
                            type: "unknown",
                            error: ex,
                            raw: att
                        };
                    }
                }),
                args: (fetchData.message && fetchData.message.text || "").trim().split(/\s+/) || [],
                body: fetchData.message && fetchData.message.text || "",
                isGroup: threadId !== (fetchData.message_sender && fetchData.message_sender.id || "").toString(),
                mentions: mobj,
                timestamp: parseInt(fetchData.timestamp_precise) || Date.now()
            };
        });
}

function handleForcedFetch(defaultFuncs, api, ctx, globalCallback, delta) {
    if (!delta.threadKey || !delta.messageId) return;
    
    var mid = delta.messageId;
    var tid = delta.threadKey.threadFbId;
    
    if (!mid || !tid) return;
    
    var form = {
        "av": ctx.globalOptions.pageID || ctx.userID,
        "queries": JSON.stringify({
            "o0": {
                "doc_id": "2848441488556444",
                "query_params": {
                    "thread_and_message_id": {
                        "thread_id": tid.toString(),
                        "message_id": mid,
                    }
                }
            }
        })
    };

    defaultFuncs
        .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
        .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
        .then(function (resData) {
            if (!resData || !Array.isArray(resData) || resData.length === 0) {
                throw new Error("Invalid response");
            }
            
            var lastRes = resData[resData.length - 1];
            if (lastRes.error_results > 0) {
                throw new Error("GraphQL error");
            }
            
            if (lastRes.successful_results === 0) {
                throw new Error("No successful results");
            }
            
            var fetchData = resData[0] && resData[0].o0 && resData[0].o0.data && resData[0].o0.data.message;
            if (!fetchData || typeof fetchData !== 'object') {
                return;
            }
            
            log.info("forcedFetch", fetchData.__typename);
            
            switch (fetchData.__typename) {
                case "ThreadImageMessage":
                    if (!(ctx.globalOptions.selfListen === false && 
                          fetchData.message_sender && 
                          fetchData.message_sender.id && 
                          fetchData.message_sender.id.toString() === ctx.userID) && 
                        ctx.loggedIn) {
                        globalCallback(null, {
                            type: "change_thread_image",
                            threadID: utils.formatID(tid.toString()),
                            snippet: fetchData.snippet || "",
                            timestamp: fetchData.timestamp_precise || Date.now(),
                            author: fetchData.message_sender && fetchData.message_sender.id,
                            image: {
                                attachmentID: fetchData.image_with_metadata && fetchData.image_with_metadata.legacy_attachment_id,
                                width: fetchData.image_with_metadata && 
                                       fetchData.image_with_metadata.original_dimensions && 
                                       fetchData.image_with_metadata.original_dimensions.x,
                                height: fetchData.image_with_metadata && 
                                        fetchData.image_with_metadata.original_dimensions && 
                                        fetchData.image_with_metadata.original_dimensions.y,
                                url: fetchData.image_with_metadata && 
                                     fetchData.image_with_metadata.preview && 
                                     fetchData.image_with_metadata.preview.uri
                            }
                        });
                    }
                    break;
                    
                case "UserMessage":
                    if (fetchData.extensible_attachment && fetchData.extensible_attachment.story_attachment) {
                        var attachment = fetchData.extensible_attachment.story_attachment;
                        var media = attachment.media || {};
                        var image = media.image || {};
                        
                        globalCallback(null, {
                            type: "message",
                            senderID: utils.formatID(fetchData.message_sender && fetchData.message_sender.id || ""),
                            body: fetchData.message && fetchData.message.text || "",
                            threadID: utils.formatID(tid.toString()),
                            messageID: fetchData.message_id,
                            attachments: [{
                                type: "share",
                                ID: fetchData.extensible_attachment.legacy_attachment_id,
                                url: attachment.url,
                                title: attachment.title_with_entities && attachment.title_with_entities.text,
                                description: attachment.description && attachment.description.text,
                                source: attachment.source,
                                image: image.uri,
                                width: image.width,
                                height: image.height,
                                playable: media.is_playable || false,
                                duration: media.playable_duration_in_ms || 0,
                                subattachments: fetchData.extensible_attachment.subattachments,
                                properties: attachment.properties,
                            }],
                            mentions: {},
                            timestamp: parseInt(fetchData.timestamp_precise) || Date.now(),
                            isGroup: !!(fetchData.message_sender && 
                                       fetchData.message_sender.id && 
                                       fetchData.message_sender.id.toString() !== tid.toString())
                        });
                    }
                    break;
            }
        })
        .catch(function (err) {
            log.error("forcedFetch", err);
        });
}

function finalizeMessageReply(ctx, api, globalCallback, message) {
    if (ctx.globalOptions.autoMarkDelivery) {
        markDelivery(ctx, api, message.threadID, message.messageID);
    }
    
    if (!(ctx.globalOptions.selfListen === false && message.senderID === ctx.userID)) {
        globalCallback(null, message);
    }
}

function markDelivery(ctx, api, threadID, messageID) {
    if (threadID && messageID) {
        api.markAsDelivered(threadID, messageID, function (err) {
            if (err) {
                log.error("markAsDelivered", err);
            } else if (ctx.globalOptions.autoMarkRead) {
                api.markAsRead(threadID, function (err) {
                    if (err) {
                        log.error("markAsRead", err);
                    }
                });
            }
        });
    }
}

module.exports = function (defaultFuncs, api, ctx) {
    var globalCallback = identity;
    
    getSeqID = function getSeqID() {
        ctx.t_mqttCalled = false;
        
        var form = {
            "av": ctx.globalOptions.pageID || ctx.userID,
            "queries": JSON.stringify({
                "o0": {
                    "doc_id": "3336396659757871",
                    "query_params": {
                        "limit": 1,
                        "before": null,
                        "tags": ["INBOX"],
                        "includeDeliveryReceipts": false,
                        "includeSeqID": true
                    }
                }
            })
        };
        
        defaultFuncs
            .post("https://www.facebook.com/api/graphqlbatch/", ctx.jar, form)
            .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
            .then(function (resData) {
                if (!Array.isArray(resData)) {
                    throw { error: "Not logged in", res: resData };
                }
                
                var lastRes = resData[resData.length - 1];
                if (lastRes.error_results > 0) {
                    throw resData[0].o0.errors;
                }
                
                if (lastRes.successful_results === 0) {
                    throw { error: "getSeqId: there was no successful_results", res: resData };
                }
                
                var threads = resData[0] && resData[0].o0 && resData[0].o0.data && 
                              resData[0].o0.data.viewer && resData[0].o0.data.viewer.message_threads;
                
                if (threads && threads.sync_sequence_id) {
                    ctx.lastSeqId = threads.sync_sequence_id;
                    listenMqtt(defaultFuncs, api, ctx, globalCallback);
                } else {
                    throw { error: "getSeqId: no sync_sequence_id found.", res: resData };
                }
            })
            .catch(function (err) {
                log.error("getSeqId", err);
                if (typeof err === "object" && err.error === "Not logged in") {
                    ctx.loggedIn = false;
                }
                globalCallback(err);
            });
    };

    return function (callback) {
        class MessageEmitter extends EventEmitter {
            stopListening(callback) {
                callback = callback || function () { };
                globalCallback = identity;
                
                if (ctx.mqttClient) {
                    try {
                        topics.forEach(function (topic) {
                            ctx.mqttClient.unsubscribe(topic);
                        });
                        ctx.mqttClient.publish("/browser_close", "{}");
                        ctx.mqttClient.end(false, function () {
                            callback();
                            ctx.mqttClient = undefined;
                        });
                    } catch (err) {
                        log.error("stopListening", err);
                        callback(err);
                    }
                } else {
                    callback();
                }
            }
        }

        var msgEmitter = new MessageEmitter();
        
        globalCallback = callback || function (error, message) {
            if (error) {
                return msgEmitter.emit("error", error);
            }
            msgEmitter.emit("message", message);
        };

        // Reset state
        if (!ctx.firstListen) {
            ctx.lastSeqId = null;
        }
        ctx.syncToken = undefined;
        ctx.t_mqttCalled = false;

        if (!ctx.firstListen || !ctx.lastSeqId) {
            getSeqID();
        } else {
            listenMqtt(defaultFuncs, api, ctx, globalCallback);
        }
        
        ctx.firstListen = false;
        return msgEmitter;
    };
};