import util from 'util'
import parseArgs from 'minimist'
import moment from 'moment'
import fs from 'fs'
import path from 'path'
import mkdirp from 'mkdirp'
import denodeify from 'denodeify'
import aggregators from './src/aggregators'
import pa from './src/pa'
import s3 from './src/s3'
import notify from './src/notify'
import log from './src/log'
import config from './config'

import www from './www'

const fsWrite = denodeify(fs.writeFile.bind(fs));

const mainLogger = log('fetch');

var argv = parseArgs(process.argv.slice(2), {'default': {'s3': true, 'pa': true, 'loop': true, 'notify': true}});
if (argv.test) {
    argv.s3 = argv.pa = argv.loop = argv.notify = false;
}

var regExps = argv._.map(r => new RegExp(r))

async function writeData(name, data) {
    let localPath = `data-out/${name}.json`;
    await fsWrite(localPath, JSON.stringify(data, null, 2));
    if (argv.s3) await s3.put(name, data);
}

async function processCombiners([combiner, ...combiners], data, fallback=false) {
    if (!combiner) return data;

    let deps = combiner.dependencies ? combiner.dependencies(data) : [];
    mainLogger.info(`Requesting ${deps.length} resources for ${combiner.name}`);
    let contents = await Promise.all(deps.map(dep => pa.request(dep, !argv.pa)));

    let combinerData;

    try {
        combinerData = combiner.process(data, contents);
        await writeData(combiner.name, {
            'timestamp': (new Date).toISOString(),
            'data': combinerData,
            fallback
        });
    } catch (err) {
        logger.error(`Error processing ${combiner.name}`, err);
        logger.error(err.stack);
        if (argv.notify) {
            notify.send(`Error processing ${combiner.name}`, util.inspect(err));
        }

        if (combiner.required) {
            throw err;
        }
    }

    return await processCombiners(combiners, {...data, [combiner.name]: combinerData}, fallback);
}

function aggregatorFn(aggregator) {
    let logger = log(`aggregator:${aggregator.id}`);

    async function process() {
        logger.info('Starting');

        try {
            await processCombiners(aggregator.combiners, {});
        } catch (err) {
            if (aggregator.fallbackCombiners) {
                try {
                    await processCombiners(aggregator.fallbackCombiners, {}, true);
                } catch (err) {
                    logger.error('Fallbacks failed');
                }
            }
        }

        if (argv.loop) {
            logger.info('Next tick in', aggregator.cacheTime.humanize());
            setTimeout(process, aggregator.cacheTime.asMilliseconds());
        }
    }

    return process;
}

mkdirp.sync('data-out');

aggregators
    .filter(agg => regExps.length === 0 || regExps.some(r => r.test(agg.id)))
    .forEach(aggregator => {
        aggregatorFn(aggregator)();
    });

if (argv.loop) {
    www.run();
}
