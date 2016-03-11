import parseArgs from 'minimist'
import moment from 'moment'
import aggregators from './src/aggregators'
import queue from './src/queue'
import pa from './src/pa'
import s3 from './src/s3'

var argv = parseArgs(process.argv.slice(2), {'default': {'s3': true, 'pa': true, 'loop': true}});
if (argv.test) {
    argv.s3 = argv.pa = argv.loop = false;
}

var aggregatorWhitelist = argv._;

function getDeps(deps) {
    return Promise.all(deps.map(dep => pa.request(dep, !argv.pa)));
}

function aggregatorFn(aggregator) {
    function process() {
        console.log(`Processing ${aggregator.id}`);

        return getDeps(aggregator.paDeps).then(contents => {
            if (aggregator.paMoreDeps) {
                let moreDeps = aggregator.paMoreDeps.apply(null, contents);
                return getDeps(moreDeps).then(moreContents => contents.concat([moreContents]));
            } else {
                return Promise.resolve(contents);
            }
        }).then(contents => {
            var out = aggregator.transform.apply(null, contents);
            if (argv.s3) {
                return s3.put(aggregator.id, out);
            }
        }).catch(err => {
            console.error(`Error processing ${aggregator.id}`, err);
            console.error(err.stack);
        })
        .then(() => {
            if (argv.loop) {
                setTimeout(tick, aggregator.cacheTime.asMilliseconds())
            }
        });
    }

    function tick() {
        queue.add(process);
    }

    tick();
}

aggregators
    .filter(aggregator => aggregatorWhitelist.length === 0 || aggregatorWhitelist.indexOf(aggregator.id) > -1)
    .forEach(aggregatorFn);

if (argv.s3) {
    let meta = aggregators.map(aggregator => {
        return {
            'id': aggregator.id,
            'cacheTime': aggregator.cacheTime.asMilliseconds()
        };
    });
    s3.put('_aggregators', meta);
}
