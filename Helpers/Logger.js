/* Dependencies */
const winston = require('winston');

/* Logger */
const logLevel = process.env.LOG_LEVEL || 'info';
const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json(),
    ),
    timestamp: true,
    transports: []
});

logger.setLevels({
    debug:0,
    info: 1,
    silly:2,
    warn: 3,
    error:4,
});

if (logLevel === "debug") {
    logger.add(new winston.transports.Console({
        level: logLevel,
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.prettyPrint(),
            winston.format.splat(),
            winston.format.printf((info) => {
                if(info instanceof Error) {
                    return `[${info.level}] : ${info.timestamp} : ${info.message} ${info.stack}`;
                }
                return `[${info.level}] : ${info.timestamp} : ${info.message}`;
            })
        ),
        handleExceptions: true,
        humanReadableUnhandledException: true,
        exitOnError: false,
        timestamp:true
    }));
} else {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            //winston.format.colorize(),
            winston.format.cli(),
        )
    }));
}

logger.stream = {
    write: function(message, encoding){
        logger.info(message);
    }
};

/* Exports */
module.exports = logger;