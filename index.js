import aggregators from './src/aggregators'
import queue from './src/queue'
import pa from './src/pa'
import s3 from './src/s3'

aggregators.forEach(aggregator => {
    function process() {
        console.log(`Processing ${aggregator.id}`);

        return Promise.all(aggregator.paDeps.map(pa.request)).then(contents => {
            if (aggregator.paMoreDeps) {
                let moreDeps = aggregator.paMoreDeps.apply(null, contents);
                return Promise.all(moreDeps.map(pa.request)).then(moreContents => contents.concat([moreContents]));
            } else {
                return Promise.resolve(contents);
            }
        }).then(contents => {
            var out = aggregator.transform.apply(null, contents);
            return s3.put(aggregator.id, out, aggregator.cacheTime);
        }).then(() => {
            setTimeout(tick, aggregator.cacheTime.asMilliseconds())
        }).catch(err => {
            console.error(`Error processing ${aggregator.id}`, err);
            console.error(err.stack);
            setTimeout(tick, aggregator.cacheTime.asMilliseconds())
        });
    }

    function tick() {
        queue.add(process);
    }

    tick();
});
