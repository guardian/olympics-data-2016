import winston from 'winston'
import colors from 'colors'

export default function(name) {
    return new winston.Logger({
        'transports': [
            new winston.transports.Console({
                'formatter': options => {
                    let nameStr = `[${name}]`.blue;
                    return `${`[${name}]`.blue} ${`${options.level}:`.bold} ${options.message}`;
                }
            }),
            new winston.transports.File({
                'filename': `logs/${name}.log`
            })
        ],
    });
}
