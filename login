"use strict";
const defaultRequire = require;
const SHOW_TITLE_LOGO = true;

function decode(text) {
	text = Buffer.from(text, 'hex').toString('utf-8');
	text = Buffer.from(text, 'hex').toString('utf-8');
	text = Buffer.from(text, 'base64').toString('utf-8');
	return text;
}

const gradient = defaultRequire("gradient-string");
const axios = defaultRequire("axios");
const path = defaultRequire("path");
const readline = defaultRequire("readline");
const fs = defaultRequire("fs-extra");
const toptp = defaultRequire("totp-generator");
const login = defaultRequire("mikasa-fca"); 
const qr = new (defaultRequire("qrcode-reader"));
const Canvas = defaultRequire("canvas");

async function getName(userID) {
	try {
		const user = await axios.post(`https://www.facebook.com/api/graphql/?q=${`node(${userID}){name}`}`);
		return user.data[userID].name;
	}
	catch (error) {
		return null;
	}
}

function compareVersion(version1, version2) {
	const v1 = version1.split(".");
	const v2 = version2.split(".");
	for (let i = 0; i < 3; i++) {
		if (parseInt(v1[i]) > parseInt(v2[i]))
			return 1;
		if (parseInt(v1[i]) < parseInt(v2[i]))
			return -1;
	}
	return 0;
}

const { writeFileSync, readFileSync, existsSync, watch } = require("fs-extra");
const handlerWhenListenHasError = require("./handlerWhenListenHasError.js");
const checkLiveCookie = require("./checkLiveCookie.js");
const { callbackListenTime, storage5Message } = global.GoatBot;
const { log, logColor, getPrefix, createOraDots, jsonStringifyColor, getText, convertTime, colors, randomString } = global.utils;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const currentVersion = require(`${process.cwd()}/package.json`).version;

function centerText(text, length) {
	const width = process.stdout.columns;
	const leftPadding = Math.floor((width - (length || text.length)) / 2);
	const rightPadding = width - leftPadding - (length || text.length);
	const paddedString = ' '.repeat(leftPadding > 0 ? leftPadding : 0) + text + ' '.repeat(rightPadding > 0 ? rightPadding : 0);
	console.log(paddedString);
}

const titles = [
	[
		"███╗   ███╗██╗██╗  ██╗ █████╗ ███████╗ █████╗",
		"████╗ ████║██║██║ ██╔╝██╔══██╗██╔════╝██╔══██╗",
		"██╔████╔██║██║█████╔╝ ███████║███████╗███████║",
		"██║╚██╔╝██║██║██╔═██╗ ██╔══██║╚════██║██╔══██║",
		"██║ ╚═╝ ██║██║██║  ██╗██║  ██║███████║██║  ██║",
		"╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝"
	],
	[
		"M I K A S A   B O T   V 2"
	],
	[
		"MIKASA BOT"
	]
];
const maxWidth = process.stdout.columns;
const title = maxWidth > 58 ?
	titles[0] :
	maxWidth > 36 ?
		titles[1] :
		titles[2];

if (SHOW_TITLE_LOGO) {
	console.log(gradient("#f5af19", "#f12711")("─────────────────────────────────────────────"));
	console.log();
	for (const text of title) {
		const textColor = gradient("#FA8BFF", "#2BD2FF", "#2BFF88")(text);
		centerText(textColor, text.length);
	}
	let subTitle = `Mikasa Bot V2@${currentVersion} - Facebook Chat Bot`;
	const subTitleArray = [];
	if (subTitle.length > maxWidth) {
		while (subTitle.length > maxWidth) {
			let lastSpace = subTitle.slice(0, maxWidth).lastIndexOf(' ');
			lastSpace = lastSpace == -1 ? maxWidth : lastSpace;
			subTitleArray.push(subTitle.slice(0, lastSpace).trim());
			subTitle = subTitle.slice(lastSpace).trim();
		}
		subTitle ? subTitleArray.push(subTitle) : '';
	}
	else {
		subTitleArray.push(subTitle);
	}
	const author = ("Created by DUR4NTO");
	const srcUrl = ("FCA: Custom Encrypted Support");
	for (const t of subTitleArray) {
		const textColor2 = gradient("#9F98E8", "#AFF6CF")(t);
		centerText(textColor2, t.length);
	}
	centerText(gradient("#9F98E8", "#AFF6CF")(author), author.length);
	centerText(gradient("#9F98E8", "#AFF6CF")(srcUrl), srcUrl.length);
}

let widthConsole = process.stdout.columns;
if (widthConsole > 50)
	widthConsole = 50;

