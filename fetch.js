import parseArgs from 'minimist'
import aggregators from './src/aggregators'
import queue from './src/queue'
import pa from './src/pa'
import s3 from './src/s3'

var argv = parseArgs(process.argv.slice(2), {'default': {'s3': true, 'pa': true, 'loop': true}});
if (argv.test) {
    argv.s3 = argv.pa = argv.loop = false;
}

var aggregatorWhitelist = argv._;
var paRequest = paDep => pa.request(paDep, !argv.pa);

aggregators
    .filter(aggregator => aggregatorWhitelist.length === 0 || aggregatorWhitelist.indexOf(aggregator.id) > -1)
    .forEach(aggregator => {
        function process() {
            console.log(`Processing ${aggregator.id}`);

            return Promise.all(aggregator.paDeps.map(paRequest)).then(contents => {
                if (aggregator.paMoreDeps) {
                    let moreDeps = aggregator.paMoreDeps.apply(null, contents);
                    return Promise.all(moreDeps.map(paRequest)).then(moreContents => contents.concat([moreContents]));
                } else {
                    return Promise.resolve(contents);
                }
            }).then(contents => {
                var out = aggregator.transform.apply(null, contents);
                if (argv.s3) {
                    return s3.put(aggregator.id, out, aggregator.cacheTime);
                }
            }).catch(err => {
                console.error(`Error processing ${aggregator.id}`, err);
                console.error(err.stack);
            })
            .then(() => {
                if (argv.loop) {
                    setTimeout(tick, aggregator.cacheTime.asMilliseconds())
                }
            })
        }

        function tick() {
            queue.add(process);
        }

        tick();
    });
