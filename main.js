/* env */
require('dotenv').config();

/* Dependencies */
const DiscordRPC = require('discord-rpc');
const SteamUser = require('steam-user');
const prompts = require('prompts');

/* Helpers */
const { logInfo, logError, logWarn, logOk } = require('./Helpers/Logger');

/* Constants */
const Transation = require('./Constants/Transation');
const Gallery = require('./Constants/Gallery');

/* Variable */
const SteamClient = new SteamUser();
const RPC = new DiscordRPC.Client({ transport: 'ipc' });
let [discordReady, startTimestamp, playState] = [false, null, 0];

/* Main:STEAM */
logInfo('Logging in...', 'main:steam'); 
SteamClient.logOn({ 
    accountName: process.env.STEAM_USERNAME, 
    password: process.env.STEAM_PASSWORD,
    machineName: "HOLFZ-IS-HERE@1.0",
    dontRememberMachine: false
});

SteamClient.on('error', function(e) {
    if (e.eresult == 5) {
        return logError('Failed to login, Wrong password.', 'main:steam');
    }

    return logError(`Failed to login, Steam error with code: ${e.eresult}`, 'main:steam');
});

SteamClient.on('steamGuard', async function(domain, callback) {
    const response = await prompts({ type: 'text', name: 'code', message: 'Steam Guard: ' });
    if (!response || !response.code) {
        SteamClient.logOff();
        return logError('No Steam Guard code entered.', 'main:steam');
    }

    callback(response.code);
});

SteamClient.on('loggedOn', function(details) {
    logOk(`Logged in with steam vanity url: ${details.vanity_url}, Welcome.`, 'main:steam');
    SteamClient.setPersona(SteamUser.EPersonaState.Online);
});

SteamClient.on('playingState', function(blocked, playingApp) {
    if (playingApp == 1172470) {
        logInfo(`Seems you started to playing Apex Legends (AppID: ${playingApp}), Firing up DiscordRPC.`, 'main:steam');
        if (!discordReady) { RPC.login({ clientId: "893911040713191444" }); }
    } else {
        logInfo(`Seems you stopped to playing Apex Legends (AppID: ${playingApp}), Stop discord RPC.`, 'main:steam');
        if (discordReady) { RPC.destroy(); }
    }
});

SteamClient.on('disconnected', function(eresult, msg) {
    return logWarn(`Disconnected with code: ${Number(eresult)}`, 'main:steam');
});

SteamClient.on('user', function(sID, user) {
    if (!discordReady || sID.accountid !== SteamClient.steamID.accountid || !user.rich_presence) { return; }

    const status = user.rich_presence.find(data => data.key.toLowerCase() == "status");
    const steam_player_group_size = user.rich_presence.find(data => data.key.toLowerCase() == "steam_player_group_size");

    if (
        status && (
            status.value == "#PL_FIRINGRANGE" || 
            status.value == "#PL_TRAINING" ||
            status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_SHORT" || 
            status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_SHORTPLUS" ||
            status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_SQUADSLEFT"
        )
    ) {
        if (status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_SQUADSLEFT") {
            playState = 2;
        } else if (status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_SHORT") {
            playState = playState + 1;
        }

        if (!startTimestamp) { startTimestamp = new Date(); }
    } else {
        [startTimestamp, playState] = [null, 0];
    }

    const activity = { details: "", state: "", startTimestamp, largeImageKey: "apex-legends", instance: false };
    if (!status && !steam_player_group_size) {
        activity.details = Transation["#MAINMENU"];
    } else if (!status && steam_player_group_size) {
        const steam_player_group = user.rich_presence.find(data => data.key.toLowerCase() == "steam_player_group");
        if (!steam_player_group) {
            activity.details = Transation["#MAINMENU"];
        } else {
            activity.details = Transation["#LOADINGSCREEN"];
        }
    } else if (status.value == "#PL_FIRINGRANGE") {
        if (steam_player_group_size && steam_player_group_size.value > 1) {
            activity.details = Transation["#PL_FIRINGRANGE-PARTY"];
        } else {
            activity.details = Transation["#PL_FIRINGRANGE-ALONE"];
        }

        activity.largeImageKey = "firing-range";
    } else if (
        status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_SHORT" || 
        status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_SHORTPLUS" ||
        status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_SQUADSLEFT"
    ) {
        const gamemode = user.rich_presence.find(data => data.key.toLowerCase() == "gamemode");
        const level = user.rich_presence.find(data => data.key.toLowerCase() == "level");    
        const squadsleft = user.rich_presence.find(data => data.key.toLowerCase() == "squadsleft");
        
        activity.details = `${
            gamemode && Transation[gamemode.value] ? Transation[gamemode.value] : "Unknown Mode"
        }: ${
            level && Transation[level.value] ? Transation[level.value] : "Unknown Map"
        }`;

        if (playState == 2) {
            if (squadsleft) { activity.details += ` (${squadsleft.value} Squads Left)`; }
        } else {
            activity.details += ` (${playState == 1 ? "Legend Selection" : "Epilogue"})`;
        }

        if (level && Gallery[level.value]) { activity.largeImageKey = Gallery[level.value] }
    } else {
        activity.details = Transation[status.value] ? Transation[status.value] : "UNKNOWN, CONTACT HOLFZ";
        if (!Transation[status.value]) {
            logWarn(`UNKNOWN STATE: ${status.value}`, 'main:user:rpc');
            logWarn(`Report this data to holfz: `);
            console.log(user.rich_presence);
        }
    }

    if (steam_player_group_size) {
        activity.state = (steam_player_group_size.value > 1) ? "In the party" : "In the party alone";
        [activity.partySize, activity.partyMax] = [Number(steam_player_group_size.value), 3]; // NOTE: THIS IS HARDCODED
    } else {
        activity.state = `Not joining any party`;
    }

    RPC.setActivity(activity);
});

/* main:RPC */
RPC.on('ready', () => {
    logInfo('Discord RPC is ready.', 'main:RPC');
    discordReady = true;
});