function createLine(content, isMaxWidth = false) {
	if (!content)
		return Array(isMaxWidth ? process.stdout.columns : widthConsole).fill("─").join("");
	else {
		content = ` ${content.trim()} `;
		const lengthContent = content.length;
		const lengthLine = isMaxWidth ? process.stdout.columns - lengthContent : widthConsole - lengthContent;
		let left = Math.floor(lengthLine / 2);
		if (left < 0 || isNaN(left))
			left = 0;
		const lineOne = Array(left).fill("─").join("");
		return lineOne + content + lineOne;
	}
}

const character = createLine();

const clearLines = (n) => {
	for (let i = 0; i < n; i++) {
		const y = i === 0 ? null : -1;
		process.stdout.moveCursor(0, y);
		process.stdout.clearLine(1);
	}
	process.stdout.cursorTo(0);
	process.stdout.write('');
};

async function input(prompt, isPassword = false) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	if (isPassword)
		rl.input.on("keypress", function () {
			const len = rl.line.length;
			readline.moveCursor(rl.output, -len, 0);
			readline.clearLine(rl.output, 1);
			for (let i = 0; i < len; i++) {
				rl.output.write("*");
			}
		});

	return new Promise(resolve => rl.question(prompt, ans => {
		rl.close();
		resolve(ans);
	}));
}

qr.readQrCode = async function (filePath) {
	const image = await Canvas.loadImage(filePath);
	const canvas = Canvas.createCanvas(image.width, image.height);
	const ctx = canvas.getContext("2d");
	ctx.drawImage(image, 0, 0);
	const data = ctx.getImageData(0, 0, image.width, image.height);
	let value;
	qr.callback = function (error, result) {
		if (error)
			throw error;
		value = result;
	};
	qr.decode(data);
	return value.result;
};

const { dirAccount } = global.client;
const { facebookAccount } = global.GoatBot.config;

function responseUptimeSuccess(req, res) {
	res.type('json').send({
		status: "success",
		uptime: process.uptime(),
		unit: "seconds"
	});
}

function responseUptimeError(req, res) {
	res.status(500).type('json').send({
		status: "error",
		uptime: process.uptime(),
		statusAccountBot: global.statusAccountBot
	});
}

function checkAndTrimString(string) {
	if (typeof string == "string")
		return string.trim();
	return string;
}

function filterKeysAppState(appState) {
	return appState.filter(item => ["c_user", "xs", "datr", "fr", "sb", "i_user"].includes(item.key));
}

global.responseUptimeCurrent = responseUptimeSuccess;
global.responseUptimeSuccess = responseUptimeSuccess;
global.responseUptimeError = responseUptimeError;

global.statusAccountBot = 'good';
let changeFbStateByCode = false;
let latestChangeContentAccount = fs.statSync(dirAccount).mtimeMs;
let dashBoardIsRunning = false;

// SAFE STOP HELPER (This fixes your error)
function stopSpin(s) {
	if (s && typeof s._stop === 'function') s._stop();
}

