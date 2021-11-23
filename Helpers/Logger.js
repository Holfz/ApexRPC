/* Dependencies */
const chalk = require('chalk');

/* Exports */
function logInfo(msg, context) {
    console.log(chalk.blue(`[${context == null ? "+" : context}]`) + ' ' + msg);
}

function logOk(msg, context) {
    console.log(chalk.green(`[${context == null ? "+" : context}]`) + ' ' + msg);
}

function logWarn(msg, context) {
    console.log(chalk.yellow(`[${context == null ? "+" : context}]`) + ' ' + msg);
}

function logError(msg, context) {
    console.log(chalk.red(`[${context == null ? "+" : context}]`) + ' ' + msg);
}

module.exports = {
    logInfo,
    logOk,
    logWarn,
    logError
}