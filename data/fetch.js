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

function getDeps(deps) {
    mainLogger.info(`Requesting ${deps.length} resources`);
    return Promise.all(deps.map(dep => pa.request(dep, !argv.pa)));
}

async function getMoreDeps([depFn, ...restDepFns], contents) {
    if (depFn) {
        let moreDeps = depFn(...contents);
        let moreContents = await getDeps(moreDeps);
        return await getMoreDeps(restDepFns, [...contents, moreContents]);
    } else {
        return contents;
    }
}

function aggregatorFn(aggregator) {
    let logger = log(`aggregator:${aggregator.id}`);

    async function process() {
        logger.info('Starting');

        try {
            let initialContents = await getDeps(aggregator.paDeps);
            let contents = await getMoreDeps(aggregator.paMoreDeps || [], initialContents);

            let data = aggregator.transform(...contents);
            let localPath = path.join('data-out/', aggregator.id + '.json');
            await fsWrite(localPath, JSON.stringify(data, null, 2));
            if (argv.s3) await s3.put(aggregator.id, data);
        } catch (err) {
            logger.error(`Error processing ${aggregator.id}`, err);
            logger.error(err.stack);
            if (argv.notify) {
                notify.send(`Error processing ${aggregator.id}`, `${util.inspect(err)}`);
            }
        }

        if (argv.loop) {
            logger.info('Next tick in', aggregator.cacheTime.humanize());
            setTimeout(process, aggregator.cacheTime.asMilliseconds());
        }
    }

    process();
    return process;
}

mkdirp.sync('data-out');

var aggregatorTickers = {};

aggregators
    .filter(agg => regExps.length === 0 || regExps.some(r => r.test(agg.id)))
    .forEach(aggregator => aggregatorTickers[aggregator.id] = aggregatorFn(aggregator));

if (argv.loop) {
    www.run(aggregatorTickers);
}