async function getAppStateFromEmail(spin = { _start: () => { }, _stop: () => { } }, facebookAccount) {
	const { email, password, userAgent, proxy } = facebookAccount;
	const getFbstate = require("./getFbstate1.js");
	let code2FATemp;
	let appState;
	try {
		try {
			appState = await getFbstate(checkAndTrimString(email), checkAndTrimString(password), userAgent, proxy);
			stopSpin(spin);
		}
		catch (err) {
			if (err.continue) {
				let tryNumber = 0;
				let isExit = false;

				await (async function submitCode(message) {
					if (message && isExit) {
						stopSpin(spin);
						log.error("LOGIN FACEBOOK", message);
						process.exit();
					}

					if (message) {
						stopSpin(spin);
						log.warn("LOGIN FACEBOOK", message);
					}

					if (facebookAccount["2FASecret"] && tryNumber == 0) {
						switch (['.png', '.jpg', '.jpeg'].some(i => facebookAccount["2FASecret"].endsWith(i))) {
							case true:
								code2FATemp = (await qr.readQrCode(`${process.cwd()}/${facebookAccount["2FASecret"]}`)).replace(/.*secret=(.*)&digits.*/g, '$1');
								break;
							case false:
								code2FATemp = facebookAccount["2FASecret"];
								break;
						}
					}
					else {
						stopSpin(spin);
						code2FATemp = await input("> Enter 2FA code or secret: ");
						readline.moveCursor(process.stderr, 0, -1);
						readline.clearScreenDown(process.stderr);
					}

					const code2FA = isNaN(code2FATemp) ?
						toptp(
							code2FATemp.normalize("NFD")
								.toLowerCase()
								.replace(/[\u0300-\u036f]/g, "")
								.replace(/[đ|Đ]/g, (x) => x == "đ" ? "d" : "D")
								.replace(/\(|\)|\,/g, "")
								.replace(/ /g, "")
						) :
						code2FATemp;
					spin._start();
					try {
						appState = JSON.parse(JSON.stringify(await err.continue(code2FA)));
						appState = appState.map(item => ({
							key: item.key,
							value: item.value,
							domain: item.domain,
							path: item.path,
							hostOnly: item.hostOnly,
							creation: item.creation,
							lastAccessed: item.lastAccessed
						})).filter(item => item.key);
						stopSpin(spin);
					}
					catch (err) {
						tryNumber++;
						if (!err.continue)
							isExit = true;
						await submitCode(err.message);
					}
				})(err.message);
			}
			else
				throw err;
		}
	}
	catch (err) {
		const loginMbasic = require("./loginMbasic.js");
		if (facebookAccount["2FASecret"]) {
			switch (['.png', '.jpg', '.jpeg'].some(i => facebookAccount["2FASecret"].endsWith(i))) {
				case true:
					code2FATemp = (await qr.readQrCode(`${process.cwd()}/${facebookAccount["2FASecret"]}`)).replace(/.*secret=(.*)&digits.*/g, '$1');
					break;
				case false:
					code2FATemp = facebookAccount["2FASecret"];
					break;
			}
		}

		appState = await loginMbasic({
			email,
			pass: password,
			twoFactorSecretOrCode: code2FATemp,
			userAgent,
			proxy
		});

		appState = appState.map(item => {
			item.key = item.name;
			delete item.name;
			return item;
		});
		appState = filterKeysAppState(appState);
	}

	global.GoatBot.config.facebookAccount['2FASecret'] = code2FATemp || "";
	writeFileSync(global.client.dirConfig, JSON.stringify(global.GoatBot.config, null, 2));
	return appState;
}

function isNetScapeCookie(cookie) {
	if (typeof cookie !== 'string')
		return false;
	return /(.+)\t(1|TRUE|true)\t([\w\/.-]*)\t(1|TRUE|true)\t\d+\t([\w-]+)\t(.+)/i.test(cookie);
}

function netScapeToCookies(cookieData) {
	const cookies = [];
	const lines = cookieData.split('\n');
	lines.forEach((line) => {
		if (line.trim().startsWith('#')) {
			return;
		}
		const fields = line.split('\t').map((field) => field.trim()).filter((field) => field.length > 0);
		if (fields.length < 7) {
			return;
		}
		const cookie = {
			key: fields[5],
			value: fields[6],
			domain: fields[0],
			path: fields[2],
			hostOnly: fields[1] === 'TRUE',
			creation: new Date(fields[4] * 1000).toISOString(),
			lastAccessed: new Date().toISOString()
		};
		cookies.push(cookie);
	});
	return cookies;
}

function pushI_user(appState, value) {
	appState.push({
		key: "i_user",
		value: value || facebookAccount.i_user,
		domain: "facebook.com",
		path: "/",
		hostOnly: false,
		creation: new Date().toISOString(),
		lastAccessed: new Date().toISOString()
	});
	return appState;
}

