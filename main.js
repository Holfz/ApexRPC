/* env */
require('dotenv').config();

/* Dependencies */
const DiscordRPC = require('discord-rpc');
const SteamUser = require('steam-user');
const prompts = require('prompts');
const find = require('find-process');
const exec = require('child_process').exec;
const Registry = require('winreg');

/* Helpers */
const logger = require('./Helpers/Logger');

/* Constants */
const Translation = require('./Constants/Translation');
const Gallery = require('./Constants/Gallery');
const Termination = require('./Constants/Termination');

/* Variable */
const SteamClient = new SteamUser();
const RPC = new DiscordRPC.Client({ transport: 'ipc' });
const appVersion = require('./package.json').version;
let [discordReady, startTimestamp, playState] = [false, null, 0];

/* Main:STEAM */
logger.info(`ApexRPC v${appVersion}`, 'main');
logger.info('Logging in...', 'main:steam');
SteamClient.logOn({
    accountName: process.env.STEAM_USERNAME,
    password: process.env.STEAM_PASSWORD,
    machineName: `ApexRPC@${appVersion}`,
    dontRememberMachine: false
});

SteamClient.on('error', function(e) {
    if (e.eresult == 5) {
        return logger.error('Failed to login, Wrong password.', 'main:steam');
    }

    return logger.error(`Failed to login, Steam error with code: ${e.eresult}`, 'main:steam');
});

SteamClient.on('steamGuard', async function(domain, callback) {
    const response = await prompts({ type: 'text', name: 'code', message: 'Steam Guard: ' });
    if (!response || !response.code) {
        SteamClient.logOff();
        return logger.error('No Steam Guard code entered.', 'main:steam');
    }

    callback(response.code);
});

SteamClient.on('loggedOn', async function(details) {
    logger.info(`Logged in with steam vanity url: ${details.vanity_url}, Welcome.`, 'main:steam');
    SteamClient.setPersona(SteamUser.EPersonaState.Online);

    if (!['yes', 'y', 'true'].includes(process.env.LAUNCH_APEX_IF_NESSESARY)) {
        logger.debug(`\`LAUNCH_APEX_IF_NESSESARY\` env is not set.`, 'main:steam');
        return;
    }

    const r5apex = await find('name', 'r5apex', true);
    if (r5apex.length > 0) {
        logger.debug(`Apex Legends is already running, bailing out.`, 'main:steam');
        return;
    }

    const steamReg = new Registry({ hive: Registry.HKCU, key: '\\Software\\Valve\\Steam\\ActiveProcess' });
    steamReg.values((err,res) => {
        if (err){
            logger.debug(`Steam is not installed, or the registry is mismatch, bailing out.`, 'main:steam');
            return;
        }

        logger.debug(`Automatically launching Apex Legends due to \`LAUNCH_APEX_IF_NESSESARY\` env is set.`, 'main:steam');
        exec('start "" steam://run/1172470', (error, stdout, stderr) => {
            if (error) {
                return logger.error(`Error while launching Apex Legends: ${error.message}`);
            }

            logger.info('Launched Apex Legends for you, Have fun!', 'main:steam')
        });
    });
});

SteamClient.on('playingState', function(blocked, playingApp) {
    if (playingApp == 1172470) {
        logger.info(`Seems you started to playing Apex Legends (AppID: ${playingApp}), Firing up DiscordRPC.`, 'main:steam');
        if (!discordReady) { RPC.login({ clientId: "893911040713191444" }); }
    } else {
        logger.info(`Seems you stopped to playing Apex Legends (AppID: ${playingApp}), Stop discord RPC.`, 'main:steam');
        if (discordReady) { RPC.destroy(); }
    }
});

SteamClient.on('disconnected', function(eresult, msg) {
    return logger.warn(`Disconnected with code: ${Number(eresult)}`, 'main:steam');
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
        activity.details = Translation["#MAINMENU"];
    } else if (!status && steam_player_group_size) {
        const steam_player_group = user.rich_presence.find(data => data.key.toLowerCase() == "steam_player_group");
        if (!steam_player_group) {
            activity.details = Translation["#MAINMENU"];
        } else {
            activity.details = Translation["#LOADINGSCREEN"];
        }
    } else if (status.value == "#PL_FIRINGRANGE") {
        if (steam_player_group_size && steam_player_group_size.value > 1) {
            activity.details = Translation["#PL_FIRINGRANGE-PARTY"];
        } else {
            activity.details = Translation["#PL_FIRINGRANGE-ALONE"];
        }

        activity.largeImageKey = "firing-range";
    } else if (
        status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_SHORT" || 
        status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_SHORTPLUS" ||
        status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_SQUADSLEFT" ||
        status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_TEAMSCORES2"
    ) {
        const gamemode = user.rich_presence.find(data => data.key.toLowerCase() == "gamemode");
        const level = user.rich_presence.find(data => data.key.toLowerCase() == "level");

        // This will self-fixing (more or less) any unknown map on existed map. (Not newly released map) on any mode.
        // By testing this, I didn't found any performance impacted problem on Ryzen 7 3700X (8 Core Processor)
        let parsedLevel = [];
        if (level && level.value) {
            // Fix for uppercase map like "#MP_RR_DIVIDED_MOON"
            level.value = level.value.toLowerCase();

            // If found the exactly level in Translation. Don't parse (It's maybe a reused or event maps)
            if (Translation[level.value]) {
                parsedLevel = level.value;
            } else {
                // If not found. Try parsing.
                // split the level value by "_" and looking for any known termination value.
                for (const e of level.value.split('_')) {
                    if (Termination.indexOf(e) !== -1) {
                        break;
                    }

                    parsedLevel.push(e);
                }

                // And then re-join together.
                parsedLevel = parsedLevel.join('_');
            }
        } else {
            parsedLevel = null;
        }

        activity.details = `${
            gamemode && Translation[gamemode.value] ? Translation[gamemode.value] : "Unknown Mode"
        }: ${
            parsedLevel && Translation[parsedLevel] ? Translation[parsedLevel] : "Unknown Map"
        }`;

        if (!level || !Translation[parsedLevel]) {
            logger.warn(`UNKNOWN LEVEL: ${parsedLevel}`, 'main:user:rpc');
        }

        if (
            status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_SHORT" ||
            status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_SHORTPLUS" ||
            status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_SQUADSLEFT"
        ) {
            const squadsleft = user.rich_presence.find(data => data.key.toLowerCase() == "squadsleft");
    
            if (playState == 2) {
                if (squadsleft) { activity.details += ` (${squadsleft.value} Squads Left)`; }
            } else {
                activity.details += ` (${playState == 1 ? "Legend Selection" : "Epilogue"})`;
            }
        }
        
        if (
            status.value == "#RICHPRESENCE_PLAYING_MULTIPLAYER_TEAMSCORES2"
        ) {
            const friendlyscore = user.rich_presence.find(data => data.key.toLowerCase() == "friendlyscore");
            const enemyscore = user.rich_presence.find(data => data.key.toLowerCase() == "enemyscore");
    
            activity.details += ` (${friendlyscore.value} - ${enemyscore.value})`; 
        }

        if (level && Gallery[parsedLevel]) {
            activity.largeImageKey = Gallery[parsedLevel]
        }
    } else {
        activity.details = Translation[status.value] ? Translation[status.value] : "UNKNOWN, CONTACT HOLFZ";
        if (!Translation[status.value]) {
            logger.warn(`UNKNOWN STATE: ${status.value}`, 'main:user:rpc');
            logger.warn(`Report this data to holfz: `);
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
    logger.info('Discord RPC is ready.', 'main:RPC');
    discordReady = true;
});