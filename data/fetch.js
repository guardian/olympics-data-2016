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

async function processInputs([input, ...inputs], data) {
    if (!input) return data;

    let deps = input.dependencies(data);
    mainLogger.info(`Requesting ${deps.length} resources for ${input.name}`);
    let contents = await Promise.all(deps.map(dep => pa.request(dep, !argv.pa)));

    let inputData = input.process(data, contents);
    await writeData(input.name, {
        'timestamp' : (new Date).toISOString(),
        'data' : inputData
    });

    return await processInputs(inputs, {...data, [input.name]: inputData});
}

async function writeData(name, data) {
    let localPath = `data-out/${name}.json`;
    await fsWrite(localPath, JSON.stringify(data, null, 2));
    if (argv.s3) await s3.put(name, data);
}

function aggregatorFn(aggregator) {
    let logger = log(`aggregator:${aggregator.id}`);

    async function process() {
        logger.info('Starting');

        try {
            let data = await processInputs(aggregator.inputs, {});

            await Promise.all(aggregator.outputs.map(output => {
                let outputData = {
                    'timestamp' : (new Date).toISOString(),
                    'data' : output.process(data)
                };
                return writeData(output.name, outputData);
            }));
        } catch (err) {
            logger.error(`Error processing ${aggregator.id}`, err);
            logger.error(err.stack);
            if (argv.notify) {
                notify.send(`Error processing ${aggregator.id}`, util.inspect(err));
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

var aggregatorTickers = {};

aggregators
    .filter(agg => regExps.length === 0 || regExps.some(r => r.test(agg.id)))
    .forEach(aggregator => {
        let tickFn = aggregatorFn(aggregator);
        aggregatorTickers[aggregator.id] = tickFn;

        tickFn();
    });

if (argv.loop) {
    www.run(aggregatorTickers);
}