let spin;
async function getAppStateToLogin(loginWithEmail) {
	let appState = [];
	if (loginWithEmail)
		return await getAppStateFromEmail(undefined, facebookAccount);
	if (!existsSync(dirAccount))
		return log.error("LOGIN FACEBOOK", "Account file not found: " + colors.green(dirAccount));
	const accountText = readFileSync(dirAccount, "utf8");

	try {
		const splitAccountText = accountText.replace(/\|/g, '\n').split('\n').map(i => i.trim()).filter(i => i);
		if (accountText.startsWith('EAAAA')) {
			try {
				spin = createOraDots("Logging in with token...");
				spin._start();
				appState = await require('./getFbstate.js')(accountText);
			}
			catch (err) {
				err.name = "TOKEN_ERROR";
				throw err;
			}
		}
		else {
			if (accountText.match(/^(?:\s*\w+\s*=\s*[^;]*;?)+/)) {
				spin = createOraDots("Logging in with cookie string...");
				spin._start();
				appState = accountText.split(';')
					.map(i => {
						const [key, value] = i.split('=');
						return {
							key: (key || "").trim(),
							value: (value || "").trim(),
							domain: "facebook.com",
							path: "/",
							hostOnly: true,
							creation: new Date().toISOString(),
							lastAccessed: new Date().toISOString()
						};
					})
					.filter(i => i.key && i.value && i.key != "x-referer");
			}
			else if (isNetScapeCookie(accountText)) {
				spin = createOraDots("Logging in with cookie...");
				spin._start();
				appState = netScapeToCookies(accountText);
			}
			else if (
				(splitAccountText.length == 2 || splitAccountText.length == 3) &&
				!splitAccountText.slice(0, 2).map(i => i.trim()).some(i => i.includes(' '))
			) {
				global.GoatBot.config.facebookAccount.email = splitAccountText[0];
				global.GoatBot.config.facebookAccount.password = splitAccountText[1];
				if (splitAccountText[2]) {
					const code2FATemp = splitAccountText[2].replace(/ /g, "");
					global.GoatBot.config.facebookAccount['2FASecret'] = code2FATemp;
				}
				writeFileSync(global.client.dirConfig, JSON.stringify(global.GoatBot.config, null, 2));
			}
			else {
				try {
					spin = createOraDots("Logging in with cookie array...");
					spin._start();
					appState = JSON.parse(accountText);
				}
				catch (err) {
					const error = new Error(`${path.basename(dirAccount)} is invalid`);
					error.name = "ACCOUNT_ERROR";
					throw error;
				}
				if (appState.some(i => i.name))
					appState = appState.map(i => {
						i.key = i.name;
						delete i.name;
						return i;
					});
				else if (!appState.some(i => i.key)) {
					const error = new Error(`${path.basename(dirAccount)} is invalid`);
					error.name = "ACCOUNT_ERROR";
					throw error;
				}
				appState = appState
					.map(item => ({
						...item,
						domain: "facebook.com",
						path: "/",
						hostOnly: false,
						creation: new Date().toISOString(),
						lastAccessed: new Date().toISOString()
					}))
					.filter(i => i.key && i.value && i.key != "x-referer");
			}
		}
	}
	catch (err) {
		stopSpin(spin);
		let {
			email,
			password
		} = facebookAccount;
		if (err.name === "TOKEN_ERROR")
			log.err("LOGIN FACEBOOK", "Token error in file: " + colors.green(dirAccount));

		if (!email || !password) {
			log.warn("LOGIN FACEBOOK", "Cannot find account");
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout
			});
			const options = [
				"Login with email/password",
				"Login with token",
				"Login with cookie string",
				"Login with cookie array"
			];
			let currentOption = 0;
			await new Promise((resolve) => {
				const character = '>';
				function showOptions() {
					rl.output.write(`\r${options.map((option, index) => index === currentOption ? colors.blueBright(`${character} (${index + 1}) ${option}`) : `  (${index + 1}) ${option}`).join('\n')}\u001B`);
					rl.write('\u001B[?25l');
				}
				rl.input.on('keypress', (_, key) => {
					if (key.name === 'up') {
						currentOption = (currentOption - 1 + options.length) % options.length;
					}
					else if (key.name === 'down') {
						currentOption = (currentOption + 1) % options.length;
					}
					else if (!isNaN(key.name)) {
						const number = parseInt(key.name);
						if (number >= 0 && number <= options.length)
							currentOption = number - 1;
						process.stdout.write('\x1b[1D');
					}
					else if (key.name === 'enter' || key.name === 'return') {
						rl.input.removeAllListeners('keypress');
						rl.close();
						clearLines(options.length + 1);
						showOptions();
						resolve();
					}
					else {
						process.stdout.write('\x1b[1D');
					}

					clearLines(options.length);
					showOptions();
				});
				showOptions();
			});

			rl.write('\u001B[?25h\n');
			clearLines(options.length + 1);
			log.info("LOGIN FACEBOOK", "Login with: " + options[currentOption]);

			if (currentOption == 0) {
				email = await input("Email: ");
				password = await input("Password: ", true);
				const twoFactorAuth = await input("2FA (optional): ");
				facebookAccount.email = email || '';
				facebookAccount.password = password || '';
				facebookAccount['2FASecret'] = twoFactorAuth || '';
				writeFileSync(global.client.dirConfig, JSON.stringify(global.GoatBot.config, null, 2));
			}
			else if (currentOption == 1) {
				const token = await input("Enter token: ");
				writeFileSync(global.client.dirAccount, token);
			}
			else if (currentOption == 2) {
				const cookie = await input("Enter cookie string: ");
				writeFileSync(global.client.dirAccount, cookie);
			}
			else {
				const cookie = await input("Enter cookie array: ");
				writeFileSync(global.client.dirAccount, JSON.stringify(JSON.parse(cookie), null, 2));
			}
			return await getAppStateToLogin();
		}

		log.info("LOGIN FACEBOOK", "Login with email/password");
		log.info("ACCOUNT INFO", `Email: ${facebookAccount.email}`);
		spin = createOraDots("Logging in...");
		spin._start();

		try {
			appState = await getAppStateFromEmail(spin, facebookAccount);
			stopSpin(spin);
		}
		catch (err) {
			stopSpin(spin);
			log.err("LOGIN FACEBOOK", "Login error: " + err.message);
			process.exit();
		}
	}
	return appState;
}

