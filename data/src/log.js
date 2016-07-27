import winston from 'winston'
import colors from 'colors'
import moment from 'moment'

export default function(name) {
    return new winston.Logger({
        'transports': [
            new winston.transports.Console({
                'formatter': options => {
                    let nameStr = `[${name}]`.blue;
                    let level;
                    switch (options.level) {
                        case 'error': level = 'error'.red; break
                        case 'warn': level = 'warn'.yellow; break;
                        default: level = options.level;
                    }
                    return `${moment().format()} ${`[${name}]`.blue} ${`${level}:`.bold} ${options.message}`;
                }
            }),
            new winston.transports.File({
                'filename': `logs/${name}.log`
            })
        ],
    });
}