function stopListening(keyListen) {
	keyListen = keyListen || Object.keys(callbackListenTime).pop();
	return new Promise((resolve) => {
		global.GoatBot.fcaApi.stopListening?.(() => {
			if (callbackListenTime[keyListen]) {
				callbackListenTime[keyListen] = () => { };
			}
			resolve();
		}) || resolve();
	});
}

async function startBot(loginWithEmail) {
	console.log(colors.hex("#f5ab00")(createLine("START LOGGING IN", true)));
	const currentVersion = require("../../package.json").version;

	const tooOldVersion = (await axios.get("https://raw.githubusercontent.com/ntkhang03/Goat-Bot-V2-Storage/main/tooOldVersions.txt")).data || "0.0.0";
	if ([-1, 0].includes(compareVersion(currentVersion, tooOldVersion))) {
		log.err("VERSION", "Version too old. Please update.");
		process.exit();
	}

	if (global.GoatBot.Listening)
		await stopListening();

	log.info("LOGIN FACEBOOK", "Currently logged in...");

	let appState = await getAppStateToLogin(loginWithEmail);
	changeFbStateByCode = true;
	appState = filterKeysAppState(appState);
	writeFileSync(dirAccount, JSON.stringify(appState, null, 2));
	setTimeout(() => changeFbStateByCode = false, 1000);

	(function loginBot(appState) {
		global.GoatBot.commands = new Map();
		global.GoatBot.eventCommands = new Map();
		global.GoatBot.aliases = new Map();
		global.GoatBot.onChat = [];
		global.GoatBot.onEvent = [];
		global.GoatBot.onReply = new Map();
		global.GoatBot.onReaction = new Map();
		clearInterval(global.intervalRestartListenMqtt);
		delete global.intervalRestartListenMqtt;

		if (facebookAccount.i_user)
			pushI_user(appState, facebookAccount.i_user);

		let isSendNotiErrorMessage = false;

		const accountPath = global.client.dirAccount;
		if (fs.existsSync(accountPath)) {
			try {
				const accountData = fs.readFileSync(accountPath, "utf8");
				appState = JSON.parse(accountData);
			}
			catch (err) {
				appState = [];
			}
		}
		else {
			appState = [];
		}

		login({ appState }, global.GoatBot.config.optionsFca, async function (error, api) {
			if (!isNaN(facebookAccount.intervalGetNewCookie) && facebookAccount.intervalGetNewCookie > 0)
				if (facebookAccount.email && facebookAccount.password) {
					stopSpin(spin);
					log.info("REFRESH COOKIE", "Refresh cookie after " + convertTime(facebookAccount.intervalGetNewCookie * 60 * 1000, true));
					setTimeout(async function refreshCookie() {
						try {
							log.info("REFRESH COOKIE", "Refresh cookie...");
							const appState = await getAppStateFromEmail(undefined, facebookAccount);
							if (facebookAccount.i_user)
								pushI_user(appState, facebookAccount.i_user);
							changeFbStateByCode = true;
							writeFileSync(dirAccount, JSON.stringify(filterKeysAppState(appState), null, 2));
							setTimeout(() => changeFbStateByCode = false, 1000);
							log.info("REFRESH COOKIE", "Refresh cookie success");
							return startBot(appState);
						}
						catch (err) {
							log.err("REFRESH COOKIE", "Refresh cookie error: " + err.message);
							setTimeout(refreshCookie, facebookAccount.intervalGetNewCookie * 60 * 1000);
						}
					}, facebookAccount.intervalGetNewCookie * 60 * 1000);
				}
				else {
					stopSpin(spin);
					log.warn("REFRESH COOKIE", "Can't refresh cookie");
				}
			stopSpin(spin);

			if (error) {
				log.err("LOGIN FACEBOOK", "Login error: " + JSON.stringify(error));
				global.statusAccountBot = 'can\'t login';
				if (facebookAccount.email && facebookAccount.password) {
					return startBot(true);
				}
				if (global.GoatBot.config.dashBoard?.enable == true) {
					try {
						await require("../../dashboard/app.js")(null);
						log.info("DASHBOARD", "Dashboard opened");
					}
					catch (err) {
						log.err("DASHBOARD", "Dashboard error: " + err);
					}
					return;
				}
				else {
					process.exit();
				}
			}

			global.GoatBot.fcaApi = api;
			global.GoatBot.botID = api.getCurrentUserID ? api.getCurrentUserID() : (api.getCurrentUserId ? api.getCurrentUserId() : (api.getAppState ? api.getAppState().find(i => i.key === "c_user")?.value : null));
			log.info("LOGIN FACEBOOK", "Login success");
			let hasBanned = false;
			global.botID = api.getCurrentUserID ? api.getCurrentUserID() : (api.getCurrentUserId ? api.getCurrentUserId() : (api.getAppState ? api.getAppState().find(i => i.key === "c_user")?.value : null));
			logColor("#f5ab00", createLine("BOT INFO"));
			log.info("NODE VERSION", process.version);
			log.info("PROJECT VERSION", currentVersion);
			log.info("BOT ID", `${global.botID} - ${await getName(global.botID)}`);
			log.info("PREFIX", global.GoatBot.config.prefix);
			log.info("ADMIN PREFIX", global.GoatBot.config.adminPrefix);
			log.info("LANGUAGE", global.GoatBot.config.language);
			log.info("BOT NICK NAME", global.GoatBot.config.nickNameBot || "MIKASA BOT");

			let dataGban;
			try {
				const item = await axios.get("https://raw.githubusercontent.com/ntkhang03/Goat-Bot-V2-Gban/master/gban.json");
				dataGban = item.data;
				const botID = api.getCurrentUserID ? api.getCurrentUserID() : (api.getCurrentUserId ? api.getCurrentUserId() : (api.getAppState ? api.getAppState().find(i => i.key === "c_user")?.value : null));
				if (dataGban.hasOwnProperty(botID)) {
					if (!dataGban[botID].toDate) {
						log.err('GBAN', "You are banned: " + dataGban[botID].reason);
						hasBanned = true;
					}
					else {
						const currentDate = (new Date((await axios.get("http://worldtimeapi.org/api/timezone/UTC")).data.utc_datetime)).getTime();
						if (currentDate < (new Date(dataGban[botID].date)).getTime()) {
							log.err('GBAN', "You are banned: " + dataGban[botID].reason);
							hasBanned = true;
						}
					}
				}
				for (const idad of global.GoatBot.config.adminBot) {
					if (dataGban.hasOwnProperty(idad)) {
						if (!dataGban[idad].toDate) {
							log.err('GBAN', "Admin banned: " + dataGban[idad].reason);
							hasBanned = true;
						}
						else {
							const currentDate = (new Date((await axios.get("http://worldtimeapi.org/api/timezone/UTC")).data.utc_datetime)).getTime();
							if (currentDate < (new Date(dataGban[idad].date)).getTime()) {
								log.err('GBAN', "Admin banned: " + dataGban[idad].reason);
								hasBanned = true;
							}
						}
					}
				}
				if (hasBanned == true)
					process.exit();
			}
			catch (e) {
				log.err('GBAN', "Check gban error");
				process.exit();
			}

			let notification;
			try {
				const getNoti = await axios.get("https://raw.githubusercontent.com/ntkhang03/Goat-Bot-V2-Gban/master/notification.txt");
				notification = getNoti.data;
			}
			catch (err) {
				log.err("ERROR", "Can't get notifications");
			}

			if (global.GoatBot.config.autoRefreshFbstate == true) {
				changeFbStateByCode = true;
				try {
					writeFileSync(dirAccount, JSON.stringify(filterKeysAppState(api.getAppState()), null, 2));
					log.info("REFRESH FBSTATE", "Fbstate refreshed: " + path.basename(dirAccount));
				}
				catch (err) {
					log.warn("REFRESH FBSTATE", "Refresh fbstate error: " + err);
				}
				setTimeout(() => changeFbStateByCode = false, 1000);
			}

			if (hasBanned == true) {
				log.err('GBAN', "You are banned");
				process.exit();
			}

			const { threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData, sequelize } = await require("./loadData.js")(api, createLine);
			await require("../custom.js")({ api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData, getText });
			await require("./loadScripts.js")(api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData, createLine);

			if (global.GoatBot.config.dashBoard?.enable == true && dashBoardIsRunning == false) {
				logColor('#f5ab00', createLine('DASHBOARD'));
				try {
					await require("../../dashboard/app.js")(api);
					log.info("DASHBOARD", "Dashboard opened");
					dashBoardIsRunning = true;
				}
				catch (err) {
					log.err("DASHBOARD", "Dashboard error: " + err);
				}
			}

			logColor('#f5ab00', character);
			let i = 0;
			const adminBot = global.GoatBot.config.adminBot
				.filter(item => !isNaN(item))
				.map(item => item = item.toString());
			for (const uid of adminBot) {
				try {
					const userName = await usersData.getName(uid);
					log.master("ADMINBOT", `[${++i}] ${uid} | ${userName}`);
				}
				catch (e) {
					log.master("ADMINBOT", `[${++i}] ${uid}`);
				}
			}
			log.master("NOTIFICATION", (notification || "").trim());
			log.master("SUCCESS", "Bot running");
			log.master("LOAD TIME", `${convertTime(Date.now() - global.GoatBot.startTime)}`);
			logColor("#f5ab00", createLine("COPYRIGHT"));
			console.log(`\x1b[1m\x1b[33mCOPYRIGHT:\x1b[0m\x1b[1m\x1b[37m \x1b[0m\x1b[1m\x1b[36mProject Mikasa Bot created by DUR4NTO, please do not sell this source code or claim it as your own. Thank you!\x1b[0m`);
			logColor("#f5ab00", character);
			global.GoatBot.config.adminBot = adminBot;
			writeFileSync(global.client.dirConfig, JSON.stringify(global.GoatBot.config, null, 2));
			writeFileSync(global.client.dirConfigCommands, JSON.stringify(global.GoatBot.configCommands, null, 2));

			const { restartListenMqtt } = global.GoatBot.config;
			let intervalCheckLiveCookieAndRelogin = false;

			async function callBackListen(error, event) {
				if (error) {
					global.responseUptimeCurrent = responseUptimeError;
					if (
						error.error == "Not logged in" ||
						error.error == "Not logged in." ||
						error.error == "Connection refused: Server unavailable"
					) {
						log.err("NOT LOGGED IN", "Not logged in: " + error);
						global.responseUptimeCurrent = responseUptimeError;
						global.statusAccountBot = 'can\'t login';
						if (!isSendNotiErrorMessage) {
							await handlerWhenListenHasError({ api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData, error });
							isSendNotiErrorMessage = true;
						}

						if (global.GoatBot.config.autoRestartWhenListenMqttError)
							process.exit(2);
						else {
							const keyListen = Object.keys(callbackListenTime).pop();
							if (callbackListenTime[keyListen])
								callbackListenTime[keyListen] = () => { };
							const cookieString = appState.map(i => i.key + "=" + i.value).join("; ");

							let times = 5;

							const spin = createOraDots("Retry check live cookie in " + times + " seconds...");
							const countTimes = setInterval(() => {
								times--;
								if (times == 0)
									times = 5;
								spin.text = "Retry check live cookie in " + times + " seconds...";
							}, 1000);

							if (intervalCheckLiveCookieAndRelogin == false) {
								intervalCheckLiveCookieAndRelogin = true;
								const interval = setInterval(async () => {
									const cookieIsLive = await checkLiveCookie(cookieString, facebookAccount.userAgent);
									if (cookieIsLive) {
										clearInterval(interval);
										clearInterval(countTimes);
										intervalCheckLiveCookieAndRelogin = false;
										const keyListen = Date.now();
										isSendNotiErrorMessage = false;
										global.GoatBot.Listening = api.listenMqtt(createCallBackListen(keyListen));
									}
								}, 5000);
							}
						}
						return;
					}
					else if (error == "Connection closed." || error == "Connection closed by user.") {
						return;
					}
					else {
						await handlerWhenListenHasError({ api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData, error });
						return log.err("LISTEN_MQTT", "Callback error: " + error);
					}
				}
				global.responseUptimeCurrent = responseUptimeSuccess;
				global.statusAccountBot = 'good';
				const configLog = global.GoatBot.config.logEvents;
				if (isSendNotiErrorMessage == true)
					isSendNotiErrorMessage = false;

				if (event.type !== "message_reaction") {
					if (
						global.GoatBot.config.whiteListMode?.enable == true
						&& global.GoatBot.config.whiteListModeThread?.enable == true
						&& !global.GoatBot.config.adminBot.includes(event.senderID)
					) {
						if (
							!global.GoatBot.config.whiteListMode.whiteListIds.includes(event.senderID)
							&& !global.GoatBot.config.whiteListModeThread.whiteListThreadIds.includes(event.threadID)
							&& !global.GoatBot.config.adminBot.includes(event.senderID)
						)
							return;
					}
					else if (
						global.GoatBot.config.whiteListMode?.enable == true
						&& !global.GoatBot.config.whiteListMode.whiteListIds.includes(event.senderID)
						&& !global.GoatBot.config.adminBot.includes(event.senderID)
					)
						return;
					else if (
						global.GoatBot.config.whiteListModeThread?.enable == true
						&& !global.GoatBot.config.whiteListModeThread.whiteListThreadIds.includes(event.threadID)
						&& !global.GoatBot.config.adminBot.includes(event.senderID)
					)
						return;
				}

				if (event.messageID && event.type == "message") {
					if (storage5Message.includes(event.messageID))
						Object.keys(callbackListenTime).slice(0, -1).forEach(key => {
							callbackListenTime[key] = () => { };
						});
					else
						storage5Message.push(event.messageID);
					if (storage5Message.length > 5)
						storage5Message.shift();
				}

				if (configLog.disableAll === false && configLog[event.type] !== false) {
					const participantIDs_ = [...event.participantIDs || []];
					if (event.participantIDs)
						event.participantIDs = 'Array(' + event.participantIDs.length + ')';

					console.log(colors.green((event.type || "").toUpperCase() + ":"), jsonStringifyColor(event, null, 2));

					if (event.participantIDs)
						event.participantIDs = participantIDs_;
				}

				if ((event.senderID && dataGban[event.senderID] || event.userID && dataGban[event.userID])) {
					if (event.body && event.threadID) {
						const prefix = getPrefix(event.threadID);
						if (event.body.startsWith(prefix))
							return api.sendMessage("You are banned", event.threadID);
						return;
					}
					else
						return;
				}

				const handlerAction = require("../handler/handlerAction.js")(api, threadModel, userModel, dashBoardModel, globalModel, usersData, threadsData, dashBoardData, globalData);

				if (hasBanned === false)
					handlerAction(event);
				else
					return log.err('GBAN', "You are banned");
			}

			function createCallBackListen(key) {
				key = randomString(10) + (key || Date.now());
				callbackListenTime[key] = callBackListen;
				return function (error, event) {
					callbackListenTime[key](error, event);
				};
			}

			await stopListening();
			global.GoatBot.Listening = api.listenMqtt(createCallBackListen());
			global.GoatBot.callBackListen = callBackListen;

			if (global.GoatBot.config.serverUptime?.enable == true && !global.GoatBot.config.dashBoard?.enable && !global.serverUptimeRunning) {
				const http = require('http');
				const express = require('express');
				const app = express();
				const server = http.createServer(app);
				const { data: html } = await axios.get("https://raw.githubusercontent.com/ntkhang03/resources-goat-bot/master/homepage/home.html");
				const PORT = global.GoatBot.config.dashBoard?.port || (!isNaN(global.GoatBot.config.serverUptime.port) && global.GoatBot.config.serverUptime.port) || 3001;
				app.get('/', (req, res) => res.send(html));
				app.get('/uptime', global.responseUptimeCurrent);
				let nameUpTime;
				try {
					nameUpTime = `https://${process.env.REPL_OWNER ?
						`${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` :
						process.env.API_SERVER_EXTERNAL == "https://api.glitch.com" ?
							`${process.env.PROJECT_DOMAIN}.glitch.me` :
							`localhost:${PORT}`}`;
					nameUpTime.includes('localhost') && (nameUpTime = nameUpTime.replace('https', 'http'));
					await server.listen(PORT);
					log.info("UPTIME", "Server uptime opened: " + nameUpTime);
					if (global.GoatBot.config.serverUptime.socket?.enable == true)
						require('./socketIO.js')(server);
					global.serverUptimeRunning = true;
				}
				catch (err) {
					log.err("UPTIME", "Server uptime error: " + err);
				}
			}

			if (restartListenMqtt.enable == true) {
				if (restartListenMqtt.logNoti == true) {
					log.info("LISTEN_MQTT", "Restart listen after " + convertTime(restartListenMqtt.timeRestart, true));
					log.info("BOT_STARTED", "Bot started successfully");

					logColor("#f5ab00", character);
				}
				const restart = setInterval(async function () {
					if (restartListenMqtt.enable == false) {
						clearInterval(restart);
						return log.warn("LISTEN_MQTT", "Stop restart listen");
					}
					try {
						await stopListening();
						await sleep(1000);
						global.GoatBot.Listening = api.listenMqtt(createCallBackListen());
						log.info("LISTEN_MQTT", "Restart listen");
					}
					catch (e) {
						log.err("LISTEN_MQTT", "Restart listen error: " + e);
					}
				}, restartListenMqtt.timeRestart);
				global.intervalRestartListenMqtt = restart;
			}
			require('../autoUptime.js');
		});
	})(appState);

	if (global.GoatBot.config.autoReloginWhenChangeAccount) {
		setTimeout(function () {
			watch(dirAccount, async (type) => {
				if (type == 'change' && changeFbStateByCode == false && latestChangeContentAccount != fs.statSync(dirAccount).mtimeMs) {
					clearInterval(global.intervalRestartListenMqtt);
					global.compulsoryStopLisening = true;
					latestChangeContentAccount = fs.statSync(dirAccount).mtimeMs;
					startBot();
				}
			});
		}, 10000);
	}
}

global.GoatBot.reLoginBot = startBot;
startBot();
